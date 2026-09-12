// cloudfunctions/photo/index.js — 入口
const cloud = require('wx-server-sdk')
const COS = require('cos-nodejs-sdk-v5')
const config = require('./config')
const tci = require('./lib/tci')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 简易 fetch（Node 16+ 自带）
const fetch = global.fetch || require('node-fetch')

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
  let rec
  try {
    rec = (await coll.where({ openid, month }).get()).data[0]
  } catch (e) { /* 集合不存在时走创建 */ }
  if (!rec) {
    await coll.add({ data: { openid, month, used: 0, isMember: false } })
    rec = { openid, month, used: 0, isMember: false }
  }
  if (!rec.isMember && rec.used >= config.FREE_QUOTA) {
    // TODO: 接入虚拟支付后，此处引导用户看激励广告或购买会员
    throw new Error('QUOTA_EXCEEDED')
  }
  await coll.doc(rec._id || (rec.openid + rec.month)).update({ data: { used: rec.used + 1 } }).catch(() => {})
  return { used: rec.used + 1, isMember: rec.isMember }
}

exports.main = async (event, context) => {
  const { wxContext } = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action } = event

  try {
    // 查询额度（不扣减）
    if (action === 'quota') {
      const now = new Date()
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const rec = (await db.collection('quota').where({ openid, month }).get()).data[0]
      return { code: 0, data: { used: rec ? rec.used : 0, free: config.FREE_QUOTA, isMember: rec ? rec.isMember : false } }
    }

    const cosClient = getCosClient()

    // 老照片修复
    if (action === 'restore') {
      await checkAndUseQuota(openid)
      const buf = Buffer.from(event.imageBase64, 'base64')
      const outKey = await tci.restorePhoto(cosClient, buf, { colorize: !!event.colorize })
      const url = `https://${config.BUCKET}.cos.${config.REGION}.myqcloud.com/${outKey}`
      return { code: 0, data: { url, key: outKey } }
    }

    // 证件照
    if (action === 'idphoto') {
      await checkAndUseQuota(openid)
      const buf = Buffer.from(event.imageBase64, 'base64')
      const outKey = await tci.makeIdPhoto(cosClient, buf, { bgColor: event.bgColor, spec: event.spec })
      const url = `https://${config.BUCKET}.cos.${config.REGION}.myqcloud.com/${outKey}`
      return { code: 0, data: { url, key: outKey } }
    }

    return { code: 40001, msg: '未知 action: ' + action }
  } catch (e) {
    if (e.message === 'QUOTA_EXCEEDED') return { code: 40010, msg: '免费次数已用完' }
    return { code: 50000, msg: e.message }
  }
}
