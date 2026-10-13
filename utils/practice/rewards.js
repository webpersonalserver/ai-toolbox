const { describeRewards } = require('../items')

// Mirrors the cloud rules only to decide when to report and what to show; the cloud stays the source of truth.
// Rewards are trimmed to today's remaining room, so a chest whose items are all capped is skipped.
const withinDailyRoom = (rewards, earnedToday, dailyCaps) =>
  rewards
    .map((reward) => ({ type: reward.type, amount: Math.min(reward.amount, Math.max((dailyCaps[reward.type] || 0) - (earnedToday[reward.type] || 0), 0)) }))
    .filter((reward) => reward.amount > 0)

const nextSolvedChest = (totalSolved, rules, earnedToday) => {
  const candidates = rules.solvedRewards
    .map((rule) => ({ every: rule.every, remaining: rule.every - (totalSolved % rule.every), rewards: withinDailyRoom(rule.rewards, earnedToday, rules.dailyCaps) }))
    .filter((candidate) => candidate.rewards.length)
  if (!candidates.length) return null
  const nearest = candidates.reduce((best, candidate) => (candidate.remaining < best.remaining ? candidate : best))
  return { ...nearest, progressPercent: Math.round(((nearest.every - nearest.remaining) / nearest.every) * 100), rewardText: describeRewards(nearest.rewards) }
}

const streakTargetsAfter = (streak, streakRule, count) => {
  const { milestones, repeatEvery, repeatRewards } = streakRule
  const targets = milestones.filter((milestone) => milestone.streak > streak).map((milestone) => ({ target: milestone.streak, rewards: milestone.rewards }))
  if (repeatEvery) {
    const lastMilestone = milestones.length ? milestones[milestones.length - 1].streak : 0
    const firstStep = Math.max(Math.floor((streak - lastMilestone) / repeatEvery) + 1, 1)
    for (let step = firstStep; targets.length < count; step += 1) {
      targets.push({ target: lastMilestone + step * repeatEvery, rewards: repeatRewards })
    }
  }
  return targets.slice(0, count)
}

const STREAK_LOOKAHEAD = 20

const nextStreakChest = (streak, rules, earnedToday) => {
  const next = streakTargetsAfter(streak, rules.streakRewards, STREAK_LOOKAHEAD)
    .map((candidate) => ({ target: candidate.target, rewards: withinDailyRoom(candidate.rewards, earnedToday, rules.dailyCaps) }))
    .find((candidate) => candidate.rewards.length)
  return next ? { target: next.target, rewardText: describeRewards(next.rewards) } : null
}

const expectsChest = (rules, earnedToday, { fromTotal, toTotal, streak, countsForStreak }) => {
  const solvedRewards = rules.solvedRewards
    .filter((rule) => Math.floor(toTotal / rule.every) > Math.floor(fromTotal / rule.every))
    .flatMap((rule) => rule.rewards)
  const reachedStreak = countsForStreak ? streakTargetsAfter(streak - 1, rules.streakRewards, 1).find((candidate) => candidate.target === streak) : null
  const earned = [...solvedRewards, ...(reachedStreak ? reachedStreak.rewards : [])]
  return withinDailyRoom(earned, earnedToday, rules.dailyCaps).length > 0
}

const isDailyCapReached = (earnedToday, dailyCaps) =>
  Object.keys(dailyCaps).every((type) => (earnedToday[type] || 0) >= dailyCaps[type])

// Flowers have no daily cap, so this only checks the moments: every N answers, or a listed streak in one run.
const expectsFlower = (flowerRules, { fromTotal, toTotal, streak, countsForStreak }) =>
  Math.floor(toTotal / flowerRules.arithmeticSolvedEvery) > Math.floor(fromTotal / flowerRules.arithmeticSolvedEvery) ||
  (countsForStreak && flowerRules.arithmeticStreaks.includes(streak))

module.exports = { nextSolvedChest, nextStreakChest, expectsChest, expectsFlower, isDailyCapReached }
