const { admin, toastError } = require('../../utils/api')
const { ensureLogin } = require('../../utils/session')
const { GAME_ORDER, gameConfigOf } = require('../../utils/games')

const PERCENT_DIGITS = 2
const NO_NICKNAME_TEXT = '未设置昵称'

const formatRate = (rate) => `${(rate * 100).toFixed(PERCENT_DIGITS)}%`

const formatDate = (dateKey) => `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`

Page({
  data: {
    loading: true,
    gameType: GAME_ORDER[0],
    gameTabs: GAME_ORDER.map((gameType) => gameConfigOf(gameType)),
    current: null,
    recentCompletions: [],
    dailyHistory: []
  },

  onShow() {
    this.loadStats()
  },

  switchGame(event) {
    const { gameType } = event.currentTarget.dataset
    if (gameType === this.data.gameType) return
    this.setData({ gameType, loading: true })
    this.loadStats()
  },

  onPullDownRefresh() {
    this.loadStats().then(() => wx.stopPullDownRefresh())
  },

  async loadStats() {
    try {
      const session = await ensureLogin()
      if (!session.isAdmin) {
        wx.showToast({ title: '没有权限', icon: 'none' })
        wx.navigateBack()
        return
      }
      const result = await admin.stats(this.data.gameType)
      this.setData({
        loading: false,
        current: { ...result.current, clearRateText: formatRate(result.current.clearRate) },
        recentCompletions: result.recentCompletions.map((completion) => ({
          ...completion,
          displayName: completion.nickname || NO_NICKNAME_TEXT,
          dateText: formatDate(completion.date)
        })),
        dailyHistory: result.dailyHistory.map((snapshot) => ({
          ...snapshot,
          dateText: formatDate(snapshot.date),
          clearRateText: formatRate(snapshot.clearRate)
        }))
      })
    } catch (error) {
      this.setData({ loading: false })
      toastError(error)
    }
  },

  copyOpenid(event) {
    wx.setClipboardData({ data: event.currentTarget.dataset.openid })
  }
})
