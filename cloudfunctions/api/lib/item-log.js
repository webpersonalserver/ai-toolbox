const { db } = require('./cloud')

const ITEM_LOG_REASONS = {
  SIGNUP: 'signup',
  CHECKIN: 'checkin',
  AD: 'ad',
  USE: 'use',
  MILESTONE: 'milestone',
  REFUND: 'refund'
}

const writeItemLogs = async (openid, deltas, reason, extra = {}) => {
  const entries = Object.keys(deltas)
    .filter((itemType) => deltas[itemType] !== 0)
    .map((itemType) => ({ openid, itemType, delta: deltas[itemType], reason, ...extra, createdAt: db.serverDate() }))
  try {
    await Promise.all(entries.map((entry) => db.collection('item_logs').add({ data: entry })))
  } catch (error) {
    console.error('writeItemLogs failed', entries, error)
  }
}

module.exports = { ITEM_LOG_REASONS, writeItemLogs }
