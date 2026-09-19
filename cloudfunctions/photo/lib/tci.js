// cloudfunctions/photo/lib/tci.js — 腾讯云数据万象(CI)封装
// 基于 COS + 数据万象：上传原图 → 带签名的 CI 同步处理 → 结果存回 COS
const config = require('../config')

// 优先用 Node 18+ 内置 fetch，低版本运行时自动回退到 https 实现
const fetch = global.fetch || require('./fetch-polyfill')

// 纯 JS 图像处理（无原生依赖，云函数里不会出现 sharp 的二进制兼容问题）
const { PNG } = require('pngjs')
const jpeg = require('jpeg-js')

/**
 * COS SDK 返回的任务对象在不同版本下可能是 Promise、.promise() 任务、或者回调函数。
 * 这层包装自动适配三种情况，避免 SDK 版本差异导致 .promise is not a function。
 */
function cosTaskToPromise(task) {
  return new Promise((resolve, reject) => {
    if (task && typeof task.then === 'function' && typeof task.promise !== 'function') {
      task.then(resolve, reject)
    } else if (task && typeof task.promise === 'function') {
      task.promise().then(resolve, reject)
    } else if (typeof task === 'function') {
      task((err, data) => err ? reject(err) : resolve(data))
    } else {
      reject(new Error('COS SDK 返回了不可识别的任务对象'))
    }
  })
}

/**
 * 上传图片 Buffer 到 COS
 */
async function uploadToCOS(cosClient, key, buffer) {
  await cosTaskToPromise(cosClient.putObject({
    Bucket: config.BUCKET,
    Region: config.REGION,
    Key: key,
    Body: buffer
  }))
  return key
}

/**
 * 从 COS 下载对象（用于把 CI 结果搬运到云存储）
 */
async function getFromCOS(cosClient, key) {
  const res = await cosTaskToPromise(cosClient.getObject({
    Bucket: config.BUCKET,
    Region: config.REGION,
    Key: key,
    DataType: 'arraybuffer'
  }))
  return { buffer: Buffer.from(res.Body) }
}

/**
 * 生成带签名的 CI 处理 URL（私有读桶必须签名）
 * @param {string} key COS 对象 Key
 * @param {string} query 例如 "ci-process=AIEnhanceImage&denoise=4"
 */
function signedCiUrl(cosClient, key, query) {
  return new Promise((resolve, reject) => {
    cosClient.getObjectUrl({
      Bucket: config.BUCKET,
      Region: config.REGION,
      Key: key,
      Sign: true,
      Query: Object.fromEntries(new URLSearchParams(query)),
      Expires: 600
    }, (err, data) => {
      if (err) reject(err)
      else resolve(data.Url)
    })
  })
}

/** 带签名请求 CI 处理接口，返回结果二进制 */
async function ciProcess(cosClient, key, query) {
  const url = await signedCiUrl(cosClient, key, query)
  const res = await fetch(url)
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    const err = new Error(`CI 处理失败: HTTP ${res.status} ${errText.slice(0, 200)}`)
    err.ciQuery = query
    throw err
  }
  return Buffer.from(await res.arrayBuffer())
}

// ---------------------------------------------------------------------------
// 老照片修复：清晰度 + 色彩还原
// ---------------------------------------------------------------------------

/** alpha 边缘羽化（3x3 均值，只模糊 alpha），消除抠图硬边/白边 */
function featherAlpha(rgba, w, h) {
  const a = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) a[i] = rgba[i * 4 + 3]
  const out = Buffer.from(rgba)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy, xx = x + dx
          if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue
          s += a[yy * w + xx]; n++
        }
      }
      out[(y * w + x) * 4 + 3] = Math.round(s / n)
    }
  }
  return out
}

/**
 * 泛黄/褪色老照片先转灰度：AIImageColoring 对 sepia 色调很敏感，
 * 直接上色会偏蓝紫。判定：整图平均 (R-B) > 12 视为泛黄，转灰度后重编码 JPG。
 * @returns {Buffer|null} null = 无需处理
 */
function deSepia(buf) {
  let img = null
  let isPng = false
  try {
    if (buf[0] === 0x89 && buf[1] === 0x50) { img = PNG.sync.read(buf); isPng = true } // PNG
    else { img = jpeg.decode(buf, { useTArray: true }) }                               // JPEG
  } catch (e) { return null }
  if (!img || !img.data) return null
  const d = img.data
  const px = img.width * img.height
  if (px > 6000000) return null // 超大图跳过，避免云函数超时

  let sum = 0, n = 0
  const stride = 4 * Math.max(1, Math.floor(px / 20000))
  for (let i = 0; i < d.length; i += stride) { sum += d[i] - d[i + 2]; n++ }
  const avgRB = n ? sum / n : 0
  if (avgRB < 12) return null // 不泛黄，保留原色彩

  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
    d[i] = d[i + 1] = d[i + 2] = g
  }
  if (isPng) {
    return PNG.sync.write({ width: img.width, height: img.height, data: Buffer.from(d) })
  }
  return Buffer.from(jpeg.encode({ data: Buffer.from(d), width: img.width, height: img.height }, 95).data)
}

/** 只解析图片头拿宽高，避免全量解码（用于决定超分倍率） */
function imageSize(buf) {
  try {
    if (buf[0] === 0x89 && buf[1] === 0x50) {           // PNG: IHDR
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {            // JPEG: 找 SOFn
      let i = 2
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue }
        const m = buf[i + 1]
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }
        }
        i += 2 + buf.readUInt16BE(i + 2)
      }
    }
  } catch (e) { /* 解析失败走默认 */ }
  return { w: 0, h: 0 }
}

/** 解码任意 JPEG/PNG → { data(RGBA), w, h } */
function decodeAny(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    const p = decodePng(buf)
    return { data: Buffer.from(p.data), w: p.width, h: p.height }
  }
  const j = jpeg.decode(buf, { useTArray: true })
  return { data: Buffer.from(j.data), w: j.width, h: j.height }
}

/** 编码为 JPEG */
function encodeJpeg(img, quality = 94) {
  return Buffer.from(jpeg.encode({ data: img.data, width: img.w, height: img.h }, quality).data)
}

/**
 * 灰世界白平衡：把三通道均值拉到同一灰点，纠正色偏。
 * 修正幅度做限幅（默认 ±18%），避免大面积单色画面把整图带歪。
 */
function whiteBalance(img, limit = 0.18) {
  const d = img.data
  let sr = 0, sg = 0, sb = 0, n = 0
  for (let i = 0; i < d.length; i += 4 * 11) { sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; n++ }
  const mr = sr / (n || 1), mg = sg / (n || 1), mb = sb / (n || 1)
  const gray = (mr + mg + mb) / 3
  const clamp = (v) => Math.max(1 - limit, Math.min(1 + limit, v))
  const kr = clamp(gray / (mr || 1)), kg = clamp(gray / (mg || 1)), kb = clamp(gray / (mb || 1))
  if (Math.abs(kr - 1) < 0.005 && Math.abs(kg - 1) < 0.005 && Math.abs(kb - 1) < 0.005) return img

  const lr = new Uint8Array(256), lg = new Uint8Array(256), lb = new Uint8Array(256)
  for (let i = 0; i < 256; i++) {
    lr[i] = Math.min(255, Math.round(i * kr))
    lg[i] = Math.min(255, Math.round(i * kg))
    lb[i] = Math.min(255, Math.round(i * kb))
  }
  const data = Buffer.from(d)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lr[data[i]]; data[i + 1] = lg[data[i + 1]]; data[i + 2] = lb[data[i + 2]]
  }
  return { data, w: img.w, h: img.h }
}

/** 平均饱和度（HSV 的 S，百分比 0-100） */
function measureSaturation(img) {
  const d = img.data
  let sum = 0, n = 0
  for (let i = 0; i < d.length; i += 4 * 7) {
    const mx = Math.max(d[i], d[i + 1], d[i + 2])
    const mn = Math.min(d[i], d[i + 1], d[i + 2])
    sum += mx === 0 ? 0 : (mx - mn) / mx * 100
    n++
  }
  return n ? sum / n : 0
}

/**
 * 饱和度增益（保持亮度不变）：C' = Y + (C - Y) * gain
 * 只放大彩度，不动亮度，所以不会整体变亮/变暗。
 */
function applySatGain(img, gain) {
  if (gain <= 1.001) return img
  const d = Buffer.from(img.data)
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    const r = y + (d[i] - y) * gain
    const g = y + (d[i + 1] - y) * gain
    const b = y + (d[i + 2] - y) * gain
    d[i] = r < 0 ? 0 : r > 255 ? 255 : r
    d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g
    d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b
  }
  return { data: d, w: img.w, h: img.h }
}

/**
 * 色彩还原后处理：白平衡去色偏 + 自适应饱和度拉到"现代照片"水平。
 *
 * 为什么自适应：实测同一条链路上，480px 图上色后平均饱和度只有 8%，
 * 960px 上色后有 16%——固定增益会要么没变化、要么过饱和。
 * 所以先量当前饱和度，再算达到目标值所需的增益。
 *
 * @param {Buffer} buf 已上色/已增强的图
 * @param {object} opt { targetSat: 目标饱和度%, maxGain: 增益上限, maxPixels: 超过则跳过 }
 * @returns {Buffer} 处理后的 JPEG
 */
function enhanceColor(buf, opt = {}) {
  const targetSat = opt.targetSat == null ? 24 : opt.targetSat
  const maxGain = opt.maxGain == null ? 3.2 : opt.maxGain
  const maxPixels = opt.maxPixels || 2200000   // 约 1500x1500，超过就跳过本地处理避免云函数超时
  try {
    const img = decodeAny(buf)
    if (img.w * img.h > maxPixels) return buf
    let cur = whiteBalance(img)
    const sat = measureSaturation(cur)
    // 灰度图（没上色）饱和度为 0，增益无意义，只做白平衡
    const gain = sat < 0.5 ? 1 : Math.min(maxGain, Math.max(1, targetSat / sat))
    cur = applySatGain(cur, gain)
    return encodeJpeg(cur, 94)
  } catch (e) {
    console.error('[tci] 色彩还原失败，返回原图:', e.message)
    return buf
  }
}

/**
 * 老照片修复
 *
 * 清晰度链（实测结论，别随意调顺序）：
 *   降噪 → 超分 → 上色 → 锐化 → 色彩还原
 *  · 必须先降噪再超分，否则噪点会被一起放大
 *  · magnify=1 = 官方"清晰度增强"（不改分辨率），实测锐度提升最大（拉普拉斯能量 25→41）
 *  · magnify=2 = 分辨率翻倍，高清模式才走；放大后再跑一次 magnify=1 补锐度
 *  · 实测 4x 锐度反而不如 1x、耗时翻倍，故不使用
 *
 * @param {Buffer} imageBuf 原图
 * @param {object} opts { colorize: 是否上色, hd: 高清模式(分辨率翻倍), enhance: 清晰增强 }
 * @returns {Promise<string>} 结果图 COS Key
 */
async function restorePhoto(cosClient, imageBuf, opts = {}) {
  const colorize = !!opts.colorize
  const hd = !!opts.hd
  const enhance = opts.enhance !== false
  const t0 = Date.now()

  // 0) 去色偏（泛黄老照转灰度，上色更准）
  let srcBuf = imageBuf
  if (opts.deSepia !== false) {
    try {
      const g = deSepia(imageBuf)
      if (g) srcBuf = g
    } catch (e) { /* 失败就用原图 */ }
  }

  const inKey = `restore/in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  await uploadToCOS(cosClient, inKey, srcBuf)
  let curKey = inKey

  if (enhance) {
    // 1) 降噪（超分前必须先把噪点压掉）
    try {
      const denoised = await ciProcess(cosClient, curKey, 'ci-process=AIEnhanceImage&denoise=5&sharpen=0')
      curKey = `restore/dn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
      await uploadToCOS(cosClient, curKey, denoised)
    } catch (e) {
      console.error('[tci] 降噪失败，继续:', e.message)
    }

    // 2) 超分：高清模式先放大到 2 倍，再统一做一次清晰度增强
    const dim = imageSize(srcBuf)
    const longSide = Math.max(dim.w, dim.h)
    const plan = hd && longSide > 0 && longSide < 1400 ? [2, 1] : [1]
    for (const m of plan) {
      try {
        const sr = await ciProcess(cosClient, curKey, `ci-process=AISuperResolution&magnify=${m}`)
        curKey = `restore/sr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
        await uploadToCOS(cosClient, curKey, sr)
      } catch (e) {
        console.error(`[tci] 超分 magnify=${m} 失败，跳过:`, e.message)
      }
    }
  }

  // 3) 上色（可选）—— 独立接口 AIImageColoring
  if (colorize) {
    try {
      const colored = await ciProcess(cosClient, curKey, 'ci-process=AIImageColoring')
      const colorKey = `restore/mid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
      await uploadToCOS(cosClient, colorKey, colored)
      curKey = colorKey
    } catch (e) {
      // 上色失败不阻断主流程：回退到仅增强
      console.error('[tci] AIImageColoring 失败，回退为仅增强:', e.message)
    }
  }

  // 4) 锐化（收尾补细节；此时已是干净大图，只锐化不再降噪）
  let outBuf
  if (enhance) {
    outBuf = await ciProcess(cosClient, curKey, 'ci-process=AIEnhanceImage&denoise=0&sharpen=4')
  } else {
    outBuf = (await getFromCOS(cosClient, curKey)).buffer
  }
  if (outBuf.length < 100) throw new Error('CI 返回异常（结果过小），请检查数据万象是否开通')

  // 5) 色彩还原：白平衡去色偏 + 自适应饱和度（让色彩接近现代照片）
  //    仅对上色结果生效；不上色时白平衡对灰度图无副作用，也保留（纠正残留色偏）
  outBuf = enhanceColor(outBuf, {
    targetSat: opts.targetSat == null ? (colorize ? 24 : 0) : opts.targetSat,
    maxGain: opts.maxGain || 3.2
  })

  console.log('[tci] restorePhoto 总耗时', Date.now() - t0, 'ms，输出', outBuf.length, '字节')
  const outKey = `restore/result-${Date.now()}.jpg`
  await uploadToCOS(cosClient, outKey, outBuf)
  return outKey
}

// ---------------------------------------------------------------------------
// 证件照：人像抠图 → 换底色 → 按规格合成（纯 JS 实现）
// ---------------------------------------------------------------------------

/**
 * 数据万象返回的 PNG 尾部可能带几个多余字节（IEND 之后的垃圾数据），
 * pngjs 会因此报 "unrecognised content at end of stream"，这里先裁到 IEND 结束处。
 * PNG 结构：... [长度4][类型4=IEND][CRC4]
 */
function trimPng(buf) {
  const iend = buf.indexOf(Buffer.from('IEND', 'ascii'))
  if (iend === -1 || iend < 4) return buf
  return buf.slice(0, iend + 8)
}

/** 解码 PNG，兼容尾部带垃圾字节的情况 */
function decodePng(buf) {
  try {
    return PNG.sync.read(buf)
  } catch (e) {
    const trimmed = trimPng(buf)
    if (trimmed.length === buf.length) throw e
    return PNG.sync.read(trimmed)
  }
}

/** 解析 #RGB / #RRGGBB → [r,g,b] */
function parseHexColor(hex) {
  const s = String(hex || '#FFFFFF').replace('#', '').trim()
  const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s
  const n = parseInt(full, 16)
  if (isNaN(n) || full.length !== 6) return [255, 255, 255]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** 找出非透明像素的包围盒；全透明返回 null */
function alphaBBox(rgba, w, h, threshold = 16) {
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) {
    const rowBase = y * w
    for (let x = 0; x < w; x++) {
      if (rgba[(rowBase + x) * 4 + 3] > threshold) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/** 裁剪 RGBA */
function cropRGBA(rgba, w, box) {
  const out = Buffer.alloc(box.w * box.h * 4)
  for (let y = 0; y < box.h; y++) {
    const start = ((box.y + y) * w + box.x) * 4
    rgba.copy(out, y * box.w * 4, start, start + box.w * 4)
  }
  return out
}

/**
 * 双线性缩放 RGBA（按 alpha 预乘，避免边缘出现黑边/白边）
 */
function resizeRGBA(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4)
  const xr = sw / dw
  const yr = sh / dh
  for (let y = 0; y < dh; y++) {
    let sy = (y + 0.5) * yr - 0.5
    if (sy < 0) sy = 0
    const y0 = Math.floor(sy)
    const y1 = Math.min(sh - 1, y0 + 1)
    const wy = sy - y0
    for (let x = 0; x < dw; x++) {
      let sx = (x + 0.5) * xr - 0.5
      if (sx < 0) sx = 0
      const x0 = Math.floor(sx)
      const x1 = Math.min(sw - 1, x0 + 1)
      const wx = sx - x0

      let r = 0, g = 0, b = 0, a = 0
      const samples = [
        [x0, y0, (1 - wx) * (1 - wy)],
        [x1, y0, wx * (1 - wy)],
        [x0, y1, (1 - wx) * wy],
        [x1, y1, wx * wy]
      ]
      for (let k = 0; k < 4; k++) {
        const px = samples[k][0]
        const py = samples[k][1]
        const weight = samples[k][2]
        if (weight <= 0) continue
        const i = (py * sw + px) * 4
        const pa = src[i + 3] / 255
        r += src[i] * pa * weight
        g += src[i + 1] * pa * weight
        b += src[i + 2] * pa * weight
        a += pa * weight
      }
      const o = (y * dw + x) * 4
      if (a > 0.0001) {
        out[o] = Math.min(255, Math.round(r / a))
        out[o + 1] = Math.min(255, Math.round(g / a))
        out[o + 2] = Math.min(255, Math.round(b / a))
      }
      out[o + 3] = Math.min(255, Math.round(a * 255))
    }
  }
  return out
}

/** 把人像合成到纯色画布上 */
function compositeOnColor(portrait, pw, ph, cw, ch, ox, oy, bg) {
  const out = Buffer.alloc(cw * ch * 4)
  for (let i = 0; i < cw * ch; i++) {
    const o = i * 4
    out[o] = bg[0]
    out[o + 1] = bg[1]
    out[o + 2] = bg[2]
    out[o + 3] = 255
  }
  for (let y = 0; y < ph; y++) {
    const cy = y + oy
    if (cy < 0 || cy >= ch) continue
    for (let x = 0; x < pw; x++) {
      const cx = x + ox
      if (cx < 0 || cx >= cw) continue
      const si = (y * pw + x) * 4
      const a = portrait[si + 3] / 255
      if (a <= 0) continue
      const di = (cy * cw + cx) * 4
      out[di] = Math.round(portrait[si] * a + out[di] * (1 - a))
      out[di + 1] = Math.round(portrait[si + 1] * a + out[di + 1] * (1 - a))
      out[di + 2] = Math.round(portrait[si + 2] * a + out[di + 2] * (1 - a))
    }
  }
  return out
}

/**
 * 人像抠图（带重试）
 * 数据万象偶发返回"未抠图的原图"（无透明背景），直接合成会得到一张原图塞进画布的废片，
 * 所以每次都校验透明像素占比，不合格就重试。
 */
async function matteWithRetry(cosClient, key, times = 2) {
  let lastErr = null
  for (let i = 0; i < times; i++) {
    try {
      const buf = await ciProcess(cosClient, key, 'ci-process=AIPortraitMatting')
      const img = decodePng(buf)
      let transparent = 0
      for (let j = 3; j < img.data.length; j += 4) if (img.data[j] < 16) transparent++
      const ratio = transparent / (img.width * img.height)
      if (ratio > 0.01) return { buf, img, transparentRatio: ratio }
      lastErr = new Error('人像抠图未生效（结果无透明背景）')
      console.error(`[tci] 第 ${i + 1} 次抠图未生效，透明像素占比 ${(ratio * 100).toFixed(2)}%`)
    } catch (e) {
      lastErr = e
      console.error(`[tci] 第 ${i + 1} 次抠图失败:`, e.message)
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  if (lastErr && /403/.test(lastErr.message)) {
    throw new Error('人像抠图无权限：请给子账号补授权（COS 数据读写 + 数据万象），或确认存储桶已绑定数据万象')
  }
  throw lastErr || new Error('人像抠图失败')
}

/**
 * 证件照：统一底片 → 人像抠图 → 换底色 → 按规格等比合成（纯 JS）
 *
 * 关键点：所有规格共用同一张"底片"（固定比例的人脸居中裁剪），
 * 换尺寸 = 同一份人像等比缩放 + 重新留白，而不是每个尺寸重新裁剪一遍。
 * 这样同一张照片在一寸/二寸/小二寸下的构图才是一致的。
 *
 * @param {Buffer} imageBuf 原图
 * @param {object} opts { bgColor: '#FFFFFF', spec: 'one_inch' }
 * @returns {Promise<string>} 结果图 Key
 */
async function makeIdPhoto(cosClient, imageBuf, opts = {}) {
  const spec = config.ID_SPECS[opts.spec] || config.ID_SPECS[config.ID_SPEC_DEFAULT]
  const bg = parseHexColor(opts.bgColor)

  // 0) 统一底片：按固定比例做一次人脸居中裁剪（与规格无关）
  //    原图过小才放大到 600 保证抠图精度，过大则压到上限避免抠图失败。
  let workBuf = imageBuf
  if (opts.faceCrop !== false) {
    const dim = imageSize(imageBuf)
    const maxSide = config.ID_MATTE_MAX_SIDE || 1000
    const workH = dim.h > 0 ? Math.min(maxSide, Math.max(600, dim.h)) : maxSide
    const workW = Math.round(workH * (config.ID_BASE_RATIO || 0.78))
    const rawKey = `idphoto/raw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
    await uploadToCOS(cosClient, rawKey, imageBuf)
    try {
      workBuf = await ciProcess(cosClient, rawKey,
        `imageMogr2/thumbnail/x${workH}/gravity/face/crop/${workW}x${workH}`)
    } catch (e) {
      // 未开通人脸智能裁剪 / 无人脸 → 回退原图
      console.error('[tci] 人脸智能裁剪不可用，回退原图:', e.message)
      workBuf = imageBuf
    }
  }

  const inKey = `idphoto/in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  await uploadToCOS(cosClient, inKey, workBuf)

  // 1) 人像抠图（带重试），返回透明背景 PNG
  const { img: png } = await matteWithRetry(cosClient, inKey)
  const { width: sw, height: sh, data: src } = png

  // 2) 裁掉透明边，取人像实际包围盒
  const box = alphaBBox(src, sw, sh)
  if (!box) throw new Error('未识别人像：抠图结果中没有可见主体，请换一张清晰的正面照')
  const cropped = cropRGBA(src, sw, box)

  // 3) 等比缩放到目标画布
  //    规则：头顶留白固定 8%；人像先按肩宽 92% 缩放，超出可用高度就按高度收，
  //    人像过矮（原图人像很宽）则撑到 72% 高度、两侧肩膀裁掉——全程保持宽高比，绝不拉伸。
  const cw = spec.w
  const ch = spec.h
  const topPx = Math.round(ch * (config.ID_TOP_RATIO || 0.08))
  const bottomPx = Math.round(ch * 0.02)
  const usableH = Math.max(1, ch - topPx - bottomPx)
  const boxRatio = box.w / box.h

  let targetW = Math.round(cw * (config.ID_WIDTH_RATIO || 0.92))
  let targetH = Math.round(targetW / boxRatio)
  if (targetH > usableH) {
    targetH = usableH
    targetW = Math.round(targetH * boxRatio)
  }
  const minH = Math.round(ch * (config.ID_MIN_HEIGHT_RATIO || 0.72))
  if (targetH < minH) {
    targetH = Math.min(usableH, minH)
    targetW = Math.round(targetH * boxRatio)
  }

  // 4) 边缘羽化：去掉抠图硬边和白边，换底后过渡更自然
  const feathered = featherAlpha(cropped, box.w, box.h)
  const scaled = resizeRGBA(feathered, box.w, box.h, targetW, targetH)

  // 5) 水平居中、顶部对齐合成到纯色底（targetW 超出画布时两侧自然裁掉）
  const ox = Math.round((cw - targetW) / 2)
  const oy = topPx
  const composed = compositeOnColor(scaled, targetW, targetH, cw, ch, ox, oy, bg)

  // 6) 输出 JPG（证件照上传系统普遍要求 JPG）
  const outBuf = Buffer.from(jpeg.encode({ data: composed, width: cw, height: ch }, 92).data)

  const outKey = `idphoto/result-${Date.now()}-${opts.spec || config.ID_SPEC_DEFAULT}.jpg`
  await uploadToCOS(cosClient, outKey, outBuf)
  return outKey
}

module.exports = {
  restorePhoto,
  makeIdPhoto,
  uploadToCOS,
  getFromCOS,
  signedCiUrl,
  ciProcess,
  // 导出内部函数便于本地测试
  _internal: {
    parseHexColor, alphaBBox, resizeRGBA, compositeOnColor, featherAlpha, deSepia,
    imageSize, whiteBalance, measureSaturation, applySatGain, enhanceColor, decodeAny, encodeJpeg
  }
}
