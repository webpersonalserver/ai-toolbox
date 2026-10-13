const { ALL_ITEM_TYPES } = require('./items')

const PRACTICE_TIERS = {
  arithmetic: [10, 20, 100]
}

const PRACTICE_IDS = ['arithmetic', 'multiplication']

const MILESTONE_TYPES = { ROW_RECITED: 'rowRecited', ROW_MASTERED: 'rowMastered', ROW_PERFECT: 'rowPerfect', GRANDMASTER: 'grandmaster' }

const practiceStatsDocId = (openid, practiceId) => `${openid}_${practiceId}`

const isPracticeId = (practiceId) => PRACTICE_IDS.includes(practiceId)


const milestoneKeyOf = (milestone) => (milestone.type === MILESTONE_TYPES.GRANDMASTER ? milestone.type : `${milestone.type}:${milestone.row}`)

const isPracticeTier = (practiceId, tier) => (PRACTICE_TIERS[practiceId] || []).includes(tier)

const chestsOf = (source, rewards, count) => Array.from({ length: Math.max(count, 0) }, () => ({ source, rewards }))

const solvedChestsBetween = (solvedRules, fromTotal, toTotal) =>
  solvedRules.flatMap((rule) => chestsOf('solved', rule.rewards, Math.floor(toTotal / rule.every) - Math.floor(fromTotal / rule.every)))

const repeatCrossings = (lastMilestone, every, fromStreak, toStreak) => {
  if (!every) return 0
  const stepsReached = (streak) => Math.max(Math.floor((streak - lastMilestone) / every), 0)
  return stepsReached(toStreak) - stepsReached(fromStreak)
}

const streakChestsBetween = (streakRule, fromStreak, toStreak) => {
  if (toStreak <= fromStreak) return []
  const { milestones, repeatEvery, repeatRewards } = streakRule
  const fixed = milestones
    .filter((milestone) => milestone.streak > fromStreak && milestone.streak <= toStreak)
    .map((milestone) => ({ source: 'streak', rewards: milestone.rewards }))
  const lastMilestone = milestones.length ? milestones[milestones.length - 1].streak : 0
  return [...fixed, ...chestsOf('streak', repeatRewards, repeatCrossings(lastMilestone, repeatEvery, fromStreak, toStreak))]
}

const capChestsByDailyLimit = (chests, earnedBefore, dailyCaps) => {
  const earnedToday = { ...earnedBefore }
  let missedByCap = false
  const keptChests = []
  chests.forEach((chest) => {
    const rewards = []
    chest.rewards.forEach((reward) => {
      const room = Math.max((dailyCaps[reward.type] || 0) - (earnedToday[reward.type] || 0), 0)
      const amount = Math.min(reward.amount, room)
      if (amount < reward.amount) missedByCap = true
      if (amount <= 0) return
      earnedToday[reward.type] = (earnedToday[reward.type] || 0) + amount
      rewards.push({ type: reward.type, amount })
    })
    if (rewards.length) keptChests.push({ source: chest.source, rewards })
  })
  return { chests: keptChests, earnedToday, missedByCap }
}

const toRewardList = (deltas) =>
  ALL_ITEM_TYPES.filter((type) => deltas[type] > 0).map((type) => ({ type, amount: deltas[type] }))

module.exports = {
  practiceStatsDocId,
  PRACTICE_TIERS,
  PRACTICE_IDS,
  MILESTONE_TYPES,
  milestoneKeyOf,
  isPracticeId,
  isPracticeTier,
  solvedChestsBetween,
  streakChestsBetween,
  capChestsByDailyLimit,
  toRewardList
}
