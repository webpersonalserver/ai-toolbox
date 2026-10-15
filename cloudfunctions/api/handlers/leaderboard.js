const { db, _, readDocOrNull } = require('../lib/cloud')
const { loadRules } = require('../lib/rules')
const { describeTitle } = require('../lib/achievement')
const { progressDocId, getProgress } = require('../lib/progress')
const { ALL_GAME_TYPES, parseGameType } = require('../lib/games')
const sprint = require('./sprint')
const { SUBJECTS: SPRINT_SUBJECTS } = require('../lib/sprint-tracks')

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

// Read only: the card page must not create a progress record for every game the player never opened.
const readProgress = (openid, gameType) => readDocOrNull('progress', progressDocId(openid, gameType))

const gameCardOf = async (gameType, openid, rules) => {
  const [topEntries, progress] = await Promise.all([getTopEntries(gameType, rules), readProgress(openid, gameType)])
  const myTopEntry = topEntries.find((entry) => entry.openid === openid)
  const leader = topEntries[0]
  return {
    gameType,
    mySolved: (progress && progress.solvedCount) || 0,
    myRank: myTopEntry ? myTopEntry.rank : progress ? await rankOf(progress, gameType) : null,
    leader: leader ? { nickname: leader.nickname, avatarUrl: leader.avatarUrl, solvedCount: leader.solvedCount, isMe: leader.openid === openid } : null
  }
}

// The leaderboard's front page in one call: per board, this player's rank and who is first.
const summary = async ({ openid }) => {
  const rules = await loadRules()
  const [games, mathSprint, chineseSprint] = await Promise.all([
    Promise.all(ALL_GAME_TYPES.map((gameType) => gameCardOf(gameType, openid, rules))),
    sprint.myBest(openid, SPRINT_SUBJECTS.MATH),
    sprint.myBest(openid, SPRINT_SUBJECTS.CHINESE)
  ])
  return { games, sprints: { [SPRINT_SUBJECTS.MATH]: mathSprint, [SPRINT_SUBJECTS.CHINESE]: chineseSprint } }
}

module.exports = { list, summary }
