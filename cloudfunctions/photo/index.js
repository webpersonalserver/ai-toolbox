// cloudfunctions/photo/index.js — 入口
// 流程：小程序上传原图到云存储 → 传 fileID 过来 → 云函数下载 → 传 COS → CI 处理 → 结果上传云存储 → 返回 fileID
const cloud = require('wx-server-sdk')
const COS = require('cos-nodejs-sdk-v5')
const config = require('./config')
const tci = require('./lib/tci')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function getCosClient() {
  if (!config.SECRET_ID || !config.SECRET_KEY) {
    throw new Error('缺少腾讯云密钥：请在云函数环境变量中配置 TENCENT_SECRET_ID / TENCENT_SECRET_KEY')
  }
  return new COS({ SecretId: config.SECRET_ID, SecretKey: config.SECRET_KEY })
}

/**
 * 检查并扣减用户当月免费额度
 */
async function checkAndUseQuota(openid) {
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const coll = db.collection('quota')
  let rec = null
  try {
    rec = (await coll.where({ openid, month }).get()).data[0] || null
  } catch (e) { /* 集合不存在时走创建 */ }
  if (!rec) {
    const added = await coll.add({ data: { openid, month, used: 0, isMember: false } })
    rec = { _id: added._id, used: 0, isMember: false }
  }
  if (!rec.isMember && rec.used >= config.FREE_QUOTA) {
    // TODO: 接入虚拟支付后，此处引导用户看激励广告或购买会员
    throw new Error('QUOTA_EXCEEDED')
  }
  await coll.doc(rec._id).update({ data: { used: rec.used + 1 } })
  return { used: rec.used + 1, isMember: rec.isMember }
}

/**
 * 从云存储下载用户上传的原图
 */
async function downloadOriginal(fileID) {
  const res = await cloud.downloadFile({ fileID })
  return res.fileContent // Buffer
}

/**
 * 结果上传到云存储并返回 fileID
 */
async function uploadResult(buffer, key) {
  const res = await cloud.uploadFile({
    cloudPath: `results/${key}`,
    fileContent: buffer
  })
  return res.fileID
}

exports.main = async (event) => {
  const { wxContext } = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action } = event

  try {
    // 查询额度（不扣减）
    if (action === 'quota') {
      const now = new Date()
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      let rec = null
      try {
        rec = (await db.collection('quota').where({ openid, month }).get()).data[0] || null
      } catch (e) { /* 集合不存在 */ }
      return { code: 0, data: { used: rec ? rec.used : 0, free: config.FREE_QUOTA, isMember: rec ? rec.isMember : false } }
    }

    const cosClient = getCosClient()

    // 老照片修复
    if (action === 'restore') {
      if (!event.fileID) throw new Error('缺少 fileID')
      await checkAndUseQuota(openid)
      const buf = await downloadOriginal(event.fileID)
      const outKey = await tci.restorePhoto(cosClient, buf, { colorize: !!event.colorize })
      const { buffer: outBuf } = await tci.getFromCOS(cosClient, outKey)
      const resultFileID = await uploadResult(outBuf, outKey)
      return { code: 0, data: { fileID: resultFileID, key: outKey } }
    }

    // 证件照
    if (action === 'idphoto') {
      if (!event.fileID) throw new Error('缺少 fileID')
      await checkAndUseQuota(openid)
      const buf = await downloadOriginal(event.fileID)
      const outKey = await tci.makeIdPhoto(cosClient, buf, { bgColor: event.bgColor, spec: event.specId })
      const { buffer: outBuf } = await tci.getFromCOS(cosClient, outKey)
      const resultFileID = await uploadResult(outBuf, outKey)
      return { code: 0, data: { fileID: resultFileID, key: outKey } }
    }

    return { code: 40001, msg: '未知 action: ' + action }
  } catch (e) {
    if (e.message === 'QUOTA_EXCEEDED') return { code: 40010, msg: '免费次数已用完' }
    return { code: 50000, msg: e.message }
  }
}
