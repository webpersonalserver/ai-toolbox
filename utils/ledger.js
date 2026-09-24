// utils/ledger.js — 牌局记账前端接口层
// 读：优先用实时推送 watch（房间里任何人记账，其他人立刻看到）
// 写：全部走云函数，保证校验一致

async function callLedger(action, payload = {}) {
  let res
  try {
    res = await wx.cloud.callFunction({
      name: 'ledger',
      data: { action, ...payload }
    })
  } catch (err) {
    console.error('[ledger] callFunction 失败 action=' + action, JSON.stringify(err, null, 2))
    const e = new Error((err && (err.errMsg || err.message)) || '网络不太好，请再试一次')
    e.detail = err
    throw e
  }
  const r = res.result || {}
  if (r.code !== 0) {
    console.error('[ledger] 业务失败 action=' + action, JSON.stringify(r))
    const e = new Error(r.msg || '操作失败')
    e.bizCode = r.code
    e.detail = r
    throw e
  }
  return r.data
}

const RECENT_KEY = 'ledger_recent_rooms'

function getRecent() {
  try {
    const list = wx.getStorageSync(RECENT_KEY)
    return Array.isArray(list) ? list : []
  } catch (e) { return [] }
}

/** 记住这台手机进过的房间，方便下次一键回到牌桌 */
function saveRecent(room) {
  if (!room || !room.roomId) return getRecent()
  let list = getRecent().filter((x) => x.roomId !== room.roomId)
  list.unshift({
    roomId: room.roomId,
    code: room.code,
    name: room.name,
    status: room.status,
    ts: Date.now()
  })
  list = list.slice(0, 10)
  try { wx.setStorageSync(RECENT_KEY, list) } catch (e) { /* ignore */ }
  return list
}

function createRoom(name, members) {
  return callLedger('createRoom', { name, members })
}

function joinRoom(code) {
  return callLedger('joinRoom', { code }).then((d) => d.room)
}

function getRoom(roomId) {
  return callLedger('getRoom', { roomId }).then((d) => d.room)
}

function addEntries(roomId, entries, type, note) {
  return callLedger('addEntry', { roomId, entries, type, note }).then((d) => d.room)
}

function undo(roomId) {
  return callLedger('undo', { roomId }).then((d) => d.room)
}

function listRecords(roomId, limit) {
  return callLedger('listRecords', { roomId, limit }).then((d) => d.records)
}

function addMember(roomId, name) {
  return callLedger('addMember', { roomId, name }).then((d) => d.room)
}

function renameMember(roomId, memberId, name) {
  return callLedger('renameMember', { roomId, memberId, name }).then((d) => d.room)
}

function closeRoom(roomId) {
  return callLedger('closeRoom', { roomId }).then((d) => d.room)
}

function reopenRoom(roomId) {
  return callLedger('reopenRoom', { roomId }).then((d) => d.room)
}

/**
 * 实时订阅房间变化。需要把 rooms 集合权限设为「所有用户可读」，
 * 否则房间外的人 watch 不到（写入仍然只走云函数，安全没问题）。
 */
function watchRoom(roomId, onChange, onError) {
  const db = wx.cloud.database()
  return db.collection('rooms').doc(roomId).watch({
    onChange,
    onError: (e) => {
      console.warn('[ledger] watch 失败，将退化为手动刷新', e)
      if (onError) onError(e)
    }
  })
}

module.exports = {
  getRecent,
  saveRecent,
  createRoom,
  joinRoom,
  getRoom,
  addEntries,
  undo,
  listRecords,
  addMember,
  renameMember,
  closeRoom,
  reopenRoom,
  watchRoom
}
