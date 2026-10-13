const titlesOf = (rules, gameType) => rules.titles[gameType] || []

const describeTitle = (solvedCount, rules, gameType) => {
  const titles = titlesOf(rules, gameType)
  let currentIndex = 0
  titles.forEach((title, index) => {
    if (solvedCount >= title.minSolved) currentIndex = index
  })
  const nextTitle = titles[currentIndex + 1] || null
  return {
    name: titles[currentIndex] ? titles[currentIndex].name : '',
    nextName: nextTitle ? nextTitle.name : null,
    nextMinSolved: nextTitle ? nextTitle.minSolved : null
  }
}

const milestoneClaimedCount = (progress) => progress.milestoneClaimedSolvedCount || 0

const isBigChest = (chestNo, rules) => chestNo % rules.milestone.bigChest.everyChests === 0

const chestRewards = (chestNo, rules) => {
  const multiplier = isBigChest(chestNo, rules) ? rules.milestone.bigChest.multiplier : 1
  return Object.entries(rules.milestone.rewardRules)
    .map(([type, rule]) => {
      const grown = rule.base + rule.step * Math.floor((chestNo - 1) / rule.everyChests)
      return { type, amount: Math.min(rule.max, grown) * multiplier }
    })
    .filter((reward) => reward.amount > 0)
}

const claimedChestCount = (progress, everyLevels) => Math.floor(milestoneClaimedCount(progress) / everyLevels)

const pendingChestCount = (solvedCount, claimedSolvedCount, everyLevels) =>
  Math.max(Math.floor(solvedCount / everyLevels) - Math.floor(claimedSolvedCount / everyLevels), 0)

const describeMilestone = (progress, rules) => {
  const { everyLevels } = rules.milestone
  const solvedCount = progress.solved.length
  const nextChestNo = claimedChestCount(progress, everyLevels) + 1
  return {
    everyLevels,
    nextChestNo,
    nextChestIsBig: isBigChest(nextChestNo, rules),
    nextChestRewards: chestRewards(nextChestNo, rules),
    pendingChests: pendingChestCount(solvedCount, milestoneClaimedCount(progress), everyLevels),
    levelsToNextChest: everyLevels - (solvedCount % everyLevels)
  }
}

const describeAchievement = (progress, rules) => ({
  solvedCount: progress.solved.length,
  title: describeTitle(progress.solved.length, rules, progress.gameType),
  milestone: describeMilestone(progress, rules)
})

module.exports = {
  describeTitle,
  pendingChestCount,
  milestoneClaimedCount,
  claimedChestCount,
  chestRewards,
  isBigChest,
  describeAchievement
}
