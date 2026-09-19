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
// 老照片修复
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

/**
 * 老照片修复
 * 标准链：去色偏 →（上色）→ 增强（降噪+锐化）
 * 高清链：去色偏 → 降噪 → 超分 2x →（上色）→ 锐化
 *   先降噪再超分，避免把噪点一起放大；最后单独锐化补回细节。
 * @param {Buffer} imageBuf 原图
 * @param {object} opts { colorize: 是否上色, hd: 是否走超分高清链 }
 * @returns {string} 结果图的 COS 对象 Key
 */
async function restorePhoto(cosClient, imageBuf, opts = {}) {
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
  const hd = !!opts.hd

  // 高清链第一步：先把噪点压掉，再超分（超分会放大噪点）
  if (hd) {
    try {
      const denoised = await ciProcess(cosClient, curKey, 'ci-process=AIEnhanceImage&denoise=5&sharpen=0')
      curKey = `restore/dn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
      await uploadToCOS(cosClient, curKey, denoised)
    } catch (e) {
      console.error('[tci] 降噪失败，继续走超分:', e.message)
    }
    const sr = await ciProcess(cosClient, curKey, 'ci-process=AISuperResolution&magnify=2')
    curKey = `restore/sr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
    await uploadToCOS(cosClient, curKey, sr)
  }

  // 上色（可选）—— 独立接口 AIImageColoring
  if (opts.colorize) {
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

  // 最后一步：增强（高清链已经降过噪，这里只锐化；标准链降噪+锐化一起做）
  const q = hd
    ? 'ci-process=AIEnhanceImage&denoise=0&sharpen=4'
    : 'ci-process=AIEnhanceImage&denoise=5&sharpen=4'
  const outBuf = await ciProcess(cosClient, curKey, q)
  if (outBuf.length < 100) throw new Error('CI 返回异常（结果过小），请检查数据万象是否开通')

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
 * 证件照：人像抠图（CI）→ 换成指定底色 → 按规格裁剪缩放（纯 JS）
 * @param {Buffer} imageBuf 原图
 * @param {object} opts { bgColor: '#FFFFFF', spec: 'one_inch' }
 * @returns {Promise<string>} 结果图 Key
 */
async function makeIdPhoto(cosClient, imageBuf, opts = {}) {
  const spec = config.ID_SPECS[opts.spec] || config.ID_SPECS[config.ID_SPEC_DEFAULT]
  const bg = parseHexColor(opts.bgColor)

  // 0) 预处理：人脸智能裁剪
  //    按目标比例把人脸居中裁出来（去掉多余的身体/背景），构图才符合证件照规范。
  //    旧逻辑只按 alpha 包围盒缩放，全身照会缩成"头很小"，这是效果差的主因。
  let workBuf = imageBuf
  if (opts.faceCrop !== false) {
    const workH = Math.min(1200, spec.h * 3)              // 处理尺寸：规格高的 3 倍（上限 1200）
    const workW = Math.round(workH * spec.w / spec.h)
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

  // 1) 人像抠图，返回透明背景 PNG（数据万象 AIPortraitMatting）
  let matted
  try {
    matted = await ciProcess(cosClient, inKey, 'ci-process=AIPortraitMatting')
  } catch (e) {
    if (/403/.test(e.message)) {
      throw new Error('人像抠图无权限：请给子账号补授权（COS 数据读写 + 数据万象），或确认存储桶已绑定数据万象')
    }
    throw e
  }

  // 2) 解码 PNG
  let png
  try {
    png = decodePng(matted)
  } catch (e) {
    throw new Error('人像抠图结果解析失败（返回可能不是 PNG）：' + e.message)
  }
  const { width: sw, height: sh, data: src } = png

  // 3) 裁掉透明边，取人像实际包围盒
  const box = alphaBBox(src, sw, sh)
  if (!box) throw new Error('未识别人像：抠图结果中没有可见主体，请换一张清晰的正面照')
  // 透明像素占比过低说明抠图可能没生效（返回了原图）
  let transparent = 0
  for (let i = 3; i < src.length; i += 4) if (src[i] < 16) transparent++
  if (transparent / (sw * sh) < 0.01) {
    throw new Error('人像抠图未生效（结果无透明背景），请确认数据万象人像抠图已开通')
  }
  const cropped = cropRGBA(src, sw, box)

  // 4) 等比缩放：人像高度占画布 PORTRAIT_HEIGHT_RATIO，上下留白符合证件照规范
  const cw = spec.w
  const ch = spec.h
  let targetH = Math.round(ch * config.PORTRAIT_HEIGHT_RATIO)
  let targetW = Math.round((box.w / box.h) * targetH)
  const maxW = Math.round(cw * 0.96)
  if (targetW > maxW) {
    targetW = maxW
    targetH = Math.round((box.h / box.w) * targetW)
  }

  // 4.5) 边缘羽化：去掉抠图硬边和白边，换底后过渡更自然
  const feathered = featherAlpha(cropped, box.w, box.h)
  const scaled = resizeRGBA(feathered, box.w, box.h, targetW, targetH)

  // 5) 居中合成到纯色底
  const ox = Math.round((cw - targetW) / 2)
  const oy = Math.round((ch - targetH) / 2)
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
  _internal: { parseHexColor, alphaBBox, resizeRGBA, compositeOnColor, featherAlpha, deSepia }
}
