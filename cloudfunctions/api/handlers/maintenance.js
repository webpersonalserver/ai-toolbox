const { db, _ } = require('../lib/cloud')
const { loadRules } = require('../lib/rules')
const { chinaDateKey } = require('../lib/date')
const { snapshotDailyStats } = require('../lib/stats')
const { GAME_TYPE } = require('./idiom')

const DAY_MS = 24 * 60 * 60 * 1000

const removeWhere = async (collectionName, condition) => {
  try {
    const { stats } = await db.collection(collectionName).where(condition).remove()
    return stats.removed
  } catch (error) {
    console.error(`cleanup ${collectionName} failed`, error)
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
    rescue_helper_attempts: await removeWhere('rescue_helper_attempts', { date: _.lt(dailyCutoffKey) })
  }
  console.log('cleanupExpiredRecords', removed)
  return removed
}

const snapshotStats = () => snapshotDailyStats(GAME_TYPE)

module.exports = { cleanupExpiredRecords, snapshotStats }
