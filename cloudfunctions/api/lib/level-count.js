const { db } = require('./cloud')

const LEVEL_COUNT_CACHE_TTL_MS = 10 * 60 * 1000

const cachedCounts = {}

const countLevels = async (gameType) => {
  const cached = cachedCounts[gameType]
  if (cached && cached.expiresAt > Date.now()) return cached.total
  const { total } = await db.collection('levels').where({ gameType }).count()
  cachedCounts[gameType] = { total, expiresAt: Date.now() + LEVEL_COUNT_CACHE_TTL_MS }
  return total
}

module.exports = { countLevels }
