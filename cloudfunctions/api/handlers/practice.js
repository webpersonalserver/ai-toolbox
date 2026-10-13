const { db } = require('../lib/cloud')
const { ERROR_CODES, BusinessError, throwIfFailed } = require('../lib/response')
const { loadRules, sumRewardsByType } = require('../lib/rules')
const { dailyDocId, getTodayRecord, ensureTodayRecord } = require('../lib/daily')
const { ALL_ITEM_TYPES, changeItemsInTransaction } = require('../lib/items')
const { ITEM_LOG_REASONS, writeItemLogs } = require('../lib/item-log')
const { emptyProgress, parseClientProgress, mergeProgress, milestonesOf, toClientProgress } = require('../lib/multiplication-progress')
const {
  PRACTICE_TIERS,
  PRACTICE_IDS,
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

const statsDocId = (openid, practiceId) => `${openid}_${practiceId}`
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

const toStatsView = (stats, practiceId, earnedToday, rules) => ({
  tiers: Object.fromEntries(
    (PRACTICE_TIERS[practiceId] || []).map((tier) => {
      const tierStats = stats.tiers[tierKeyOf(tier)] || {}
      return [tier, { solved: tierStats.solved || 0, bestStreak: tierStats.bestStreak || 0 }]
    })
  ),
  totalSolved: stats.totalSolved,
  pendingChestCount: stats.pendingChestCount,
  pendingRewards: toRewardList(stats.pendingRewards),
  earnedToday,
  rewardRules: rules.practice
})

const stats = async ({ openid, payload }) => {
  const practiceId = parsePracticeId(payload)
  const rules = await loadRules()
  const [storedStats, todayRecord] = await Promise.all([readStats(openid, practiceId), getTodayRecord(openid)])
  return toStatsView(storedStats || emptyStats(openid, practiceId), practiceId, practiceEarnedOf(todayRecord), rules)
}

const report = async ({ openid, payload }) => {
  const { practiceId, tier, solvedDelta, streak, streakRunId } = parseReport(payload)
  const rules = await loadRules()
  await Promise.all([ensureTodayRecord(openid), ensureStats(openid, practiceId)])
  return db.runTransaction(async (transaction) => {
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
        [`tiers.${tierKey}`]: nextStats.tiers[tierKey],
        totalSolved,
        streakRun: nextStats.streakRun,
        pendingChestCount: nextStats.pendingChestCount,
        pendingRewards: nextStats.pendingRewards,
        updatedAt: db.serverDate()
      }
    })
    if (chests.length) {
      await dailyRef.update({ data: { practiceEarned: earnedToday, updatedAt: db.serverDate() } })
    }
    return { newChests: chests, missedByCap, stats: toStatsView(nextStats, practiceId, earnedToday, rules) }
  })
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
  return db.runTransaction(async (transaction) => {
    const statsRef = transaction.collection('practice_stats').doc(statsDocId(openid, practiceId))
    const storedStats = withDefaults((await statsRef.get()).data, openid, practiceId)
    const progress = mergeProgress(storedStats.progress || emptyProgress(), clientProgress)
    const rewarded = new Set(storedStats.rewardedMilestones)
    const chests = milestonesOf(progress)
      .filter((milestone) => !rewarded.has(milestoneKeyOf(milestone)))
      .map((milestone) => {
        rewarded.add(milestoneKeyOf(milestone))
        return { source: milestone.type, row: milestone.row || null, rewards: rules.practice.multiplication[milestone.type] }
      })
      .filter((chest) => chest.rewards.length)
    const pendingChestCount = storedStats.pendingChestCount + chests.length
    const pendingRewards = addItemCounts(storedStats.pendingRewards, sumRewardsByType(chests.flatMap((chest) => chest.rewards)))
    await statsRef.update({
      data: { progress, rewardedMilestones: [...rewarded], pendingChestCount, pendingRewards, updatedAt: db.serverDate() }
    })
    return { progress: toClientProgress(progress), newChests: chests, pendingChestCount }
  })
}

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
    await statsRef.update({ data: { pendingChestCount: 0, pendingRewards: emptyItemCounts(), updatedAt: db.serverDate() } })
    return { chestCount: storedStats.pendingChestCount, deltas, items }
  })
  throwIfFailed(outcome)
  await writeItemLogs(openid, outcome.deltas, ITEM_LOG_REASONS.PRACTICE, { practiceId })
  return { chestCount: outcome.chestCount, rewards: toRewardList(outcome.deltas), items: outcome.items }
}

const summarizePractices = (openid) =>
  Promise.all(
    PRACTICE_IDS.map(async (practiceId) => {
      const storedStats = (await readStats(openid, practiceId)) || emptyStats(openid, practiceId)
      return { practiceId, pendingChestCount: storedStats.pendingChestCount, pendingRewards: toRewardList(storedStats.pendingRewards) }
    })
  )

module.exports = { stats, report, syncProgress, claimChests, summarizePractices }
