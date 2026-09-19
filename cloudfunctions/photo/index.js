// cloudfunctions/photo/index.js — 入口
// 流程：小程序上传原图到云存储 → 传 fileID 过来 → 云函数下载 → 传 COS → CI 处理 → 结果上传云存储 → 返回 fileID
//
// 额度/白名单优先级：
//   ① 环境变量 DEV_OPENIDS / DEV_UNLIMITED（联调临时用）
//   ② members 集合（白名单 free / 会员 vip，支持到期时间）
//   ③ 免费额度 FREE_QUOTA 次/月
const cloud = require('wx-server-sdk')
const COS = require('cos-nodejs-sdk-v5')
const config = require('./config')
const tci = require('./lib/tci')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

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

// ---------------------------------------------------------------------------
// 白名单 / 会员
// ---------------------------------------------------------------------------

/**
 * 查询账号权益
 * @param {string} openid
 * @param {string} envVersion develop | trial | release（由小程序端 wx.getAccountInfoSync 传入）
 * @returns {{ unlimited: boolean, label: string, source: string|null, expireAt: Date|null }}
 */
async function getMembership(openid, envVersion) {
  // ⓪ 开发版 / 体验版：开发者与体验成员自动不限次（无需任何配置）
  if (config.ENV_FREE && (envVersion === 'develop' || envVersion === 'trial')) {
    return {
      unlimited: true,
      label: envVersion === 'develop' ? '开发者' : '体验成员',
      source: 'env-version',
      expireAt: null
    }
  }

  // ① 环境变量临时白名单
  if (config.DEV_OPENIDS.length) {
    if (config.DEV_OPENIDS.includes(openid)) {
      return { unlimited: true, label: '白名单', source: 'env', expireAt: null }
    }
  } else if (config.DEV_UNLIMITED) {
    return { unlimited: true, label: '测试模式', source: 'env-all', expireAt: null }
  }

  // ② members 集合（白名单 / 会员）
  try {
    const rec = (await db.collection(config.MEMBERS_COLLECTION).where({ openid }).get()).data[0]
    if (rec && rec.disabled !== true) {
      const expireMs = rec.expireAt ? new Date(rec.expireAt).getTime() : 0
      const valid = !rec.expireAt || expireMs > Date.now()
      if (valid) {
        const isVip = rec.level === 'vip'
        return {
          unlimited: true,
          label: isVip ? '会员' : '免费白名单',
          source: isVip ? 'vip' : 'free',
          expireAt: rec.expireAt || null
        }
      }
    }
  } catch (e) { /* 集合不存在时忽略 */ }

  return { unlimited: false, label: '', source: null, expireAt: null }
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
async function assertQuotaAvailable(openid, membership) {
  if (membership.unlimited) {
    return { unlimited: true, rec: null, used: 0, membership }
  }
  const rec = await getQuotaRecord(openid)
  if (!rec.isMember && rec.used >= config.FREE_QUOTA) {
    const err = new Error('QUOTA_EXCEEDED')
    err.used = rec.used
    err.free = config.FREE_QUOTA
    throw err
  }
  return { unlimited: false, rec, used: rec.used, membership }
}

/** 处理成功后扣减一次额度 */
async function commitQuota(quota) {
  if (quota.unlimited || !quota.rec) {
    return { used: quota.used, free: config.FREE_QUOTA, isMember: true, unlimited: true }
  }
  const used = quota.rec.used + 1
  await db.collection('quota').doc(quota.rec._id).update({
    data: { used, updatedAt: new Date() }
  })
  return { used, free: config.FREE_QUOTA, isMember: !!quota.rec.isMember, unlimited: false }
}

// ---------------------------------------------------------------------------
// 兑换码
// ---------------------------------------------------------------------------

/**
 * 兑换码核销：给当前账号开通免费白名单/会员
 * @returns {{ level: string, expireAt: Date|null, days: number }}
 */
async function redeemCode(openid, rawCode) {
  const code = String(rawCode || '').trim().toUpperCase()
  if (!code) throw new Error('请输入兑换码')

  const codeColl = db.collection(config.REDEEM_COLLECTION)
  let rec = null
  try {
    rec = (await codeColl.where({ code }).get()).data[0] || null
  } catch (e) {
    throw new Error('兑换功能未初始化：请先在云开发控制台创建 ' + config.REDEEM_COLLECTION + ' 集合')
  }
  if (!rec) throw new Error('兑换码无效')
  if (rec.disabled === true) throw new Error('该兑换码已停用')
  if (rec.expireAt && new Date(rec.expireAt).getTime() < Date.now()) throw new Error('该兑换码已过期')
  const maxUses = Number(rec.maxUses || 1)
  const usedCount = Number(rec.usedCount || 0)
  if (usedCount >= maxUses) throw new Error('该兑换码已被使用完')

  const days = Number(rec.days || 0)
  const memberColl = db.collection(config.MEMBERS_COLLECTION)
  let existing = null
  try {
    existing = (await memberColl.where({ openid }).get()).data[0] || null
  } catch (e) { /* 集合不存在，下一步会创建 */ }

  if (existing && Array.isArray(existing.redeemCodes) && existing.redeemCodes.indexOf(code) >= 0) {
    throw new Error('这个兑换码你已经用过了')
  }

  // 已是永久有效 → 保持永久，不被限时码降级
  const existingPermanent = existing && !existing.expireAt
  let expireAt = null
  if (!existingPermanent) {
    if (days > 0) {
      const baseMs = existing && existing.expireAt && new Date(existing.expireAt).getTime() > Date.now()
        ? new Date(existing.expireAt).getTime()
        : Date.now()
      expireAt = new Date(baseMs + days * 86400000)
    } else {
      expireAt = null // 永久
    }
  }

  const data = {
    level: rec.level === 'vip' ? 'vip' : 'free',
    expireAt,
    note: rec.note || '',
    updatedAt: new Date()
  }

  if (existing) {
    await memberColl.doc(existing._id).update({
      data: Object.assign({}, data, { redeemCodes: _.push(code) })
    })
  } else {
    await memberColl.add({
      data: Object.assign({ openid, redeemCodes: [code], createdAt: new Date() }, data)
    })
  }

  // 核销计数（仅当记录了 maxUses 时才有意义）
  try {
    await codeColl.doc(rec._id).update({ data: { usedCount: _.inc(1) } })
  } catch (e) { /* 忽略计数失败 */ }

  return { level: data.level, expireAt, days }
}

/**
 * 把某个 openid 永久写入免费白名单（level=free、不限次、永久有效）
 * @returns {{ level: string, expireAt: null, note: string }}
 */
async function grantFreeMember(openid, note) {
  const coll = db.collection(config.MEMBERS_COLLECTION)
  let existing = null
  try {
    existing = (await coll.where({ openid }).get()).data[0] || null
  } catch (e) {
    throw new Error('白名单未初始化：请先在云开发控制台创建 ' + config.MEMBERS_COLLECTION + ' 集合')
  }

  if (existing) {
    await coll.doc(existing._id).update({
      data: { level: 'free', expireAt: null, disabled: false, note: note || '', updatedAt: new Date() }
    })
  } else {
    await coll.add({
      data: { openid, level: 'free', expireAt: null, disabled: false, note: note || '', createdAt: new Date() }
    })
  }
  return { level: 'free', expireAt: null, note: note || '' }
}

// ---------------------------------------------------------------------------
// 文件流转
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

exports.main = async (event) => {
  // getWXContext() 返回的就是上下文对象（含 OPENID/APPID/ENV 等）
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action } = event
  // 小程序运行环境：develop（开发版）/ trial（体验版）/ release（正式版）
  const envVersion = event.env || 'release'

  try {
    // 体检：在云端真实调用一次三个数据万象接口，看哪个挂（不扣额度、不写业务数据）
    if (action === 'probe') {
      const startedAt = Date.now()
      const cosClient = getCosClient()
      const buf = Buffer.from(require('./lib/test-image'), 'base64')
      const key = `probe/in-${Date.now()}.jpg`
      await tci.uploadToCOS(cosClient, key, buf)

      const cases = [
        ['上色 AIImageColoring', 'ci-process=AIImageColoring'],
        ['增强 AIEnhanceImage', 'ci-process=AIEnhanceImage&denoise=4&sharpen=3'],
        ['抠图 AIPortraitMatting', 'ci-process=AIPortraitMatting']
      ]
      const data = {}
      for (const c of cases) {
        const t0 = Date.now()
        try {
          const out = await tci.ciProcess(cosClient, key, c[1])
          data[c[0]] = `ok（${out.length} 字节 / ${Date.now() - t0}ms）`
        } catch (e) {
          data[c[0]] = `FAIL(${Date.now() - t0}ms): ` + String(e.message).slice(0, 160)
        }
      }
      const total = Date.now() - startedAt
      return { code: 0, data, total }
    }

    // 自检：返回云端运行环境、依赖安装情况、配置是否到位（无副作用，不消耗额度）
    if (action === 'diagnose') {
      const mods = {}
      const list = ['pngjs', 'jpeg-js', 'cos-nodejs-sdk-v5', 'wx-server-sdk']
      for (const m of list) {
        try { require(m); mods[m] = 'ok' } catch (e) { mods[m] = 'FAIL: ' + e.message }
      }
      return {
        code: 0,
        data: {
          node: process.version,
          modules: mods,
          secretId: config.SECRET_ID ? config.SECRET_ID.slice(0, 8) + '...' : '(未配置)',
          bucket: config.BUCKET + ' / ' + config.REGION,
          freeQuota: config.FREE_QUOTA,
          envFree: config.ENV_FREE,
          devUnlimited: config.DEV_UNLIMITED,
          devPassSet: !!config.DEV_PASS,
          envVersion,
          openid,
          time: new Date().toISOString()
        }
      }
    }

    // 查询额度与权益（不扣减）
    if (action === 'quota') {
      const membership = await getMembership(openid, envVersion)
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
          isMember: membership.unlimited || (rec ? !!rec.isMember : false),
          unlimited: membership.unlimited,
          levelLabel: membership.label,
          levelSource: membership.source,
          expireAt: membership.expireAt,
          env: envVersion, // develop / trial / release
          openid // 便于把 openid 填进 DEV_OPENIDS 白名单或 members 集合
        }
      }
    }

    // 兑换码核销
    if (action === 'redeem') {
      const r = await redeemCode(openid, event.code)
      return { code: 0, data: r }
    }

    // 开发者口令：把当前微信永久加入免费白名单（自己人免额度用）
    if (action === 'bindMember') {
      if (!config.DEV_PASS) return { code: 40004, msg: '未配置开发者口令（DEV_PASS）' }
      if (String(event.pass || '').trim() !== config.DEV_PASS) {
        return { code: 40005, msg: '口令不正确' }
      }
      const info = await grantFreeMember(openid, event.note || '开发者口令')
      return { code: 0, data: info }
    }

    // 联调辅助：重置本人当月额度（仅测试模式可用）
    if (action === 'resetQuota') {
      const membership = await getMembership(openid, envVersion)
      if (!(membership.unlimited && membership.source && membership.source.indexOf('env') === 0)) {
        return { code: 40003, msg: '测试模式未开启，无法重置额度' }
      }
      const month = currentMonth()
      const coll = db.collection('quota')
      try {
        const rec = (await coll.where({ openid, month }).get()).data[0]
        if (rec) await coll.doc(rec._id).remove()
      } catch (e) { /* 忽略 */ }
      return { code: 0, data: { used: 0, free: config.FREE_QUOTA, isMember: false } }
    }

    const membership = await getMembership(openid, envVersion)

    // 老照片修复
    if (action === 'restore') {
      if (!event.fileID) throw new Error('缺少 fileID')
      const quota = await assertQuotaAvailable(openid, membership)
      const cosClient = getCosClient()
      const buf = await downloadOriginal(event.fileID)
      const outKey = await tci.restorePhoto(cosClient, buf, {
        colorize: !!event.colorize,
        hd: !!event.hd // 高清模式：降噪→超分 2x→上色→锐化（更慢、更清晰）
      })
      const { buffer: outBuf } = await tci.getFromCOS(cosClient, outKey)
      const resultFileID = await uploadResult(outBuf, outKey)
      const quotaAfter = await commitQuota(quota)
      return { code: 0, data: { fileID: resultFileID, key: outKey, quota: quotaAfter } }
    }

    // 证件照
    if (action === 'idphoto') {
      if (!event.fileID) throw new Error('缺少 fileID')
      const quota = await assertQuotaAvailable(openid, membership)
      const cosClient = getCosClient()
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
