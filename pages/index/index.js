const { game, toastError } = require('../../utils/api')
const { ensureLogin, getSession } = require('../../utils/session')
const { checkinToday } = require('../../utils/checkin')
const { describeRewards, describeStaminaRecovery } = require('../../utils/items')
const { DEFAULT_SHARE } = require('../../utils/share')
const { showRescueNotices } = require('../../utils/rescue-notice')
const { describeTitleProgress } = require('../../utils/milestone')
const { GAME_ORDER, gameConfigOf } = require('../../utils/games')

const toGameCard = (gameType, levelList) => {
  const config = gameConfigOf(gameType)
  return {
    ...config,
    solvedCount: levelList.solved.length,
    total: levelList.total,
    titleName: levelList.achievement.title.name,
    titleProgressText: describeTitleProgress(levelList.achievement),
    pendingChests: levelList.achievement.milestone.pendingChests,
    allCleared: levelList.allCleared
  }
}

Page({
  data: {
    loading: true,
    items: { hint: 0, stamina: 0 },
    staminaRecoveryText: '',
    checkedIn: false,
    checkinRewardText: '',
    gameCards: GAME_ORDER.map((gameType) => gameConfigOf(gameType))
  },

  onShow() {
    this.refresh()
  },

  async refresh() {
    try {
      await ensureLogin({ force: true })
      const levelLists = await Promise.all(GAME_ORDER.map((gameType) => game.levelList(gameType)))
      this.syncSession()
      this.setData({
        loading: false,
        gameCards: GAME_ORDER.map((gameType, index) => toGameCard(gameType, levelLists[index]))
      })
      showRescueNotices(
        GAME_ORDER.flatMap((gameType, index) =>
          levelLists[index].rescueNotices.map((notice) => ({ ...notice, gameName: gameConfigOf(gameType).name }))
        )
      )
    } catch (error) {
      this.setData({ loading: false })
      toastError(error)
    }
  },

  syncSession() {
    const session = getSession()
    if (!session) return
    this.setData({
      items: session.items,
      staminaRecoveryText: describeStaminaRecovery(session.items),
      checkedIn: session.today.checkedIn,
      checkinRewardText: describeRewards(session.rules.checkinRewards)
    })
  },

  async handleCheckin() {
    if (await checkinToday()) this.syncSession()
  },

  openLeaderboard() {
    wx.navigateTo({ url: '/pages/leaderboard/leaderboard' })
  },

  openGame(event) {
    wx.navigateTo({ url: `/pages/game/levels/levels?gameType=${event.currentTarget.dataset.gameType}` })
  },

  onShareAppMessage() {
    return DEFAULT_SHARE
  }
})
