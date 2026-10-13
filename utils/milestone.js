const { game, toastError } = require('./api')
const { getSession, setItems } = require('./session')

const HIDDEN_REWARD_POPUP = { visible: false, title: '', subtitle: '', badge: '', rewards: [] }

const chestPopupOf = (result) => {
  const bigChests = result.chests.filter((chest) => chest.isBig).length
  const session = getSession()
  const multiplier = session ? session.rules.milestone.bigChest.multiplier : 2
  return {
    visible: true,
    title: result.chestCount > 1 ? `打开了 ${result.chestCount} 个宝箱` : '宝箱打开啦',
    subtitle: result.chestCount > 1 ? '奖励已经合并到一起' : '',
    badge: bigChests ? `大宝箱 ×${multiplier}` : '',
    rewards: result.rewards
  }
}

// Resolves the popup content to show, or null when the claim failed (the error is already toasted).
const openMilestoneChests = async (gameType) => {
  try {
    const result = await game.claimMilestones(gameType)
    setItems(result.items)
    return chestPopupOf(result)
  } catch (error) {
    toastError(error)
    return null
  }
}

const describeTitleProgress = (achievement) => {
  const { title, solvedCount } = achievement
  return title.nextName ? `再通过 ${title.nextMinSolved - solvedCount} 关晋升「${title.nextName}」` : '已达最高段位'
}

module.exports = { HIDDEN_REWARD_POPUP, openMilestoneChests, describeTitleProgress }
