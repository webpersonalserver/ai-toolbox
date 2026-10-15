const { db } = require('./cloud')
const { MATH_GAME_TYPE, TOTAL_LEVELS, levelStagesView } = require('./math-challenge')

const LEVEL_META_CACHE_TTL_MS = 10 * 60 * 1000

const cachedCounts = {}
const cachedStages = {}

const readThrough = async (cache, key, load) => {
  const cached = cache[key]
  if (cached && cached.expiresAt > Date.now()) return cached.value
  const value = await load()
  cache[key] = { value, expiresAt: Date.now() + LEVEL_META_CACHE_TTL_MS }
  return value
}

// 口算闯关's levels are made on demand, so its count and stages are fixed rather than read from the levels collection.
const countLevels = (gameType) =>
  gameType === MATH_GAME_TYPE ? Promise.resolve(TOTAL_LEVELS) : readThrough(cachedCounts, gameType, async () => {
    const { total } = await db.collection('levels').where({ gameType }).count()
    return total
  })

const levelStages = (gameType) =>
  gameType === MATH_GAME_TYPE ? Promise.resolve(levelStagesView()) : readThrough(cachedStages, gameType, async () => {
    const $ = db.command.aggregate
    const { list } = await db
      .collection('levels')
      .aggregate()
      .match({ gameType })
      .group({ _id: '$stage', firstLevelNo: $.min('$levelNo'), lastLevelNo: $.max('$levelNo') })
      .end()
    return list
      .filter((stage) => stage._id)
      .map((stage) => ({ name: stage._id, firstLevelNo: stage.firstLevelNo, lastLevelNo: stage.lastLevelNo }))
      .sort((left, right) => left.firstLevelNo - right.firstLevelNo)
  })

module.exports = { countLevels, levelStages }
