const sortedTitles = (rules) => [...rules.titles].sort((left, right) => left.minSolved - right.minSolved)

const describeTitle = (solvedCount, rules) => {
  const titles = sortedTitles(rules)
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

const pendingChestCount = (solvedCount, claimedSolvedCount, everyLevels) =>
  Math.max(Math.floor(solvedCount / everyLevels) - Math.floor(claimedSolvedCount / everyLevels), 0)

const describeMilestone = (progress, rules) => {
  const { everyLevels, rewards } = rules.milestone
  const solvedCount = progress.solved.length
  return {
    everyLevels,
    rewards,
    pendingChests: pendingChestCount(solvedCount, milestoneClaimedCount(progress), everyLevels),
    levelsToNextChest: everyLevels - (solvedCount % everyLevels)
  }
}

const describeAchievement = (progress, rules) => ({
  solvedCount: progress.solved.length,
  title: describeTitle(progress.solved.length, rules),
  milestone: describeMilestone(progress, rules)
})

module.exports = { describeTitle, pendingChestCount, milestoneClaimedCount, describeAchievement }
