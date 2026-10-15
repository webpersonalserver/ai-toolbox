const { db, _, readDocOrNull } = require('./cloud')
const { DAY_MS, chinaDateKey, chinaDayStart, weekKeyOf } = require('./date')
const { ALL_GAME_TYPES } = require('./games')
const { SUBJECTS: SPRINT_SUBJECTS, tracksOf } = require('./sprint-tracks')
const { LEVEL_STATS, DAILY_EVENTS } = require('./play-stats')

// What the admin's 数据统计 shows, in the order it matters: are children using it, what they play, where they get
// stuck, whether hints are about right. Counts only — no aggregation pipeline, so each number is one cheap query.
const OVERVIEW_KIND = 'overview'
const TREND_DAYS = 14
const STUCK_LEVELS = 10
const HINT_LOG_LIMIT = 1000

const countOf = async (collection, where) => (await db.collection(collection).where(where).count()).total

// Active = opened the app that day (users.lastLoginAt), new = signed up that day. 次日留存: of yesterday's new
// players, how many have come back today.
const activityOf = async (now) => {
  const todayStart = new Date(chinaDayStart(now))
  const yesterdayStart = new Date(chinaDayStart(now) - DAY_MS)
  const [activeUsers, newUsers, totalUsers, newYesterday, retained] = await Promise.all([
    countOf('users', { lastLoginAt: _.gte(todayStart) }),
    countOf('users', { createdAt: _.gte(todayStart) }),
    db.collection('users').count().then(({ total }) => total),
    countOf('users', { createdAt: _.and(_.gte(yesterdayStart), _.lt(todayStart)) }),
    countOf('users', { createdAt: _.and(_.gte(yesterdayStart), _.lt(todayStart)), lastLoginAt: _.gte(todayStart) })
  ])
  return { activeUsers, newUsers, totalUsers, newYesterday, retained }
}

const gameRowOf = async (gameType, todayStart) => {
  const [players, passedToday, { data: top }] = await Promise.all([
    countOf('progress', { gameType, solvedCount: _.gt(0) }),
    countOf('progress', { gameType, lastSolvedAt: _.gte(todayStart) }),
    db.collection('progress').where({ gameType }).orderBy('solvedCount', 'desc').limit(1).get()
  ])
  return { gameType, players, passedToday, furthest: top.length ? top[0].solvedCount : 0 }
}

const sprintRowOf = async (subject, period) => ({
  subject,
  runs: await countOf('sprint_scores', { period, islandId: _.in(tracksOf(subject).map((track) => track.id)) })
})

// Hints handed out today (any reason) and spent today, from the item log.
const hintsTodayOf = async (todayStart) => {
  const [spent, { data: given }] = await Promise.all([
    countOf('item_logs', { itemType: 'hint', reason: 'use', createdAt: _.gte(todayStart) }),
    db.collection('item_logs').where({ itemType: 'hint', delta: _.gt(0), createdAt: _.gte(todayStart) }).limit(HINT_LOG_LIMIT).get()
  ])
  return { spent, given: given.reduce((total, log) => total + log.delta, 0) }
}

const trendOf = async (now) => {
  const { data } = await db
    .collection('stats_daily')
    .where({ kind: OVERVIEW_KIND })
    .orderBy('date', 'desc')
    .limit(TREND_DAYS)
    .get()
  return data.map(({ date, activeUsers, newUsers }) => ({ date, activeUsers, newUsers })).filter((day) => day.date !== chinaDateKey(now))
}

const computeOverview = async (now = Date.now()) => {
  const todayStart = new Date(chinaDayStart(now))
  const period = weekKeyOf(now)
  const [activity, games, sprints, hints, events, rescuesToday, rescuesSolvedToday, trend] = await Promise.all([
    activityOf(now),
    Promise.all(ALL_GAME_TYPES.map((gameType) => gameRowOf(gameType, todayStart))),
    Promise.all(Object.values(SPRINT_SUBJECTS).map((subject) => sprintRowOf(subject, period))),
    hintsTodayOf(todayStart),
    readDocOrNull(DAILY_EVENTS, chinaDateKey(now)),
    countOf('rescues', { createdAt: _.gte(todayStart) }),
    countOf('rescues', { status: 'solved', solvedAt: _.gte(todayStart) }),
    trendOf(now)
  ])
  const dayEvents = events || {}
  return {
    date: chinaDateKey(now),
    ...activity,
    dailyDone: dayEvents.dailyDone || 0,
    games,
    sprints,
    hints: { ...hints, shortage: dayEvents.hintShortage || 0 },
    staminaShortage: dayEvents.staminaShortage || 0,
    rescues: { created: rescuesToday, solved: rescuesSolvedToday },
    trend
  }
}

// Where a game's children get stuck: the levels lost most often, and those needing the most hints.
const stuckLevelsOf = async (gameType) => {
  const query = (field) => db.collection(LEVEL_STATS).where({ gameType }).orderBy(field, 'desc').limit(STUCK_LEVELS).get()
  const [{ data: byFails }, { data: byHints }] = await Promise.all([query('fails'), query('hints')])
  const toRow = (stat) => ({
    levelNo: stat.levelNo,
    starts: stat.starts || 0,
    fails: stat.fails || 0,
    passes: stat.passes || 0,
    hints: stat.hints || 0,
    failRate: stat.starts ? Math.round(((stat.fails || 0) / stat.starts) * 100) : 0
  })
  return { byFails: byFails.filter((stat) => stat.fails).map(toRow), byHints: byHints.filter((stat) => stat.hints).map(toRow) }
}

// Saved by the hourly trigger, so the trend outlives the 7 days users' daily records are kept.
const snapshotActivity = async (now = Date.now()) => {
  const date = chinaDateKey(now)
  const { activeUsers, newUsers } = await activityOf(now)
  await db.collection('stats_daily').doc(`${OVERVIEW_KIND}_${date}`).set({ data: { kind: OVERVIEW_KIND, date, activeUsers, newUsers, capturedAt: db.serverDate() } })
  return { date, activeUsers, newUsers }
}

module.exports = { computeOverview, stuckLevelsOf, snapshotActivity }
