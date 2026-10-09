const { idiom, toastError } = require('./api')
const { setItems } = require('./session')
const { describeRewards } = require('./items')

const openMilestoneChests = async () => {
  try {
    const result = await idiom.claimMilestones()
    setItems(result.items)
    wx.showModal({
      title: result.chestCount > 1 ? `打开了 ${result.chestCount} 个宝箱` : '宝箱打开啦',
      content: `获得 ${describeRewards(result.rewards)}`,
      showCancel: false,
      confirmText: '收下'
    })
    return result
  } catch (error) {
    toastError(error)
    return null
  }
}

const describeTitleProgress = (achievement) => {
  const { title, solvedCount } = achievement
  return title.nextName ? `再通过 ${title.nextMinSolved - solvedCount} 关晋升「${title.nextName}」` : '已达最高段位'
}

module.exports = { openMilestoneChests, describeTitleProgress }
