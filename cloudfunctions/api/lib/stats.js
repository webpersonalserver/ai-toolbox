const { db, _ } = require('./cloud')
const { todayInChina } = require('./date')
const { countLevels } = require('./level-count')

const RATE_PRECISION = 10000

const computeClearStats = async (gameType) => {
  const totalLevels = await countLevels(gameType)
  const [{ total: totalUsers }, { total: clearedUsers }, { total: completionsToday }] = await Promise.all([
    db.collection('users').count(),
    totalLevels > 0
      ? db.collection('progress').where({ gameType, solvedCount: _.gte(totalLevels) }).count()
      : Promise.resolve({ total: 0 }),
    db.collection('completions').where({ gameType, date: todayInChina() }).count()
  ])
  return {
    gameType,
    totalLevels,
    totalUsers,
    clearedUsers,
    clearRate: totalUsers ? Math.round((clearedUsers / totalUsers) * RATE_PRECISION) / RATE_PRECISION : 0,
    completionsToday
  }
}

const snapshotDocId = (gameType, date) => `${gameType}_${date}`

const snapshotDailyStats = async (gameType) => {
  const stats = await computeClearStats(gameType)
  const date = todayInChina()
  await db.collection('stats_daily').doc(snapshotDocId(gameType, date)).set({
    data: { ...stats, date, capturedAt: db.serverDate() }
  })
  return { date, ...stats }
}

module.exports = { computeClearStats, snapshotDailyStats }
