const { db, _ } = require('../lib/cloud')
const { ERROR_CODES, BusinessError, throwIfFailed } = require('../lib/response')
const { loadRules, sumRewardsByType } = require('../lib/rules')
const { dailyDocId, getTodayRecord, ensureTodayRecord } = require('../lib/daily')
const { ALL_ITEM_TYPES, changeItemsInTransaction } = require('../lib/items')
const { ITEM_LOG_REASONS, writeItemLogs } = require('../lib/item-log')
const { FLOWER_REASONS, applyHonors, describeHonors } = require('../lib/honors')
const { issueDoubleOffer } = require('../lib/double-reward')
const { emptyProgress, parseClientProgress, mergeProgress, milestonesOf, toClientProgress } = require('../lib/multiplication-progress')
const {
  PRACTICE_TIERS,
  PRACTICE_IDS,
  practiceStatsDocId: statsDocId,
  milestoneKeyOf,
  isPracticeId,
  isPracticeTier,
  solvedChestsBetween,
  streakChestsBetween,
  capChestsByDailyLimit,
  toRewardList
} = require('../lib/practice-rewards')

const MAX_SOLVED_PER_REPORT = 500
const MAX_REPORTED_STREAK = 100000
const MAX_RUN_ID_LENGTH = 64
const MILESTONE_PRACTICE_ID = 'multiplication'
const EXAM_QUESTION_COUNT = 20
const EXAM_POINTS_PER_QUESTION = 5
const EXAM_LEVELS = [1, 2, 3]
const EXAM_UNLOCK_SCORE = 80
const MAX_EXAM_SECONDS = 3600
const FULL_SCORE = EXAM_QUESTION_COUNT * EXAM_POINTS_PER_QUESTION
const GREAT_SCORE = 90
const PASS_SCORE = 60

const tierKeyOf = (tier) => `within${tier}`
const emptyItemCounts = () => Object.fromEntries(ALL_ITEM_TYPES.map((type) => [type, 0]))
const addItemCounts = (left, right) => Object.fromEntries(ALL_ITEM_TYPES.map((type) => [type, (left[type] || 0) + (right[type] || 0)]))

const isIntegerBetween = (value, min, max) => Number.isInteger(value) && value >= min && value <= max

const parsePracticeId = (payload) => {
  if (!isPracticeId(payload.practiceId)) throw new BusinessError(ERROR_CODES.BAD_REQUEST, '未知练习')
  return payload.practiceId
}

const parseReport = (payload) => {
  const practiceId = parsePracticeId(payload)
  const { tier, solvedDelta, streak, streakRunId } = payload
  const isValid =
    isPracticeTier(practiceId, tier) &&
    isIntegerBetween(solvedDelta, 0, MAX_SOLVED_PER_REPORT) &&
    isIntegerBetween(streak, 0, MAX_REPORTED_STREAK) &&
    typeof streakRunId === 'string' &&
    streakRunId.length > 0 &&
    streakRunId.length <= MAX_RUN_ID_LENGTH
  if (!isValid) throw new BusinessError(ERROR_CODES.BAD_REQUEST, '练习数据不正确')
  return { practiceId, tier, solvedDelta, streak, streakRunId }
}

const emptyStats = (openid, practiceId) => ({
  openid,
  practiceId,
  tiers: {},
  totalSolved: 0,
  streakRun: null,
  pendingChestCount: 0,
  pendingRewards: emptyItemCounts(),
  rewardedMilestones: []
})

const withDefaults = (stats, openid, practiceId) => ({ ...emptyStats(openid, practiceId), ...stats })

const readStats = async (openid, practiceId) => {
  try {
    const { data } = await db.collection('practice_stats').doc(statsDocId(openid, practiceId)).get()
    return withDefaults(data, openid, practiceId)
  } catch (error) {
    return null
  }
}

const ensureStats = async (openid, practiceId) => {
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
const toExamView = (tierExams = {}) =>
  EXAM_LEVELS.map((level, index) => {
    const record = tierExams[levelKeyOf(level)] || null
    const previous = index === 0 ? null : tierExams[levelKeyOf(EXAM_LEVELS[index - 1])]
    return {
      level,
      unlocked: index === 0 || Boolean(previous && previous.best >= EXAM_UNLOCK_SCORE),
      best: record ? record.best : null,
      bestSeconds: record ? record.bestSeconds : 0,
      attempts: record ? record.attempts : 0
    }
  })

const toStatsView = (stats, practiceId, earnedToday, rules) => ({
  tiers: Object.fromEntries(
    (PRACTICE_TIERS[practiceId] || []).map((tier) => {
      const tierStats = stats.tiers[tierKeyOf(tier)] || {}
      return [tier, { solved: tierStats.solved || 0, bestStreak: tierStats.bestStreak || 0, exams: toExamView((stats.exams || {})[tierKeyOf(tier)]) }]
    })
  ),
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

const report = async ({ openid, payload }) => {
  const { practiceId, tier, solvedDelta, streak, streakRunId } = parseReport(payload)
  const rules = await loadRules()
  await Promise.all([ensureTodayRecord(openid), ensureStats(openid, practiceId)])
  const outcome = await db.runTransaction(async (transaction) => {
    const statsRef = transaction.collection('practice_stats').doc(statsDocId(openid, practiceId))
    const dailyRef = transaction.collection('daily').doc(dailyDocId(openid))
    const [{ data: rawStats }, { data: todayRecord }] = await Promise.all([statsRef.get(), dailyRef.get()])
    const storedStats = withDefaults(rawStats, openid, practiceId)

    const tierKey = tierKeyOf(tier)
    const tierStats = storedStats.tiers[tierKey] || { solved: 0, bestStreak: 0 }
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
      tiers: { ...storedStats.tiers, [tierKey]: { solved: tierStats.solved + solvedDelta, bestStreak: Math.max(tierStats.bestStreak, streak) } },
      streakRun: { runId: streakRunId, rewardedStreak: Math.max(rewardedStreak, streak) },
      pendingChestCount: storedStats.pendingChestCount + chests.length,
      pendingRewards: addItemCounts(storedStats.pendingRewards, sumRewardsByType(chests.flatMap((chest) => chest.rewards)))
    }
    await statsRef.update({
      data: {
        [`tiers.${tierKey}`]: _.set(nextStats.tiers[tierKey]),
        totalSolved,
        streakRun: _.set(nextStats.streakRun),
        pendingChestCount: nextStats.pendingChestCount,
        pendingRewards: _.set(nextStats.pendingRewards),
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
    return { newChests: chests, missedByCap, stats: toStatsView(nextStats, practiceId, earnedToday, rules), flowerEvents }
  })
  const { flowerEvents, ...result } = outcome
  const honors = await applyHonors(openid, { flowerEvents, practiced: solvedDelta > 0 }, rules)
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
    await statsRef.update({
      data: {
        progress: _.set(progress),
        rewardedMilestones: _.set([...rewarded]),
        pendingChestCount,
        pendingRewards: _.set(pendingRewards),
        updatedAt: db.serverDate()
      }
    })
    const flowerEvents = [FLOWER_REASONS.ROW_RECITED, FLOWER_REASONS.ROW_MASTERED, FLOWER_REASONS.ROW_PERFECT]
      .map((reason) => ({ reason, count: newMilestones.filter((milestone) => milestone.type === reason).length }))
      .filter((event) => event.count > 0)
    return { progress: toClientProgress(progress), newChests: chests, pendingChestCount, flowerEvents }
  })
  const { flowerEvents, ...result } = outcome
  const honors = await applyHonors(openid, { flowerEvents, practiced: payload.practiced === true }, rules)
  return { ...result, honors }
}

const examFlowerReasonOf = (score) => {
  if (score >= FULL_SCORE) return FLOWER_REASONS.EXAM_PERFECT
  if (score >= GREAT_SCORE) return FLOWER_REASONS.EXAM_GREAT
  if (score >= PASS_SCORE) return FLOWER_REASONS.EXAM_PASSED
  return null
}

const parseExamReport = (payload) => {
  const { practiceId, tier, level, correct, seconds } = payload
  const isValid =
    practiceId === 'arithmetic' &&
    isPracticeTier(practiceId, tier) &&
    EXAM_LEVELS.includes(level) &&
    isIntegerBetween(correct, 0, EXAM_QUESTION_COUNT) &&
    isIntegerBetween(seconds, 1, MAX_EXAM_SECONDS)
  if (!isValid) throw new BusinessError(ERROR_CODES.BAD_REQUEST, '考试成绩数据不正确')
  return { practiceId, tier, level, correct, seconds }
}

// Records one finished exam paper. Answers already counted through practice.report; this keeps the scores,
// opens the next level, and pays flowers / medals.
const reportExam = async ({ openid, payload }) => {
  const { practiceId, tier, level, correct, seconds } = parseExamReport(payload)
  const score = correct * EXAM_POINTS_PER_QUESTION
  const rules = await loadRules()
  await ensureStats(openid, practiceId)
  const outcome = await db.runTransaction(async (transaction) => {
    const statsRef = transaction.collection('practice_stats').doc(statsDocId(openid, practiceId))
    const storedStats = withDefaults((await statsRef.get()).data, openid, practiceId)
    const tierKey = tierKeyOf(tier)
    const tierExams = (storedStats.exams || {})[tierKey] || {}
    const levelView = toExamView(tierExams).find((view) => view.level === level)
    if (!levelView.unlocked) {
      return { failure: { code: ERROR_CODES.BAD_REQUEST, message: '这个等级还没解锁' } }
    }
    const previous = tierExams[levelKeyOf(level)] || { best: 0, bestSeconds: 0, attempts: 0 }
    const isNewBest = score > previous.best || (score === previous.best && (!previous.bestSeconds || seconds < previous.bestSeconds))
    const record = {
      best: Math.max(previous.best, score),
      bestSeconds: isNewBest ? seconds : previous.bestSeconds,
      attempts: previous.attempts + 1
    }
    const nextTierExams = { ...tierExams, [levelKeyOf(level)]: record }
    await statsRef.update({ data: { [`exams.${tierKey}`]: _.set(nextTierExams), updatedAt: db.serverDate() } })
    const levelsBefore = toExamView(tierExams)
    const levelsAfter = toExamView(nextTierExams)
    const unlockedLevel = levelsAfter.find((view, index) => view.unlocked && !levelsBefore[index].unlocked)
    return { score, isNewBest: score > previous.best, previousBest: previous.attempts ? previous.best : null, exams: levelsAfter, unlockedLevel: unlockedLevel ? unlockedLevel.level : null }
  })
  throwIfFailed(outcome)
  const reason = examFlowerReasonOf(score)
  const honorsResult = await applyHonors(openid, { flowerEvents: reason ? [{ reason, count: 1 }] : [], practiced: true }, rules)
  return { ...outcome, honors: honorsResult }
}

const honors = ({ openid }) => describeHonors(openid)

const claimChests = async ({ openid, payload }) => {
  const practiceId = parsePracticeId(payload)
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
    if (!storedStats || storedStats.pendingChestCount <= 0) {
      return { failure: { code: ERROR_CODES.NOTHING_TO_CLAIM, message: '没有可以打开的练习宝箱' } }
    }
    const deltas = storedStats.pendingRewards
    const { items } = await changeItemsInTransaction(transaction, openid, deltas, rules, now)
    await statsRef.update({ data: { pendingChestCount: 0, pendingRewards: _.set(emptyItemCounts()), updatedAt: db.serverDate() } })
    return { chestCount: storedStats.pendingChestCount, deltas, items }
  })
  throwIfFailed(outcome)
  await writeItemLogs(openid, outcome.deltas, ITEM_LOG_REASONS.PRACTICE, { practiceId })
  const rewards = toRewardList(outcome.deltas)
  const doubleToken = await issueDoubleOffer(openid, rewards, `practice:${practiceId}`, rules)
  return { chestCount: outcome.chestCount, rewards, items: outcome.items, doubleToken }
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

module.exports = { stats, report, reportExam, syncProgress, honors, claimChests, summarizePractices }
