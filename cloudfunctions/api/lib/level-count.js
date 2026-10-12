const { db } = require('./cloud')

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

const countLevels = (gameType) =>
  readThrough(cachedCounts, gameType, async () => {
    const { total } = await db.collection('levels').where({ gameType }).count()
    return total
  })

const levelStages = (gameType) =>
  readThrough(cachedStages, gameType, async () => {
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
