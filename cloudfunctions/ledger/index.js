// cloudfunctions/ledger/index.js — 牌局记账
// 数据模型：
//   rooms   { code, name, ownerOpenid, members:[{id,name}], balances:{ memberId: Number }, status, entrySeq, createdAt, updatedAt }
//   records { roomId, seq, type, note, entries:[{memberId,name,delta}], byOpenid, undone, createdAt }
// 所有写操作都走云函数（数据库设为「仅管理端可读写」或「所有用户可读、仅创建者可写」），
// 余额用 db.command.inc 原子累加，多人同时记账也不会互相覆盖。

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const ROOMS = process.env.ROOMS_COLLECTION || 'rooms'
const RECORDS = process.env.RECORDS_COLLECTION || 'records'
const MAX_ABS = Number(process.env.MAX_ABS_AMOUNT || 1000000)  // 单笔金额上限
const MAX_MEMBERS = Number(process.env.MAX_MEMBERS || 12)
const MAX_ENTRY_SIZE = 24

function ok(data) { return { code: 0, data: data == null ? true : data } }

function biz(msg, code) { const e = new Error(msg); e.bizCode = code || 40000; throw e }

function cleanName(v, fallback) {
  const s = String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, 8)
  return s || fallback
}

function toInt(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  if (!Number.isFinite(n) || Math.floor(n) !== n) return null
  return n
}

async function genCode() {
  for (let i = 0; i < 8; i++) {
    const code = String(Math.floor(100000 + Math.random() * 900000))
    try {
      const r = await db.collection(ROOMS).where({ code, status: 'open' }).limit(1).get()
      if (!r.data || r.data.length === 0) return code
    } catch (e) { /* 集合不存在时忽略，继续尝试 */ }
  }
  return String(Date.now()).slice(-6)
}

async function loadRoom(roomId) {
  if (!roomId) return null
  try {
    const r = await db.collection(ROOMS).doc(roomId).get()
    return r.data || null
  } catch (e) { return null }
}

function shapeRoom(doc) {
  if (!doc) return null
  const balances = doc.balances || {}
  return {
    roomId: doc._id,
    code: doc.code,
    name: doc.name,
    status: doc.status || 'open',
    isOwner: false,              // 由调用方按 openid 覆盖
    entrySeq: doc.entrySeq || 0,
    members: (doc.members || []).map((m) => ({
      id: m.id,
      name: m.name,
      balance: Number(balances[m.id] || 0)
    })),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  }
}

/** 把 entries 合并成每个成员的总变动，并校验成员合法性 */
function mergeEntries(room, entries) {
  const valid = new Map((room.members || []).map((m) => [m.id, m]))
  const total = {}
  const touched = []
  for (const e of entries) {
    const id = String(e && e.memberId || '')
    const delta = toInt(e && e.delta)
    if (!valid.has(id)) biz('有成员不在房间里，请刷新后重试')
    if (delta === null || delta === 0) biz('金额需为非零整数')
    if (Math.abs(delta) > MAX_ABS) biz('单笔金额过大')
    if (total[id] === undefined) touched.push(id)
    total[id] = (total[id] || 0) + delta
  }
  return Object.keys(total).map((id) => ({
    memberId: id,
    name: valid.get(id).name,
    delta: total[id]
  })).filter((x) => x.delta !== 0)
}

/** 原子累加余额 + 写入一条流水 */
async function applyEntry(openid, roomId, touches, meta) {
  const updateData = {
    updatedAt: Date.now(),
    entrySeq: _.inc(1)
  }
  for (const t of touches) updateData['balances.' + t.memberId] = _.inc(t.delta)

  const rec = await db.collection(RECORDS).add({
    data: {
      roomId,
      type: meta.type || 'single',
      note: String(meta.note || '').slice(0, 20),
      entries: touches,
      byOpenid: openid,
      undone: false,
      createdAt: Date.now()
    }
  })

  try {
    await db.collection(ROOMS).doc(roomId).update({ data: updateData })
  } catch (e) {
    // 余额没写进去就把流水撤掉，避免出现"没人认领"的孤儿记录
    try { await db.collection(RECORDS).doc(rec._id).remove() } catch (e2) { /* ignore */ }
    throw e
  }
  return rec._id
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function createRoom(openid, payload) {
  const raw = Array.isArray(payload.members) ? payload.members : []
  const names = raw.map((v, i) => cleanName(v, '玩家' + (i + 1)))
  if (names.length < 2) biz('至少要 2 个人才能开局')
  if (names.length > MAX_MEMBERS) biz('最多 ' + MAX_MEMBERS + ' 个人')

  const now = Date.now()
  const members = names.map((name, i) => ({ id: 'm' + i + '_' + now.toString(36) + i, name }))
  const balances = {}
  members.forEach((m) => { balances[m.id] = 0 })

  const code = await genCode()
  const res = await db.collection(ROOMS).add({
    data: {
      code,
      name: cleanName(payload.name, '牌局'),
      ownerOpenid: openid,
      members,
      balances,
      status: 'open',
      entrySeq: 0,
      createdAt: now,
      updatedAt: now
    }
  })
  const room = shapeRoom(await loadRoom(res._id))
  room.isOwner = true
  return ok({ room })
}

async function joinRoom(payload) {
  const code = String(payload.code || '').trim()
  if (!/^\d{4,8}$/.test(code)) biz('房号是 4~8 位数字')
  let r
  try {
    r = await db.collection(ROOMS).where({ code }).limit(1).get()
  } catch (e) {
    biz('找不到这个房间，请确认房号')
  }
  if (!r.data || !r.data.length) biz('找不到这个房间，请确认房号')
  return ok({ room: shapeRoom(r.data[0]) })
}

async function getRoom(openid, payload) {
  const doc = await loadRoom(payload.roomId)
  if (!doc) biz('房间不存在或已被删除')
  const room = shapeRoom(doc)
  room.isOwner = room.ownerOpenid === openid
  return ok({ room })
}

async function addEntry(openid, payload) {
  const roomId = payload.roomId
  const doc = await loadRoom(roomId)
  if (!doc) biz('房间不存在')
  if (doc.status === 'closed') biz('这局已经结算了，需要继续请先重开房间')

  const entries = Array.isArray(payload.entries) ? payload.entries : []
  if (!entries.length) biz('没有记录内容')
  if (entries.length > MAX_ENTRY_SIZE) biz('一次记录的人数过多')

  const touches = mergeEntries(doc, entries)
  const recordId = await applyEntry(openid, roomId, touches, {
    type: payload.type || 'single',
    note: payload.note || ''
  })
  const room = shapeRoom(await loadRoom(roomId))
  room.isOwner = room.ownerOpenid === openid
  return ok({ room, recordId })
}

async function undo(openid, payload) {
  const roomId = payload.roomId
  const doc = await loadRoom(roomId)
  if (!doc) biz('房间不存在')
  if (doc.status === 'closed') biz('这局已经结算了，请先重开房间')

  const r = await db.collection(RECORDS)
    .where({ roomId, undone: false })
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()
  if (!r.data || !r.data.length) biz('没有可以撤销的记录')

  const last = r.data[0]
  const touches = last.entries.map((e) => ({
    memberId: e.memberId,
    name: e.name,
    delta: -Number(e.delta)
  }))

  const reverse = { updatedAt: Date.now(), entrySeq: _.inc(1) }
  for (const t of touches) reverse['balances.' + t.memberId] = _.inc(t.delta)

  await db.collection(RECORDS).doc(last._id).update({ data: { undone: true, undoneAt: Date.now() } })
  try {
    await db.collection(ROOMS).doc(roomId).update({ data: reverse })
  } catch (e) {
    try { await db.collection(RECORDS).doc(last._id).update({ data: { undone: false } }) } catch (e2) { /* ignore */ }
    throw e
  }

  const room = shapeRoom(await loadRoom(roomId))
  room.isOwner = room.ownerOpenid === openid
  return ok({ room, undoneRecordId: last._id })
}

async function listRecords(payload) {
  const limit = Math.min(50, Number(payload.limit) || 20)
  const r = await db.collection(RECORDS)
    .where({ roomId: payload.roomId })
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get()
  return ok({
    records: r.data.map((x) => ({
      id: x._id,
      type: x.type,
      note: x.note,
      entries: x.entries,
      undone: !!x.undone,
      createdAt: x.createdAt,
      mine: x.byOpenid === payload.openid
    }))
  })
}

/** 中途加人：新人余额从 0 开始，不影响已有记录 */
async function addMember(payload) {
  const doc = await loadRoom(payload.roomId)
  if (!doc) biz('房间不存在')
  const members = doc.members || []
  if (members.length >= MAX_MEMBERS) biz('最多 ' + MAX_MEMBERS + ' 个人，加不下了')
  const now = Date.now()
  const member = { id: 'm' + members.length + '_' + now.toString(36), name: cleanName(payload.name, '玩家' + (members.length + 1)) }

  const updateData = { members: _.push([member]), updatedAt: now }
  await db.collection(ROOMS).doc(payload.roomId).update({ data: updateData })
  return ok({ room: shapeRoom(await loadRoom(payload.roomId)) })
}

async function renameMember(openid, payload) {
  const doc = await loadRoom(payload.roomId)
  if (!doc) biz('房间不存在')
  const members = doc.members || []
  const idx = members.findIndex((m) => m.id === payload.memberId)
  if (idx < 0) biz('成员不存在')
  members[idx].name = cleanName(payload.name, members[idx].name)
  await db.collection(ROOMS).doc(payload.roomId).update({
    data: { members, updatedAt: Date.now() }
  })
  return ok({ room: shapeRoom(await loadRoom(payload.roomId)) })
}

async function setStatus(openid, payload, status) {
  const doc = await loadRoom(payload.roomId)
  if (!doc) biz('房间不存在')
  if (status === 'open' && doc.ownerOpenid !== openid) biz('只有建房的人可以重开')
  await db.collection(ROOMS).doc(payload.roomId).update({
    data: { status, updatedAt: Date.now() }
  })
  const room = shapeRoom(await loadRoom(payload.roomId))
  room.isOwner = room.ownerOpenid === openid
  return ok({ room })
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || ''
  const { action } = event

  try {
    switch (action) {
      case 'createRoom':   return await createRoom(openid, event)
      case 'joinRoom':     return await joinRoom(event)
      case 'getRoom':      return await getRoom(openid, event)
      case 'addEntry':     return await addEntry(openid, event)
      case 'undo':         return await undo(openid, event)
      case 'listRecords':  return await listRecords({ ...event, openid })
      case 'renameMember': return await renameMember(openid, event)
      case 'addMember':    return await addMember(event)
      case 'closeRoom':    return await setStatus(openid, event, 'closed')
      case 'reopenRoom':   return await setStatus(openid, event, 'open')
      default:             return { code: 40400, msg: '未知的 action: ' + action }
    }
  } catch (e) {
    console.error('[ledger] action=' + action + ' 失败:', e)
    return {
      code: e.bizCode || 50000,
      msg: e.bizCode ? e.message : ('服务出错：' + (e.message || '请稍后再试'))
    }
  }
}
