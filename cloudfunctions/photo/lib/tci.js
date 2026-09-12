// cloudfunctions/photo/lib/tci.js — 腾讯云数据万象(CI)封装
// 基于 COS + 数据万象：上传原图 → 带签名的 CI 同步处理 → 结果存回 COS
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
 * 从 COS 下载对象（用于把 CI 结果搬运到云存储）
 */
async function getFromCOS(cosClient, key) {
  const res = await cosClient.getObject({
    Bucket: config.BUCKET,
    Region: config.REGION,
    Key: key,
    DataType: 'arraybuffer'
  }).promise()
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

/**
 * 老照片修复：综合增强（降噪+细节+人脸增强）
 * @param {Buffer} imageBuf 原图
 * @param {object} opts { colorize: bool 是否上色 }
 * @returns {string} 结果图的 COS 对象 Key
 */
async function restorePhoto(cosClient, imageBuf, opts = {}) {
  const inKey = `restore/in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  await uploadToCOS(cosClient, inKey, imageBuf)

  // TODO 联调时按数据万象文档微调：AIEnhanceImage 若为异步任务接口，需改为提交任务+轮询
  // 文档：https://cloud.tencent.com/document/product/436/83792
  const query = 'ci-process=AIEnhanceImage&denoise=4&sharpen=3'
  const url = await signedCiUrl(cosClient, inKey, query)
  const res = await fetch(url)
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`CI 处理失败: HTTP ${res.status} ${errText.slice(0, 200)}`)
  }
  const outBuf = Buffer.from(await res.arrayBuffer())
  if (outBuf.length < 100) throw new Error('CI 返回异常（结果过小），请检查数据万象是否开通')

  const outKey = `restore/result-${Date.now()}.jpg`
  await cosClient.putObject({ Bucket: config.BUCKET, Region: config.REGION, Key: outKey, Body: outBuf }).promise()
  return outKey
}

/**
 * 证件照：人像分割 → 换底色 → 按规格合成
 * @param {Buffer} imageBuf 原图
 * @param {object} opts { bgColor: '#FFFFFF', spec: 'one_inch' }
 * @returns {string} 结果图 Key
 */
async function makeIdPhoto(cosClient, imageBuf, opts = {}) {
  const inKey = `idphoto/in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  await uploadToCOS(cosClient, inKey, imageBuf)

  // TODO 联调时实现：
  // 1. GET ?ci-process=SegmentPortraitFace 获取人像 mask（透明PNG，需签名请求）
  // 2. 云函数内用 sharp/jimp 将 mask 合成到指定底色画布上，并按规格(px)裁剪缩放
  // 3. 输出 outKey
  throw new Error('证件照合成逻辑待联调：需要 SegmentPortraitFace 返回格式确认后实现')
}

module.exports = { restorePhoto, makeIdPhoto, uploadToCOS, getFromCOS, signedCiUrl }
