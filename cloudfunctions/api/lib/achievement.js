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

// See milestone.rewardRules in lib/rules.js: a type with its own big rule ignores the shared multiplier.
const chestAmount = (rule, chestNo, isBig, multiplier) => {
  const amount = Math.min(rule.max, rule.base + rule.step * Math.floor((chestNo - 1) / rule.everyChests))
  if (!isBig) return amount
  if (rule.big) return chestNo >= rule.big.fromChest ? rule.big.amount : amount
  return amount * multiplier
}

const chestRewards = (chestNo, rules) => {
  const isBig = isBigChest(chestNo, rules)
  return Object.entries(rules.milestone.rewardRules)
    .map(([type, rule]) => ({ type, amount: chestAmount(rule, chestNo, isBig, rules.milestone.bigChest.multiplier) }))
    .filter((reward) => reward.amount > 0)
}

const claimedChestCount = (progress, everyLevels) => Math.floor(milestoneClaimedCount(progress) / everyLevels)

const earnedChestCount = (progress, everyLevels) => Math.floor(progress.solved.length / everyLevels)

// Chests opened one by one past milestoneClaimedSolvedCount; they move into it once the gap below them is filled.
const openedChestNosOf = (progress) => progress.milestoneOpenedChestNos || []

// Numbers of the chests earned but not opened yet, oldest first (chest n is earned at level n × everyLevels).
const pendingChestNosOf = (progress, everyLevels) => {
  const opened = new Set(openedChestNosOf(progress))
  const firstNo = claimedChestCount(progress, everyLevels) + 1
  const count = Math.max(earnedChestCount(progress, everyLevels) - firstNo + 1, 0)
  return Array.from({ length: count }, (_, offset) => firstNo + offset).filter((chestNo) => !opened.has(chestNo))
}

// The milestone fields to store once chestNos (all pending) are opened.
const milestoneAfterOpening = (progress, chestNos, everyLevels) => {
  const opened = new Set([...openedChestNosOf(progress), ...chestNos])
  let claimedChests = claimedChestCount(progress, everyLevels)
  while (opened.has(claimedChests + 1)) {
    claimedChests += 1
    opened.delete(claimedChests)
  }
  return {
    milestoneClaimedSolvedCount: claimedChests * everyLevels,
    milestoneOpenedChestNos: [...opened].sort((left, right) => left - right)
  }
}

const describeMilestone = (progress, rules) => {
  const { everyLevels } = rules.milestone
  const solvedCount = progress.solved.length
  // The next chest still to be earned (the "再通过 N 关" one), not the next one waiting to be opened.
  const nextChestNo = Math.max(earnedChestCount(progress, everyLevels), claimedChestCount(progress, everyLevels)) + 1
  return {
    everyLevels,
    nextChestNo,
    nextChestIsBig: isBigChest(nextChestNo, rules),
    nextChestRewards: chestRewards(nextChestNo, rules),
    pendingChests: pendingChestNosOf(progress, everyLevels).length,
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
  pendingChestNosOf,
  milestoneAfterOpening,
  milestoneClaimedCount,
  claimedChestCount,
  chestRewards,
  isBigChest,
  describeAchievement
}
