const { db, _, readDocOrNull } = require('./cloud')
const { DAY_MS, chinaDateKey, weekKeyOf } = require('./date')
const { practiceStatsDocId } = require('./practice-rewards')
const { MATH_UNITS, readMathStats } = require('./math-stats')

const HONORS_DOC_KEY = 'honors'
const MULTIPLICATION_ROWS = 9
const MAX_STARS_PER_ROW = 3
// The 加减 medals (三档全能, 三档满分…) are about the three add/subtract units that replaced the old tiers.
const ADD_SUB_UNIT_IDS = Object.keys(MATH_UNITS).filter((unitId) => MATH_UNITS[unitId].legacyTier)
const ARITHMETIC_TIER_GOAL = 20
const FULL_SCORE = 100
const HARDEST_EXAM_LEVEL = 3

const unitsOf = (math) => Object.values(math.units || {})
const examBestScores = (math) =>
  unitsOf(math).flatMap((unit) => Object.entries(unit.exams || {}).map(([levelKey, record]) => ({ levelKey, best: record.best })))
const addSubUnitsWithFullScore = (math) =>
  ADD_SUB_UNIT_IDS.map((unitId) => (math.units || {})[unitId] || {}).filter((unit) => Object.values(unit.exams || {}).some((record) => record.best === FULL_SCORE)).length

// Why a flower was given; the client turns each reason into a line of praise.
const FLOWER_REASONS = {
  ARITHMETIC_SOLVED: 'arithmeticSolved',
  ARITHMETIC_STREAK: 'arithmeticStreak',
  DAILY_FIRST: 'dailyFirst',
  ROW_RECITED: 'rowRecited',
  ROW_MASTERED: 'rowMastered',
  ROW_PERFECT: 'rowPerfect',
  EXAM_PERFECT: 'examPerfect',
  EXAM_GREAT: 'examGreat',
  EXAM_PASSED: 'examPassed',
  ISLAND_MASTER: 'islandMaster',
  DAILY_CHALLENGE: 'dailyChallenge',
  DAILY_PERFECT: 'dailyPerfect'
}

// 岛主: every unit on an island has three stars. 口诀岛 also needs 九九神功 大成 (its three stars).
const MAX_ROUND_STARS = 3
const ISLANDS = [
  { id: 'counting', name: '数数岛', icon: '🍭' },
  { id: 'make-ten', name: '凑十岛', icon: '🏘️' },
  { id: 'hundred', name: '百数岛', icon: '🎋' },
  { id: 'times-table', name: '口诀岛', icon: '⛰️', needsKungfu: true },
  { id: 'ten-thousand', name: '万数岛', icon: '🏰' }
]
const islandMetricOf = (island) => `island:${island.id}`
const isIslandMastered = (island, { math, multiplication }) => {
  const unitIds = Object.keys(MATH_UNITS).filter((unitId) => MATH_UNITS[unitId].island === island.id)
  const unitsDone = unitIds.every((unitId) => (((math.units || {})[unitId] || {}).bestStars || 0) >= MAX_ROUND_STARS)
  return unitsDone && (!island.needsKungfu || multiplication.exam.passed) ? 1 : 0
}
// Practice days remembered for the weekly report (this week and last week).
const KEPT_PRACTICE_DATES = 14

// Numbers a medal can be measured by. A new kind of medal = one metric here + entries in MEDALS.
const METRICS = {
  arithmeticSolved: ({ math }) => math.totalSolved || 0,
  arithmeticBestStreak: ({ math }) => Math.max(0, ...unitsOf(math).map((unit) => unit.bestStreak || 0)),
  arithmeticTiersReached: ({ math }) =>
    ADD_SUB_UNIT_IDS.filter((unitId) => ((math.units || {})[unitId] || {}).solved >= ARITHMETIC_TIER_GOAL).length,
  arithmeticFullScoreExams: ({ math }) => examBestScores(math).filter((record) => record.best === FULL_SCORE).length,
  arithmeticFullScoreTiers: ({ math }) => addSubUnitsWithFullScore(math),
  arithmeticHardestFullScore: ({ math }) =>
    examBestScores(math).some((record) => record.levelKey === `level${HARDEST_EXAM_LEVEL}` && record.best === FULL_SCORE) ? 1 : 0,
  kungfuMasteredRows: ({ multiplication }) => Object.values(multiplication.rows).filter((row) => row.mastered).length,
  kungfuStars: ({ multiplication }) => Object.values(multiplication.rows).reduce((total, row) => total + row.stars, 0),
  kungfuGrandmaster: ({ multiplication }) => (multiplication.exam.passed ? 1 : 0),
  practiceDayStreak: ({ honors }) => honors.bestDayStreak || 0,
  ...Object.fromEntries(ISLANDS.map((island) => [islandMetricOf(island), (context) => isIslandMastered(island, context)]))
}

// Medals, in display order. Adding one is a single entry; ids must never change once released.
const MEDALS = [
  { id: 'arith-first', group: 'arithmetic', name: '初次答对', icon: '🌱', metric: 'arithmeticSolved', target: 1, praise: '第一道题就答对了，好的开始！' },
  { id: 'arith-streak-10', group: 'arithmetic', name: '十全十美', icon: '🔟', metric: 'arithmeticBestStreak', target: 10, praise: '连对 10 题，真厉害！' },
  { id: 'arith-streak-30', group: 'arithmetic', name: '连对达人', icon: '🔥', metric: 'arithmeticBestStreak', target: 30, praise: '连对 30 题，太了不起了！' },
  { id: 'arith-streak-100', group: 'arithmetic', name: '连对王者', icon: '👑', metric: 'arithmeticBestStreak', target: 100, praise: '连对 100 题，你就是王者！' },
  { id: 'arith-solved-100', group: 'arithmetic', name: '小小计算家', icon: '🧮', metric: 'arithmeticSolved', target: 100, praise: '答对 100 道题，越算越厉害！' },
  { id: 'arith-solved-1000', group: 'arithmetic', name: '计算大师', icon: '🎓', metric: 'arithmeticSolved', target: 1000, praise: '答对 1000 道题，真正的计算大师！' },
  { id: 'arith-all-tiers', group: 'arithmetic', name: '三档全能', icon: '🌈', metric: 'arithmeticTiersReached', target: 3, praise: '三个档位都答对 20 题，样样都行！' },
  { id: 'exam-full-score', group: 'arithmetic', name: '满分小状元', icon: '💯', metric: 'arithmeticFullScoreExams', target: 1, praise: '考试拿到 100 分，你是小状元！' },
  { id: 'exam-all-tiers', group: 'arithmetic', name: '三档满分', icon: '🏆', metric: 'arithmeticFullScoreTiers', target: 3, praise: '三个档位都考过 100 分，太棒了！' },
  { id: 'exam-lightning', group: 'arithmetic', name: '闪电手', icon: '⚡', metric: 'arithmeticHardestFullScore', target: 1, praise: '高级考试拿到满分，快如闪电！' },
  { id: 'kungfu-row-1', group: 'multiplication', name: '入门弟子', icon: '🥋', metric: 'kungfuMasteredRows', target: 1, praise: '练成第一重，正式拜入师门！' },
  { id: 'kungfu-row-5', group: 'multiplication', name: '半部秘籍', icon: '📖', metric: 'kungfuMasteredRows', target: 5, praise: '已经练成五重，秘籍过半啦！' },
  { id: 'kungfu-row-9', group: 'multiplication', name: '九重全通', icon: '🏯', metric: 'kungfuMasteredRows', target: 9, praise: '九重秘籍全部练成，了不起！' },
  { id: 'kungfu-all-stars', group: 'multiplication', name: '三星满堂', icon: '⭐', metric: 'kungfuStars', target: MULTIPLICATION_ROWS * MAX_STARS_PER_ROW, praise: '每一重都是三星，完美无缺！' },
  { id: 'kungfu-grandmaster', group: 'multiplication', name: '神功大成', icon: '🐉', metric: 'kungfuGrandmaster', target: 1, praise: '闭关考核通过，神功大成！' },
  { id: 'days-3', group: 'habit', name: '坚持之星', icon: '🌟', metric: 'practiceDayStreak', target: 3, praise: '连续练习 3 天，坚持就是胜利！' },
  { id: 'days-7', group: 'habit', name: '习惯养成', icon: '🏅', metric: 'practiceDayStreak', target: 7, praise: '连续练习 7 天，好习惯养成啦！' },
  ...ISLANDS.map((island) => ({
    id: `island-${island.id}`,
    group: 'island',
    name: `${island.name}岛主`,
    icon: island.icon,
    metric: islandMetricOf(island),
    target: 1,
    praise: island.needsKungfu ? `${island.name}全部三星、九九神功大成，你是${island.name}的小岛主！` : `${island.name}的单元全部三星，你是${island.name}的小岛主！`
  }))
]

const MEDAL_GROUPS = [
  { id: 'arithmetic', name: '数理乐园' },
  { id: 'multiplication', name: '九九神功' },
  { id: 'habit', name: '坚持练习' },
  { id: 'island', name: '岛主奖章' }
]

const honorsDocId = (openid) => practiceStatsDocId(openid, HONORS_DOC_KEY)

const emptyHonors = (openid) => ({
  openid,
  practiceId: HONORS_DOC_KEY,
  flowers: 0,
  flowersToday: { date: '', count: 0 },
  lastPracticeDate: '',
  dayStreak: 0,
  bestDayStreak: 0,
  // The week whose one forgiven missed day is used up (see nextDayStreak).
  streakGraceWeek: '',
  practiceDates: [],
  medals: {}
})

const emptyKungfuProgress = () => ({ rows: {}, exam: { passed: false } })

const readStatsDoc = (docId) => readDocOrNull('practice_stats', docId)

const ensureHonors = async (openid) => {
  if (await readStatsDoc(honorsDocId(openid))) return
  try {
    await db.collection('practice_stats').add({ data: { _id: honorsDocId(openid), ...emptyHonors(openid), createdAt: db.serverDate() } })
  } catch (duplicateError) {
    return
  }
}

const loadMetricContext = async (openid, honors) => {
  const [math, multiplication] = await Promise.all([readMathStats(openid), readStatsDoc(practiceStatsDocId(openid, 'multiplication'))])
  return {
    math: math || {},
    multiplication: (multiplication && multiplication.progress) || emptyKungfuProgress(),
    honors
  }
}

const toMedalView = (medal, context, unlockedAt) => {
  const current = Math.min(METRICS[medal.metric](context), medal.target)
  return {
    id: medal.id,
    group: medal.group,
    name: medal.name,
    icon: medal.icon,
    praise: medal.praise,
    target: medal.target,
    current,
    unlocked: Boolean(unlockedAt),
    unlockedAt: unlockedAt || 0
  }
}

const missedOneDay = (honors, now) => honors.lastPracticeDate === chinaDateKey(now - 2 * DAY_MS) && honors.streakGraceWeek !== weekKeyOf(now)

// Practising (any level passed, any practice) on consecutive Beijing days grows the streak. One missed day a week
// is forgiven, so a single busy day does not wipe out a long streak; missing more starts again from 1.
const nextDayStreak = (honors, now) => {
  const today = chinaDateKey(now)
  const same = { lastPracticeDate: today, streakGraceWeek: honors.streakGraceWeek }
  if (honors.lastPracticeDate === today) return { ...same, isFirstToday: false, dayStreak: honors.dayStreak }
  if (honors.lastPracticeDate === chinaDateKey(now - DAY_MS)) return { ...same, isFirstToday: true, dayStreak: honors.dayStreak + 1 }
  if (missedOneDay(honors, now)) return { isFirstToday: true, lastPracticeDate: today, dayStreak: honors.dayStreak + 1, streakGraceWeek: weekKeyOf(now) }
  return { ...same, isFirstToday: true, dayStreak: 1 }
}

/**
 * Adds flowers for the given events, records today's practice (for the daily flower and day streaks),
 * then unlocks every medal whose target is now reached. Returns what changed so the client can celebrate it.
 * flowerEvents: [{ reason, count }] where count is how many times the event happened.
 */
const applyHonors = async (openid, { flowerEvents = [], practiced = false }, rules, now = Date.now()) => {
  await ensureHonors(openid)
  const outcome = await db.runTransaction(async (transaction) => {
    const ref = transaction.collection('practice_stats').doc(honorsDocId(openid))
    const honors = { ...emptyHonors(openid), ...(await ref.get()).data }
    const flowerRules = rules.honors.flowers
    const day = practiced
      ? nextDayStreak(honors, now)
      : { isFirstToday: false, lastPracticeDate: honors.lastPracticeDate, dayStreak: honors.dayStreak, streakGraceWeek: honors.streakGraceWeek }
    const events = day.isFirstToday ? [...flowerEvents, { reason: FLOWER_REASONS.DAILY_FIRST, count: 1 }] : flowerEvents
    const gained = events
      .map((event) => ({ reason: event.reason, flowers: event.count * (flowerRules.perEvent[event.reason] || 0) }))
      .filter((event) => event.flowers > 0)
    const today = chinaDateKey(now)
    const earnedToday = honors.flowersToday.date === today ? honors.flowersToday.count : 0
    // Flowers stop at the daily cap; whatever is past it is simply not given.
    const capped = (flowers, alreadyToday) => Math.max(Math.min(flowers, (flowerRules.dailyCap || Infinity) - alreadyToday), 0)
    const flowersGained = capped(gained.reduce((total, event) => total + event.flowers, 0), earnedToday)
    const todayCount = earnedToday + flowersGained
    const next = {
      ...honors,
      flowers: honors.flowers + flowersGained,
      flowersToday: { date: today, count: todayCount },
      lastPracticeDate: day.lastPracticeDate,
      dayStreak: day.dayStreak,
      streakGraceWeek: day.streakGraceWeek,
      bestDayStreak: Math.max(honors.bestDayStreak, day.dayStreak)
    }
    if (practiced && !next.practiceDates.includes(today)) next.practiceDates = [...next.practiceDates, today].slice(-KEPT_PRACTICE_DATES)
    const context = await loadMetricContext(openid, next)
    const newMedals = MEDALS.filter((medal) => !honors.medals[medal.id] && METRICS[medal.metric](context) >= medal.target)
    newMedals.forEach((medal) => {
      next.medals = { ...next.medals, [medal.id]: now }
    })
    // Becoming an island's 岛主 also earns flowers (known only once the medals are checked).
    const islandFlowers = capped(newMedals.filter((medal) => medal.group === 'island').length * (flowerRules.perEvent[FLOWER_REASONS.ISLAND_MASTER] || 0), todayCount)
    if (islandFlowers) {
      gained.push({ reason: FLOWER_REASONS.ISLAND_MASTER, flowers: islandFlowers })
      next.flowers += islandFlowers
      next.flowersToday = { date: today, count: next.flowersToday.count + islandFlowers }
    }
    await ref.update({
      data: {
        flowers: next.flowers,
        flowersToday: _.set(next.flowersToday),
        lastPracticeDate: next.lastPracticeDate,
        dayStreak: next.dayStreak,
        streakGraceWeek: next.streakGraceWeek,
        bestDayStreak: next.bestDayStreak,
        practiceDates: _.set(next.practiceDates),
        medals: _.set(next.medals),
        updatedAt: db.serverDate()
      }
    })
    return {
      flowersGained: flowersGained + islandFlowers,
      flowerReasons: gained.map((event) => event.reason),
      totalFlowers: next.flowers,
      todayFlowers: next.flowersToday.count,
      newMedals: newMedals.map((medal) => toMedalView(medal, context, now))
    }
  })
  return outcome
}

// Honors are a bonus on top of what triggered them (answers counted, a level passed): a failure here is logged,
// never passed on, so the caller's result stands and nothing gets resent.
const applyHonorsSafely = async (openid, options, rules) => {
  try {
    return await applyHonors(openid, options, rules)
  } catch (error) {
    console.error('[honors] not applied, the rest already counted', error)
    return null
  }
}

const describeHonors = async (openid, now = Date.now()) => {
  const honors = { ...emptyHonors(openid), ...((await readStatsDoc(honorsDocId(openid))) || {}) }
  const context = await loadMetricContext(openid, honors)
  const today = chinaDateKey(now)
  // A streak still counts while practising today would carry it on (including this week's forgiven day).
  const practicedRecently = honors.lastPracticeDate === today || honors.lastPracticeDate === chinaDateKey(now - DAY_MS) || missedOneDay(honors, now)
  const medals = MEDALS.map((medal) => toMedalView(medal, context, honors.medals[medal.id]))
  return {
    flowers: honors.flowers,
    todayFlowers: honors.flowersToday.date === today ? honors.flowersToday.count : 0,
    dayStreak: practicedRecently ? honors.dayStreak : 0,
    bestDayStreak: honors.bestDayStreak,
    unlockedCount: medals.filter((medal) => medal.unlocked).length,
    medalCount: medals.length,
    groups: MEDAL_GROUPS.map((group) => ({ ...group, medals: medals.filter((medal) => medal.group === group.id) }))
  }
}

module.exports = { FLOWER_REASONS, MEDALS, METRICS, applyHonors, applyHonorsSafely, describeHonors, emptyHonors, honorsDocId, loadMetricContext }
