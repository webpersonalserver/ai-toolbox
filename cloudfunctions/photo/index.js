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

/** 当前月份标识，例如 2026-09 */
function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** 是否处于联调测试模式（不校验额度） */
function isDevUnlimited(openid) {
  if (config.DEV_OPENIDS.length) return config.DEV_OPENIDS.includes(openid)
  return config.DEV_UNLIMITED
}

/** 读取（必要时创建）当月额度记录 */
async function getQuotaRecord(openid) {
  const month = currentMonth()
  const coll = db.collection('quota')
  let rec = null
  try {
    rec = (await coll.where({ openid, month }).get()).data[0] || null
  } catch (e) { /* 集合不存在时走创建分支 */ }
  if (!rec) {
    const added = await coll.add({
      data: { openid, month, used: 0, isMember: false, createdAt: new Date() }
    })
    rec = { _id: added._id, openid, month, used: 0, isMember: false }
  }
  return rec
}

/**
 * 校验额度是否可用（只读，不扣减）
 * 关键点：扣减放在处理成功之后，避免「处理失败也吃掉次数」
 */
async function assertQuotaAvailable(openid) {
  if (isDevUnlimited(openid)) {
    return { unlimited: true, rec: null, used: 0 }
  }
  const rec = await getQuotaRecord(openid)
  if (!rec.isMember && rec.used >= config.FREE_QUOTA) {
    const err = new Error('QUOTA_EXCEEDED')
    err.used = rec.used
    err.free = config.FREE_QUOTA
    throw err
  }
  return { unlimited: false, rec, used: rec.used }
}

/** 处理成功后扣减一次额度 */
async function commitQuota(quota) {
  if (quota.unlimited || !quota.rec) return { used: quota.used, free: config.FREE_QUOTA, isMember: false }
  const used = quota.rec.used + 1
  await db.collection('quota').doc(quota.rec._id).update({
    data: { used, updatedAt: new Date() }
  })
  return { used, free: config.FREE_QUOTA, isMember: !!quota.rec.isMember }
}

/** 从云存储下载用户上传的原图 */
async function downloadOriginal(fileID) {
  const res = await cloud.downloadFile({ fileID })
  return res.fileContent // Buffer
}

/** 结果上传到云存储并返回 fileID */
async function uploadResult(buffer, key) {
  const res = await cloud.uploadFile({
    cloudPath: `results/${key}`,
    fileContent: buffer
  })
  return res.fileID
}

exports.main = async (event) => {
  // getWXContext() 返回的就是上下文对象（含 OPENID/APPID/ENV 等）
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action } = event

  try {
    // 查询额度（不扣减）
    if (action === 'quota') {
      const month = currentMonth()
      let rec = null
      try {
        rec = (await db.collection('quota').where({ openid, month }).get()).data[0] || null
      } catch (e) { /* 集合不存在 */ }
      return {
        code: 0,
        data: {
          used: rec ? rec.used : 0,
          free: config.FREE_QUOTA,
          isMember: rec ? !!rec.isMember : false,
          unlimited: isDevUnlimited(openid),
          openid // 便于把 openid 填进 DEV_OPENIDS 白名单
        }
      }
    }

    // 联调辅助：重置本人当月额度（仅测试模式可用）
    if (action === 'resetQuota') {
      if (!isDevUnlimited(openid)) return { code: 40003, msg: '测试模式未开启，无法重置额度' }
      const month = currentMonth()
      const coll = db.collection('quota')
      try {
        const rec = (await coll.where({ openid, month }).get()).data[0]
        if (rec) await coll.doc(rec._id).remove()
      } catch (e) { /* 忽略 */ }
      return { code: 0, data: { used: 0, free: config.FREE_QUOTA, isMember: false } }
    }

    const cosClient = getCosClient()

    // 老照片修复
    if (action === 'restore') {
      if (!event.fileID) throw new Error('缺少 fileID')
      const quota = await assertQuotaAvailable(openid)
      const buf = await downloadOriginal(event.fileID)
      const outKey = await tci.restorePhoto(cosClient, buf, { colorize: !!event.colorize })
      const { buffer: outBuf } = await tci.getFromCOS(cosClient, outKey)
      const resultFileID = await uploadResult(outBuf, outKey)
      const quotaAfter = await commitQuota(quota)
      return { code: 0, data: { fileID: resultFileID, key: outKey, quota: quotaAfter } }
    }

    // 证件照
    if (action === 'idphoto') {
      if (!event.fileID) throw new Error('缺少 fileID')
      const quota = await assertQuotaAvailable(openid)
      const buf = await downloadOriginal(event.fileID)
      const outKey = await tci.makeIdPhoto(cosClient, buf, {
        bgColor: event.bgColor,
        spec: event.specId
      })
      const { buffer: outBuf } = await tci.getFromCOS(cosClient, outKey)
      const resultFileID = await uploadResult(outBuf, outKey)
      const quotaAfter = await commitQuota(quota)
      return { code: 0, data: { fileID: resultFileID, key: outKey, quota: quotaAfter } }
    }

    return { code: 40001, msg: '未知 action: ' + action }
  } catch (e) {
    if (e.message === 'QUOTA_EXCEEDED') return { code: 40010, msg: '免费次数已用完' }
    console.error('[photo] action=' + action + ' 执行失败:', e && (e.stack || e.message))
    return { code: 50000, msg: e.message }
  }
}
