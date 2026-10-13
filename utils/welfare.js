const { gameConfigOf } = require('./games')
const { PRACTICES } = require('./practice/registry')
const { describeRewards } = require('./items')

const countUnclaimedWelfare = (session, games, practices = []) => {
  const checkin = session.today.checkedIn ? 0 : 1
  const recovery = session.items.staminaPending > 0 ? 1 : 0
  const chests = games.reduce((total, summary) => total + summary.achievement.milestone.pendingChests, 0)
  const practiceChests = practices.reduce((total, summary) => total + summary.pendingChestCount, 0)
  return checkin + recovery + chests + practiceChests
}

const buildChestRows = (games) =>
  games.map((summary) => {
    const { milestone } = summary.achievement
    const config = gameConfigOf(summary.gameType)
    return {
      gameType: summary.gameType,
      name: config.name,
      icon: config.icon,
      pendingChests: milestone.pendingChests,
      levelsToNextChest: milestone.levelsToNextChest,
      nextChestIsBig: milestone.nextChestIsBig
    }
  })

const buildPracticeChestRows = (practices = []) => {
  const summaryById = Object.fromEntries(practices.map((summary) => [summary.practiceId, summary]))
  return PRACTICES.filter((config) => summaryById[config.id]).map((config) => ({
    practiceId: config.id,
    name: config.name,
    icon: config.icon,
    chestHint: config.chestHint,
    pendingChestCount: summaryById[config.id].pendingChestCount,
    rewardText: describeRewards(summaryById[config.id].pendingRewards)
  }))
}

module.exports = { countUnclaimedWelfare, buildChestRows, buildPracticeChestRows }
