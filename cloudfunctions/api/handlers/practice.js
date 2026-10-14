const { db, _ } = require('../lib/cloud')
const { ERROR_CODES, BusinessError, throwIfFailed } = require('../lib/response')
const { loadRules, sumRewardsByType } = require('../lib/rules')
const { dailyDocId, getTodayRecord, ensureTodayRecord } = require('../lib/daily')
const { ALL_ITEM_TYPES, changeItemsInTransaction } = require('../lib/items')
const { ITEM_LOG_REASONS, writeItemLogs } = require('../lib/item-log')
const { FLOWER_REASONS, MEDALS, applyHonors, describeHonors, emptyHonors, honorsDocId, readDocOrNull } = require('../lib/honors')
const { chinaDateKey } = require('../lib/date')
const { issueDoubleOffer } = require('../lib/double-reward')
const { emptyProgress, parseClientProgress, mergeProgress, milestonesOf, toClientProgress } = require('../lib/multiplication-progress')
const {
  MATH_SUBJECT,
  LEGACY_ARITHMETIC,
  MATH_UNIT_IDS,
  MATH_UNITS,
  isMathUnit,
  unitIdOfLegacyTier,
  emptyUnit,
  emptyMathStats,
  addToDays,
  readMathStats,
  ensureMathStats
} = require('../lib/math-stats')
const { parseMistakeEvents, applyMistakeEvents } = require('../lib/practice-mistakes')
const {
  PRACTICE_IDS,
  practiceStatsDocId: statsDocId,
  milestoneKeyOf,
  isPracticeId,
  solvedChestsBetween,
  streakChestsBetween,
  capChestsByDailyLimit,
  toRewardList
} = require('../lib/practice-rewards')

const MAX_SOLVED_PER_REPORT = 500
const MAX_ROUND_STARS = 3
const MAX_REPORTED_STREAK = 100000
const MAX_RUN_ID_LENGTH = 64
const REPORT_ID_PATTERN = /^[0-9a-zA-Z_-]{1,64}$/
const REMEMBERED_REPORT_IDS = 20
const MILESTONE_PRACTICE_ID = 'multiplication'
const EXAM_QUESTION_COUNT = 20
const EXAM_POINTS_PER_QUESTION = 5
const EXAM_LEVELS = [1, 2, 3]
const EXAM_UNLOCK_SCORE = 80
const MAX_EXAM_SECONDS = 3600
const FULL_SCORE = EXAM_QUESTION_COUNT * EXAM_POINTS_PER_QUESTION
const GREAT_SCORE = 90
const PASS_SCORE = 60

const emptyItemCounts = () => Object.fromEntries(ALL_ITEM_TYPES.map((type) => [type, 0]))
const addItemCounts = (left, right) => Object.fromEntries(ALL_ITEM_TYPES.map((type) => [type, (left[type] || 0) + (right[type] || 0)]))

const subtractItemCounts = (left, right) => Object.fromEntries(ALL_ITEM_TYPES.map((type) => [type, Math.max((left[type] || 0) - (right[type] || 0), 0)]))

// Chests are kept one by one (pendingChestList) so the welfare bag can show each; pendingChestCount and
// pendingRewards stay the totals. Chests saved before the list existed are only in the totals.
const EARLIER_CHEST_ID = 'earlier'
const CHEST_ID_PATTERN = /^[0-9a-z-]{1,32}$/

const listedChestsOf = (chests, now) =>
  chests.map((chest, index) => ({ chestId: `${now.toString(36)}-${index}`, source: chest.source, row: chest.row || null, rewards: chest.rewards, earnedAt: now }))

// Every pending chest, oldest first; the pre-list ones come first as a single bundle with their count.
const pendingPracticeChestsOf = (stats) => {
  const listed = (stats.pendingChestList || []).map((chest) => ({ ...chest, count: 1 }))
  const earlierCount = stats.pendingChestCount - listed.length
  if (earlierCount <= 0) return listed
  const listedTotals = sumRewardsByType(listed.flatMap((chest) => chest.rewards))
  const earlierRewards = toRewardList(subtractItemCounts(stats.pendingRewards, listedTotals))
  return [{ chestId: EARLIER_CHEST_ID, source: EARLIER_CHEST_ID, row: null, rewards: earlierRewards, earnedAt: 0, count: earlierCount }, ...listed]
}

const isIntegerBetween = (value, min, max) => Number.isInteger(value) && value >= min && value <= max

// The old 加减运算 pages (and reports still waiting on phones) say "arithmetic"; it is 数理乐园 now.
const parsePracticeId = (payload) => {
  const practiceId = payload.practiceId === LEGACY_ARITHMETIC ? MATH_SUBJECT : payload.practiceId
  if (!isPracticeId(practiceId)) throw new BusinessError(ERROR_CODES.BAD_REQUEST, '未知练习')
  return practiceId
}

// A 数理乐园 unit, given as unitId or, from old clients, as the old tier (10 / 20 / 100).
const parseUnitId = (payload) => {
  if (payload.unitId !== undefined) return isMathUnit(payload.unitId) ? payload.unitId : null
  return Number.isInteger(payload.tier) ? unitIdOfLegacyTier(payload.tier) : null
}

const parseReport = (payload) => {
  const practiceId = parsePracticeId(payload)
  const unitId = practiceId === MATH_SUBJECT ? parseUnitId(payload) : null
  const { solvedDelta, streak, streakRunId, reportId = '', roundStars = null } = payload
  const mistakeEvents = parseMistakeEvents(payload)
  const isValid =
    Boolean(unitId) &&
    (roundStars === null || isIntegerBetween(roundStars, 0, MAX_ROUND_STARS)) &&
    Boolean(mistakeEvents) &&
    (reportId === '' || (typeof reportId === 'string' && REPORT_ID_PATTERN.test(reportId))) &&
    isIntegerBetween(solvedDelta, 0, MAX_SOLVED_PER_REPORT) &&
    isIntegerBetween(streak, 0, MAX_REPORTED_STREAK) &&
    typeof streakRunId === 'string' &&
    streakRunId.length > 0 &&
    streakRunId.length <= MAX_RUN_ID_LENGTH
  if (!isValid) throw new BusinessError(ERROR_CODES.BAD_REQUEST, '练习数据不正确')
  return { practiceId, unitId, solvedDelta, streak, streakRunId, reportId, mistakeEvents, roundStars }
}

const emptyStats = (openid, practiceId) => ({
  openid,
  practiceId,
  tiers: {},
  totalSolved: 0,
  streakRun: null,
  pendingChestCount: 0,
  pendingRewards: emptyItemCounts(),
  pendingChestList: [],
  rewardedMilestones: []
})

const withDefaults = (stats, openid, practiceId) =>
  practiceId === MATH_SUBJECT ? { ...emptyMathStats(openid), ...stats } : { ...emptyStats(openid, practiceId), ...stats }

const readStats = async (openid, practiceId) => {
  if (practiceId === MATH_SUBJECT) return readMathStats(openid)
  try {
    const { data } = await db.collection('practice_stats').doc(statsDocId(openid, practiceId)).get()
    return withDefaults(data, openid, practiceId)
  } catch (error) {
    return null
  }
}

const ensureStats = async (openid, practiceId) => {
  if (practiceId === MATH_SUBJECT) return ensureMathStats(openid)
  if (await readStats(openid, practiceId)) return
  try {
    await db.collection('practice_stats').add({
      data: { _id: statsDocId(openid, practiceId), ...emptyStats(openid, practiceId), createdAt: db.serverDate() }
    })
  } catch (duplicateError) {
    return
  }
}

const practiceEarnedOf = (todayRecord) => addItemCounts(emptyItemCounts(), (todayRecord && todayRecord.practiceEarned) || {})

const levelKeyOf = (level) => `level${level}`

// Level 1 is always open; each next level opens once the one below scored EXAM_UNLOCK_SCORE or more.
const toExamView = (unitExams = {}) =>
  EXAM_LEVELS.map((level, index) => {
    const record = unitExams[levelKeyOf(level)] || null
    const previous = index === 0 ? null : unitExams[levelKeyOf(EXAM_LEVELS[index - 1])]
    return {
      level,
      unlocked: index === 0 || Boolean(previous && previous.best >= EXAM_UNLOCK_SCORE),
      best: record ? record.best : null,
      bestSeconds: record ? record.bestSeconds : 0,
      attempts: record ? record.attempts : 0
    }
  })

const toUnitView = (unit = emptyUnit()) => ({
  solved: unit.solved || 0,
  bestStreak: unit.bestStreak || 0,
  bestStars: unit.bestStars || 0,
  exams: toExamView(unit.exams),
  mistakeCount: (unit.mistakes || []).length,
  caught: unit.caught || 0,
  lastPracticed: unit.lastPracticed || ''
})

// units: per 数理乐园 unit. tiers: the same numbers keyed by the old tier, for the old 加减运算 pages.
const toStatsView = (stats, practiceId, earnedToday, rules) => ({
  units: practiceId === MATH_SUBJECT ? Object.fromEntries(MATH_UNIT_IDS.map((unitId) => [unitId, toUnitView((stats.units || {})[unitId])])) : {},
  tiers:
    practiceId === MATH_SUBJECT
      ? Object.fromEntries(MATH_UNIT_IDS.map((unitId) => [MATH_UNITS[unitId].legacyTier, toUnitView((stats.units || {})[unitId])]))
      : {},
  totalSolved: stats.totalSolved,
  pendingChestCount: stats.pendingChestCount,
  pendingRewards: toRewardList(stats.pendingRewards),
  earnedToday,
  rewardRules: rules.practice,
  flowerRules: rules.honors.flowers
})

const stats = async ({ openid, payload }) => {
  const practiceId = parsePracticeId(payload)
  const rules = await loadRules()
  const [storedStats, todayRecord] = await Promise.all([readStats(openid, practiceId), getTodayRecord(openid)])
  return toStatsView(storedStats || emptyStats(openid, practiceId), practiceId, practiceEarnedOf(todayRecord), rules)
}

const countCrossings = (every, from, to) => Math.floor(to / every) - Math.floor(from / every)

// Honors are a bonus on top of the report: if they fail, the answers are already counted and must not be resent.
const applyHonorsSafely = async (openid, options, rules) => {
  try {
    return await applyHonors(openid, options, rules)
  } catch (error) {
    console.error('[practice] honors failed, answers already counted', error)
    return null
  }
}

/**
 * Counts answered questions. Each report carries a reportId and the cloud remembers the last few, so a report
 * the client resends (it timed out after the cloud had saved it) is not counted twice.
 */
const report = async ({ openid, payload }) => {
  const { practiceId, unitId, solvedDelta, streak, streakRunId, reportId, mistakeEvents, roundStars } = parseReport(payload)
  const rules = await loadRules()
  const [dateKey] = await Promise.all([ensureTodayRecord(openid), ensureStats(openid, practiceId)])
  const outcome = await db.runTransaction(async (transaction) => {
    const statsRef = transaction.collection('practice_stats').doc(statsDocId(openid, practiceId))
    const dailyRef = transaction.collection('daily').doc(dailyDocId(openid, dateKey))
    const [{ data: rawStats }, { data: todayRecord }] = await Promise.all([statsRef.get(), dailyRef.get()])
    const storedStats = withDefaults(rawStats, openid, practiceId)
    const recentReportIds = storedStats.recentReportIds || []
    if (reportId && recentReportIds.includes(reportId)) {
      return { duplicate: true, newChests: [], caughtMistakes: [], missedByCap: false, stats: toStatsView(storedStats, practiceId, practiceEarnedOf(todayRecord), rules), flowerEvents: [] }
    }

    const unit = { ...emptyUnit(), ...(storedStats.units[unitId] || {}) }
    const { mistakes: nextMistakes, caught } = applyMistakeEvents(unit.mistakes, mistakeEvents, Date.now())
    // bestStars: the best a round of 10 ever scored in this unit (3 = mastered; drives the island map).
    const bestStars = Math.max(unit.bestStars || 0, roundStars || 0)
    const nextUnit = {
      ...unit,
      solved: unit.solved + solvedDelta,
      bestStreak: Math.max(unit.bestStreak, streak),
      bestStars,
      mistakes: nextMistakes,
      caught: (unit.caught || 0) + caught.length,
      lastPracticed: solvedDelta > 0 ? dateKey : unit.lastPracticed || ''
    }
    const days = addToDays(storedStats.days || {}, dateKey, { solved: solvedDelta, caught: caught.length, stars: bestStars - (unit.bestStars || 0) })
    const totalSolved = storedStats.totalSolved + solvedDelta
    const isSameRun = Boolean(storedStats.streakRun) && storedStats.streakRun.runId === streakRunId
    const rewardedStreak = isSameRun ? storedStats.streakRun.rewardedStreak : 0
    const earnedChests = [
      ...solvedChestsBetween(rules.practice.solvedRewards, storedStats.totalSolved, totalSolved),
      ...streakChestsBetween(rules.practice.streakRewards, rewardedStreak, streak)
    ]
    const { chests, earnedToday, missedByCap } = capChestsByDailyLimit(earnedChests, practiceEarnedOf(todayRecord), rules.practice.dailyCaps)
    const nextStats = {
      ...storedStats,
      totalSolved,
      units: { ...storedStats.units, [unitId]: nextUnit },
      streakRun: { runId: streakRunId, rewardedStreak: Math.max(rewardedStreak, streak) },
      pendingChestCount: storedStats.pendingChestCount + chests.length,
      pendingRewards: addItemCounts(storedStats.pendingRewards, sumRewardsByType(chests.flatMap((chest) => chest.rewards))),
      pendingChestList: [...(storedStats.pendingChestList || []), ...listedChestsOf(chests, Date.now())]
    }
    await statsRef.update({
      data: {
        [`units.${unitId}`]: _.set(nextUnit),
        totalSolved,
        days: _.set(days),
        streakRun: _.set(nextStats.streakRun),
        pendingChestCount: nextStats.pendingChestCount,
        pendingRewards: _.set(nextStats.pendingRewards),
        pendingChestList: _.set(nextStats.pendingChestList),
        recentReportIds: _.set(reportId ? [...recentReportIds, reportId].slice(-REMEMBERED_REPORT_IDS) : recentReportIds),
        updatedAt: db.serverDate()
      }
    })
    if (chests.length) {
      await dailyRef.update({ data: { practiceEarned: _.set(earnedToday), updatedAt: db.serverDate() } })
    }
    const flowerRules = rules.honors.flowers
    const flowerEvents = [
      { reason: FLOWER_REASONS.ARITHMETIC_SOLVED, count: countCrossings(flowerRules.arithmeticSolvedEvery, storedStats.totalSolved, totalSolved) },
      { reason: FLOWER_REASONS.ARITHMETIC_STREAK, count: flowerRules.arithmeticStreaks.filter((target) => target > rewardedStreak && target <= streak).length }
    ].filter((event) => event.count > 0)
    return { newChests: chests, caughtMistakes: caught, missedByCap, stats: toStatsView(nextStats, practiceId, earnedToday, rules), flowerEvents }
  })
  const { flowerEvents, duplicate, ...result } = outcome
  const honors = duplicate ? null : await applyHonorsSafely(openid, { flowerEvents, practiced: solvedDelta > 0 }, rules)
  return { ...result, honors }
}

// Merges the device's progress into the cloud copy, then pays each newly reached achievement once
// (each 重 mastered / perfected, grandmaster). They are bounded, so the daily cap does not apply.
const syncProgress = async ({ openid, payload }) => {
  if (payload.practiceId !== MILESTONE_PRACTICE_ID) throw new BusinessError(ERROR_CODES.BAD_REQUEST, '未知练习')
  const clientProgress = parseClientProgress(payload.progress, Date.now())
  if (!clientProgress) throw new BusinessError(ERROR_CODES.BAD_REQUEST, '练习进度数据不正确')
  const practiceId = MILESTONE_PRACTICE_ID
  const rules = await loadRules()
  await ensureStats(openid, practiceId)
  const outcome = await db.runTransaction(async (transaction) => {
    const statsRef = transaction.collection('practice_stats').doc(statsDocId(openid, practiceId))
    const storedStats = withDefaults((await statsRef.get()).data, openid, practiceId)
    const progress = mergeProgress(storedStats.progress || emptyProgress(), clientProgress)
    const rewarded = new Set(storedStats.rewardedMilestones)
    const newMilestones = milestonesOf(progress).filter((milestone) => !rewarded.has(milestoneKeyOf(milestone)))
    newMilestones.forEach((milestone) => rewarded.add(milestoneKeyOf(milestone)))
    const chests = newMilestones
      .map((milestone) => ({ source: milestone.type, row: milestone.row || null, rewards: rules.practice.multiplication[milestone.type] || [] }))
      .filter((chest) => chest.rewards.length)
    const pendingChestCount = storedStats.pendingChestCount + chests.length
    const pendingRewards = addItemCounts(storedStats.pendingRewards, sumRewardsByType(chests.flatMap((chest) => chest.rewards)))
    const pendingChestList = [...(storedStats.pendingChestList || []), ...listedChestsOf(chests, Date.now())]
    await statsRef.update({
      data: {
        progress: _.set(progress),
        rewardedMilestones: _.set([...rewarded]),
        pendingChestCount,
        pendingRewards: _.set(pendingRewards),
        pendingChestList: _.set(pendingChestList),
        updatedAt: db.serverDate()
      }
    })
    const flowerEvents = [FLOWER_REASONS.ROW_RECITED, FLOWER_REASONS.ROW_MASTERED, FLOWER_REASONS.ROW_PERFECT]
      .map((reason) => ({ reason, count: newMilestones.filter((milestone) => milestone.type === reason).length }))
      .filter((event) => event.count > 0)
    return { progress: toClientProgress(progress), newChests: chests, pendingChestCount, flowerEvents }
  })
  const { flowerEvents, ...result } = outcome
  const honors = await applyHonorsSafely(openid, { flowerEvents, practiced: payload.practiced === true }, rules)
  return { ...result, honors }
}

const examFlowerReasonOf = (score) => {
  if (score >= FULL_SCORE) return FLOWER_REASONS.EXAM_PERFECT
  if (score >= GREAT_SCORE) return FLOWER_REASONS.EXAM_GREAT
  if (score >= PASS_SCORE) return FLOWER_REASONS.EXAM_PASSED
  return null
}

const parseExamReport = (payload) => {
  const practiceId = payload.practiceId === LEGACY_ARITHMETIC ? MATH_SUBJECT : payload.practiceId
  const unitId = practiceId === MATH_SUBJECT ? parseUnitId(payload) : null
  const { level, correct, seconds } = payload
  const isValid =
    Boolean(unitId) &&
    EXAM_LEVELS.includes(level) &&
    isIntegerBetween(correct, 0, EXAM_QUESTION_COUNT) &&
    isIntegerBetween(seconds, 1, MAX_EXAM_SECONDS)
  if (!isValid) throw new BusinessError(ERROR_CODES.BAD_REQUEST, '考试成绩数据不正确')
  return { practiceId, unitId, level, correct, seconds }
}

// Records one finished exam paper. Answers already counted through practice.report; this keeps the scores,
// opens the next level, and pays flowers / medals.
const reportExam = async ({ openid, payload }) => {
  const { practiceId, unitId, level, correct, seconds } = parseExamReport(payload)
  const score = correct * EXAM_POINTS_PER_QUESTION
  const rules = await loadRules()
  await ensureStats(openid, practiceId)
  const outcome = await db.runTransaction(async (transaction) => {
    const statsRef = transaction.collection('practice_stats').doc(statsDocId(openid, practiceId))
    const storedStats = withDefaults((await statsRef.get()).data, openid, practiceId)
    const unit = { ...emptyUnit(), ...(storedStats.units[unitId] || {}) }
    const unitExams = unit.exams || {}
    const levelView = toExamView(unitExams).find((view) => view.level === level)
    if (!levelView.unlocked) {
      return { failure: { code: ERROR_CODES.BAD_REQUEST, message: '这一级还没解锁，先把前面的考过吧' } }
    }
    const previous = unitExams[levelKeyOf(level)] || { best: 0, bestSeconds: 0, attempts: 0 }
    const isNewBest = score > previous.best || (score === previous.best && (!previous.bestSeconds || seconds < previous.bestSeconds))
    const record = {
      best: Math.max(previous.best, score),
      bestSeconds: isNewBest ? seconds : previous.bestSeconds,
      attempts: previous.attempts + 1
    }
    const nextExams = { ...unitExams, [levelKeyOf(level)]: record }
    await statsRef.update({ data: { [`units.${unitId}`]: _.set({ ...unit, exams: nextExams }), updatedAt: db.serverDate() } })
    const levelsBefore = toExamView(unitExams)
    const levelsAfter = toExamView(nextExams)
    const unlockedLevel = levelsAfter.find((view, index) => view.unlocked && !levelsBefore[index].unlocked)
    return { score, isNewBest: score > previous.best, previousBest: previous.attempts ? previous.best : null, exams: levelsAfter, unlockedLevel: unlockedLevel ? unlockedLevel.level : null }
  })
  throwIfFailed(outcome)
  const reason = examFlowerReasonOf(score)
  const honorsResult = await applyHonorsSafely(openid, { flowerEvents: reason ? [{ reason, count: 1 }] : [], practiced: true }, rules)
  return { ...outcome, honors: honorsResult }
}

const honors = ({ openid }) => describeHonors(openid)

// The questions waiting in one unit's 小怪兽收容所, oldest first.
const mistakes = async ({ openid, payload }) => {
  const practiceId = parsePracticeId(payload)
  const unitId = practiceId === MATH_SUBJECT ? parseUnitId(payload) : null
  if (!unitId) throw new BusinessError(ERROR_CODES.BAD_REQUEST, '未知练习单元')
  const storedStats = await readStats(openid, practiceId)
  const unit = (storedStats && storedStats.units[unitId]) || emptyUnit()
  return { unitId, mistakes: (unit.mistakes || []).map(({ key, data, correctStreak }) => ({ key, data, correctStreak })) }
}

// Opens the given chests of one practice (every pending one when chestIds is null) and pays their rewards.
// Chests already opened are skipped; nothing left to open is an error.
const openPracticeChests = async (openid, practiceId, chestIds) => {
  const now = Date.now()
  const rules = await loadRules()
  const outcome = await db.runTransaction(async (transaction) => {
    const statsRef = transaction.collection('practice_stats').doc(statsDocId(openid, practiceId))
    let storedStats
    try {
      storedStats = withDefaults((await statsRef.get()).data, openid, practiceId)
    } catch (missingError) {
      storedStats = null
    }
    const pending = storedStats ? pendingPracticeChestsOf(storedStats) : []
    const chests = chestIds ? pending.filter((chest) => chestIds.includes(chest.chestId)) : pending
    if (!chests.length) {
      return { failure: { code: ERROR_CODES.NOTHING_TO_CLAIM, message: '没有可以打开的宝箱啦' } }
    }
    const deltas = addItemCounts(emptyItemCounts(), sumRewardsByType(chests.flatMap((chest) => chest.rewards)))
    const openedCount = chests.reduce((total, chest) => total + chest.count, 0)
    const openedIds = new Set(chests.map((chest) => chest.chestId))
    const { items } = await changeItemsInTransaction(transaction, openid, deltas, rules, now)
    await statsRef.update({
      data: {
        pendingChestCount: storedStats.pendingChestCount - openedCount,
        pendingRewards: _.set(subtractItemCounts(storedStats.pendingRewards, deltas)),
        pendingChestList: _.set((storedStats.pendingChestList || []).filter((chest) => !openedIds.has(chest.chestId))),
        updatedAt: db.serverDate()
      }
    })
    return { chests, chestCount: openedCount, deltas, items }
  })
  throwIfFailed(outcome)
  await writeItemLogs(openid, outcome.deltas, ITEM_LOG_REASONS.PRACTICE, { practiceId })
  return { ...outcome, rules }
}

// The pending chests of one practice with what is inside, for the welfare bag.
const pendingChestsOfPractice = async (openid, practiceId) => {
  const storedStats = await readStats(openid, practiceId)
  return storedStats ? pendingPracticeChestsOf(storedStats) : []
}

// Opens every pending chest of the practice at once.
const claimChests = async ({ openid, payload }) => {
  const practiceId = parsePracticeId(payload)
  const { chestCount, deltas, items, rules } = await openPracticeChests(openid, practiceId, null)
  const rewards = toRewardList(deltas)
  const doubleToken = await issueDoubleOffer(openid, rewards, `practice:${practiceId}`, rules)
  return { chestCount, rewards, items, doubleToken }
}

const summarizePractices = (openid) =>
  Promise.all(
    PRACTICE_IDS.map(async (practiceId) => {
      const storedStats = (await readStats(openid, practiceId)) || emptyStats(openid, practiceId)
      const masteredRows = storedStats.progress ? Object.values(storedStats.progress.rows).filter((row) => row.mastered).length : 0
      return {
        practiceId,
        pendingChestCount: storedStats.pendingChestCount,
        pendingRewards: toRewardList(storedStats.pendingRewards),
        totalSolved: storedStats.totalSolved,
        masteredRows
      }
    })
  )

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_DAYS = 7
const CHINA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000

// Date keys of this week (Monday … Sunday, Beijing time) and of last week.
const weekKeysOf = (now) => {
  const weekday = (new Date(now + CHINA_UTC_OFFSET_MS).getUTCDay() + 6) % WEEK_DAYS
  const monday = now - weekday * DAY_MS
  const keysFrom = (start) => Array.from({ length: WEEK_DAYS }, (_, index) => chinaDateKey(start + index * DAY_MS))
  return { thisWeek: keysFrom(monday), lastWeek: keysFrom(monday - WEEK_DAYS * DAY_MS), today: chinaDateKey(now) }
}

const sumDays = (days, keys, field) => keys.reduce((total, key) => total + ((days[key] || {})[field] || 0), 0)

// 本周小结 for parents: practice days (any practice), 数理乐园 answers vs last week, stars and monsters, medals this week.
const weekly = async ({ openid, now = Date.now() }) => {
  const [math, honorsDoc, kungfu] = await Promise.all([
    readMathStats(openid),
    readDocOrNull(honorsDocId(openid)),
    readDocOrNull(statsDocId(openid, MILESTONE_PRACTICE_ID))
  ])
  const honorsRecord = { ...emptyHonors(openid), ...(honorsDoc || {}) }
  const days = (math && math.days) || {}
  const { thisWeek, lastWeek, today } = weekKeysOf(now)
  const weekStartAt = Date.parse(`${thisWeek[0].slice(0, 4)}-${thisWeek[0].slice(4, 6)}-${thisWeek[0].slice(6)}T00:00:00+08:00`)
  const practiced = new Set(honorsRecord.practiceDates)
  const units = (math && math.units) || {}
  const kungfuRows = Object.values(((kungfu && kungfu.progress) || { rows: {} }).rows).filter((row) => row.mastered).length
  return {
    days: thisWeek.map((dateKey) => ({ dateKey, practiced: practiced.has(dateKey), solved: (days[dateKey] || {}).solved || 0, isToday: dateKey === today, isFuture: dateKey > today })),
    practicedDays: thisWeek.filter((dateKey) => practiced.has(dateKey)).length,
    solved: sumDays(days, thisWeek, 'solved'),
    lastWeekSolved: sumDays(days, lastWeek, 'solved'),
    stars: sumDays(days, thisWeek, 'stars'),
    caught: sumDays(days, thisWeek, 'caught'),
    monsters: MATH_UNIT_IDS.map((unitId) => ({ unitId, count: ((units[unitId] || {}).mistakes || []).length })).filter((unit) => unit.count > 0),
    medals: MEDALS.filter((medal) => (honorsRecord.medals[medal.id] || 0) >= weekStartAt).map(({ id, name, icon }) => ({ id, name, icon })),
    kungfuRows
  }
}

module.exports = {
  stats,
  report,
  reportExam,
  syncProgress,
  honors,
  mistakes,
  weekly,
  claimChests,
  openPracticeChests,
  pendingChestsOfPractice,
  summarizePractices,
  CHEST_ID_PATTERN
}
