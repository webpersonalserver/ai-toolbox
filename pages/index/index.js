const { idiom, toastError } = require('../../utils/api')
const { ensureLogin, getSession } = require('../../utils/session')
const { checkinToday } = require('../../utils/checkin')
const { describeRewards, describeStaminaRecovery } = require('../../utils/items')
const { DEFAULT_SHARE } = require('../../utils/share')
const { showRescueNotices } = require('../../utils/rescue-notice')
const { describeTitleProgress } = require('../../utils/milestone')

Page({
  data: {
    loading: true,
    items: { hint: 0, stamina: 0 },
    staminaRecoveryText: '',
    checkedIn: false,
    checkinRewardText: '',
    idiomProgress: null
  },

  onShow() {
    this.refresh()
  },

  async refresh() {
    try {
      await ensureLogin({ force: true })
      const levelList = await idiom.levelList()
      this.syncSession()
      this.setData({
        loading: false,
        idiomProgress: {
          currentLevel: levelList.currentLevel,
          solvedCount: levelList.solved.length,
          total: levelList.total,
          titleName: levelList.achievement.title.name,
          titleProgressText: describeTitleProgress(levelList.achievement),
          pendingChests: levelList.achievement.milestone.pendingChests
        }
      })
      showRescueNotices(levelList.rescueNotices)
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

  openIdiomGame() {
    wx.navigateTo({ url: '/pages/idiom/levels/levels' })
  },

  onShareAppMessage() {
    return DEFAULT_SHARE
  }
})
