const { db, _ } = require('../lib/cloud')
const { loadRules } = require('../lib/rules')
const { describeTitle } = require('../lib/achievement')
const { getProgress } = require('../lib/progress')
const { GAME_TYPE } = require('./idiom')

const LEADERBOARD_CACHE_TTL_MS = 60 * 1000

let cachedTopEntries = null

const loadTopProgress = async (size) => {
  const { data } = await db
    .collection('progress')
    .where({ gameType: GAME_TYPE, solvedCount: _.gt(0) })
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

const buildTopEntries = async (size, rules) => {
  const topProgress = await loadTopProgress(size)
  const profiles = await loadProfiles(topProgress.map((progress) => progress.openid))
  return topProgress.map((progress, index) => {
    const profile = profiles[progress.openid] || {}
    return {
      openid: progress.openid,
      rank: index + 1,
      nickname: profile.nickname || '',
      avatarUrl: profile.avatarUrl || '',
      solvedCount: progress.solvedCount,
      titleName: describeTitle(progress.solvedCount, rules).name
    }
  })
}

const getTopEntries = async (rules) => {
  const { size } = rules.leaderboard
  const now = Date.now()
  if (cachedTopEntries && cachedTopEntries.size === size && cachedTopEntries.expiresAt > now) {
    return cachedTopEntries.entries
  }
  const entries = await buildTopEntries(size, rules)
  cachedTopEntries = { size, entries, expiresAt: now + LEADERBOARD_CACHE_TTL_MS }
  return entries
}

const rankOf = async (progress) => {
  if (!progress.solvedCount) return null
  const progressCollection = db.collection('progress')
  const [{ total: moreSolved }, { total: sameSolvedEarlier }] = await Promise.all([
    progressCollection.where({ gameType: GAME_TYPE, solvedCount: _.gt(progress.solvedCount) }).count(),
    progressCollection
      .where({ gameType: GAME_TYPE, solvedCount: progress.solvedCount, lastSolvedAt: _.lt(progress.lastSolvedAt) })
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

const list = async ({ openid }) => {
  const rules = await loadRules()
  const [topEntries, myProgress, { data: me }] = await Promise.all([
    getTopEntries(rules),
    getProgress(openid, GAME_TYPE),
    db.collection('users').doc(openid).get()
  ])
  const myTopEntry = topEntries.find((entry) => entry.openid === openid)
  const solvedCount = myProgress.solvedCount || 0
  return {
    size: rules.leaderboard.size,
    entries: topEntries.map((entry) => toPublicEntry(entry, openid)),
    me: {
      rank: myTopEntry ? myTopEntry.rank : await rankOf(myProgress),
      nickname: me.nickname,
      avatarUrl: me.avatarUrl,
      solvedCount,
      titleName: describeTitle(solvedCount, rules).name,
      inTop: Boolean(myTopEntry)
    }
  }
}

module.exports = { list }
