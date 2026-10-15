const { db, _ } = require('../lib/cloud')
const { loadRules } = require('../lib/rules')
const { DAY_MS, chinaDateKey } = require('../lib/date')
const { snapshotDailyStats } = require('../lib/stats')
const { ALL_GAME_TYPES } = require('../lib/games')
const { RESCUE_STATUS } = require('../lib/rescue-store')
const { snapshotActivity } = require('../lib/admin-overview')


const removeWhere = async (collectionName, condition) => {
  try {
    const { stats } = await db.collection(collectionName).where(condition).remove()
    return stats.removed
  } catch (error) {
    console.error(`cleanup ${collectionName} failed`, error)
    return 0
  }
}

// A helper's hearts for a rescue still open must stay (or they would refill a week later): only attempts on closed
// rescues are removed. The daily trigger works through them a batch at a time.
const ATTEMPT_CLEANUP_BATCH = 1000

const removeAttemptsOfClosedRescues = async (cutoffKey) => {
  try {
    const { data: attempts } = await db.collection('rescue_helper_attempts').where({ date: _.lt(cutoffKey) }).limit(ATTEMPT_CLEANUP_BATCH).get()
    const rescueIds = [...new Set(attempts.map((attempt) => attempt.rescueId))]
    const { data: openRescues } = rescueIds.length
      ? await db.collection('rescues').where({ _id: _.in(rescueIds), status: RESCUE_STATUS.OPEN }).limit(rescueIds.length).get()
      : { data: [] }
    const openIds = new Set(openRescues.map((rescue) => rescue._id))
    const closed = attempts.filter((attempt) => !openIds.has(attempt.rescueId))
    if (!closed.length) return 0
    const { stats } = await db.collection('rescue_helper_attempts').where({ _id: _.in(closed.map((attempt) => attempt._id)) }).remove()
    return stats.removed
  } catch (error) {
    console.error('cleanup rescue_helper_attempts failed', error)
    return 0
  }
}

const cleanupExpiredRecords = async () => {
  const rules = await loadRules()
  const { itemLogRetentionDays, dailyRecordRetentionDays } = rules.maintenance
  const now = Date.now()
  const itemLogCutoff = new Date(now - itemLogRetentionDays * DAY_MS)
  const dailyCutoffKey = chinaDateKey(now - dailyRecordRetentionDays * DAY_MS)
  const removed = {
    item_logs: await removeWhere('item_logs', { createdAt: _.lt(itemLogCutoff) }),
    daily: await removeWhere('daily', { date: _.lt(dailyCutoffKey) }),
    rescue_help_pairs: await removeWhere('rescue_help_pairs', { date: _.lt(dailyCutoffKey) }),
    rescue_helper_attempts: await removeAttemptsOfClosedRescues(dailyCutoffKey)
  }
  console.log('cleanupExpiredRecords', removed)
  return removed
}

// Hourly: each game's clear numbers, and today's active / new players for the 数据统计 trend.
const snapshotStats = async () => {
  const [games] = await Promise.all([Promise.all(ALL_GAME_TYPES.map((gameType) => snapshotDailyStats(gameType))), snapshotActivity()])
  return games
}

module.exports = { cleanupExpiredRecords, snapshotStats }
