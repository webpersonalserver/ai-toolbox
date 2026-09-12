// cloudfunctions/photo/lib/tci.js — 腾讯云数据万象(CI)封装
// 基于 COS + 数据万象：上传原图 → ci-process 同步处理 → 返回结果
const config = require('../config')

// Node 18+ 自带 fetch；部署云函数时运行时请选 Nodejs18.15 以上
const fetch = global.fetch || (() => { throw new Error('云函数运行时需选择 Node.js 18 以上') })

/**
 * 上传图片 Buffer 到 COS
 */
async function uploadToCOS(cosClient, key, buffer) {
  await cosClient.putObject({
    Bucket: config.BUCKET,
    Region: config.REGION,
    Key: key,
    Body: buffer
  }).promise()
  return key
}

/**
 * 构造 CI 处理后的对象地址（同步处理：结果直接写回 COS）
 * 文档：
 *  - 图像增强: GET ?ci-process=AIEnhanceImage （结果存回 COS）
 *  - 黑白上色: GET ?ci-process=S1 （自动上色）
 *  - 人像分割: GET ?ci-process=SegmentPortraitFace （返回人像 mask，用于换底）
 */
function ciProcessUrl(key, query) {
  const host = `${config.BUCKET}.cos.${config.REGION}.myqcloud.com`
  return `https://${host}/${encodeURIComponent(key)}?${query}`
}

/**
 * 老照片修复：综合增强（降噪+细节+人脸增强）
 * @param {Buffer} imageBuf 原图
 * @param {object} opts { colorize: bool 是否上色 }
 * @returns {string} 结果图的 COS 对象 Key
 */
async function restorePhoto(cosClient, imageBuf, opts = {}) {
  const inKey = `restore/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  await uploadToCOS(cosClient, inKey, imageBuf)

  // TODO 联调时按数据万象文档微调参数：denoise/sharpen 强度
  const outKey = `restore/result-${Date.now()}.jpg`
  // AIEnhanceImage 为异步任务接口时需改用提交任务+轮询；同步版直接带参数 GET
  // 具体以 https://cloud.tencent.com/document/product/436/83792 为准
  const query = `ci-process=AIEnhanceImage&denoise=4&sharpen=3&x-cos-traffic-limit=8192000`
  const url = ciProcessUrl(inKey, query)
  // 用 axios/fetch 请求 url，响应即处理后的图片流 → 存回 outKey
  const res = await fetch(url)
  if (!res.ok) throw new Error('CI 处理失败: HTTP ' + res.status)
  const outBuf = Buffer.from(await res.arrayBuffer())
  await cosClient.putObject({ Bucket: config.BUCKET, Region: config.REGION, Key: outKey, Body: outBuf }).promise()

  // 上色模式：再走一遍上色接口（联调时启用）
  // if (opts.colorize) { ... ci-process=S1 ... }
  return outKey
}

/**
 * 证件照：人像分割 → 换底色 → 按规格合成
 * @param {Buffer} imageBuf 原图
 * @param {object} opts { bgColor: '#FFFFFF', spec: 'one_inch' }
 * @returns {string} 结果图 Key
 */
async function makeIdPhoto(cosClient, imageBuf, opts = {}) {
  const inKey = `idphoto/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  await uploadToCOS(cosClient, inKey, imageBuf)

  // TODO 联调时实现：
  // 1. GET ?ci-process=SegmentPortraitFace 获取人像 mask（透明PNG）
  // 2. 云函数内用 sharp/jimp 将 mask 合成到指定底色画布上，并按规格(px)裁剪缩放
  // 3. 输出 outKey
  const outKey = `idphoto/result-${Date.now()}.png`
  throw new Error('证件照合成逻辑待联调：需要 SegmentPortraitFace 返回格式确认后实现')
}

module.exports = { restorePhoto, makeIdPhoto, uploadToCOS }
