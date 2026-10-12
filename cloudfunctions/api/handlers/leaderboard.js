const { db, _ } = require('../lib/cloud')
const { loadRules } = require('../lib/rules')
const { describeTitle } = require('../lib/achievement')
const { getProgress } = require('../lib/progress')
const { parseGameType } = require('../lib/games')

const LEADERBOARD_CACHE_TTL_MS = 60 * 1000

const cachedTopEntriesByGame = {}

const loadTopProgress = async (gameType, size) => {
  const { data } = await db
    .collection('progress')
    .where({ gameType, solvedCount: _.gt(0) })
    .orderBy('solvedCount', 'desc')
    .orderBy('lastSolvedAt', 'asc')
    .limit(size)
    .get()
  return data
}

const loadProfiles = async (openids) => {
  if (!openids.length) return {}
  const { data } = await db.collection('users').where({ _id: _.in(openids) }).limit(openids.length).get()
  return Object.fromEntries(data.map((user) => [user._id, user]))
}

const buildTopEntries = async (gameType, size, rules) => {
  const topProgress = await loadTopProgress(gameType, size)
  const profiles = await loadProfiles(topProgress.map((progress) => progress.openid))
  return topProgress.map((progress, index) => {
    const profile = profiles[progress.openid] || {}
    return {
      openid: progress.openid,
      rank: index + 1,
      nickname: profile.nickname || '',
      avatarUrl: profile.avatarUrl || '',
      solvedCount: progress.solvedCount,
      titleName: describeTitle(progress.solvedCount, rules, gameType).name
    }
  })
}

const getTopEntries = async (gameType, rules) => {
  const { size } = rules.leaderboard
  const now = Date.now()
  const cached = cachedTopEntriesByGame[gameType]
  if (cached && cached.size === size && cached.expiresAt > now) {
    return cached.entries
  }
  const entries = await buildTopEntries(gameType, size, rules)
  cachedTopEntriesByGame[gameType] = { size, entries, expiresAt: now + LEADERBOARD_CACHE_TTL_MS }
  return entries
}

const rankOf = async (progress, gameType) => {
  if (!progress.solvedCount) return null
  const progressCollection = db.collection('progress')
  const [{ total: moreSolved }, { total: sameSolvedEarlier }] = await Promise.all([
    progressCollection.where({ gameType, solvedCount: _.gt(progress.solvedCount) }).count(),
    progressCollection
      .where({ gameType, solvedCount: progress.solvedCount, lastSolvedAt: _.lt(progress.lastSolvedAt) })
      .count()
  ])
  return moreSolved + sameSolvedEarlier + 1
}

const toPublicEntry = (entry, openid) => ({
  rank: entry.rank,
  nickname: entry.nickname,
  avatarUrl: entry.avatarUrl,
  solvedCount: entry.solvedCount,
  titleName: entry.titleName,
  isMe: entry.openid === openid
})

const list = async ({ openid, payload }) => {
  const gameType = parseGameType(payload)
  const rules = await loadRules()
  const [topEntries, myProgress, { data: me }] = await Promise.all([
    getTopEntries(gameType, rules),
    getProgress(openid, gameType),
    db.collection('users').doc(openid).get()
  ])
  const myTopEntry = topEntries.find((entry) => entry.openid === openid)
  const solvedCount = myProgress.solvedCount || 0
  return {
    size: rules.leaderboard.size,
    entries: topEntries.map((entry) => toPublicEntry(entry, openid)),
    me: {
      rank: myTopEntry ? myTopEntry.rank : await rankOf(myProgress, gameType),
      nickname: me.nickname,
      avatarUrl: me.avatarUrl,
      solvedCount,
      titleName: describeTitle(solvedCount, rules, gameType).name,
      inTop: Boolean(myTopEntry)
    }
  }
}

module.exports = { list }
