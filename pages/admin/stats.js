const { admin, toastError } = require('../../utils/api')
const { ensureLogin } = require('../../utils/session')

const PERCENT_DIGITS = 2
const NO_NICKNAME_TEXT = '未设置昵称'

const formatRate = (rate) => `${(rate * 100).toFixed(PERCENT_DIGITS)}%`

const formatDate = (dateKey) => `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`

Page({
  data: {
    loading: true,
    current: null,
    recentCompletions: [],
    dailyHistory: []
  },

  onShow() {
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
      const result = await admin.stats()
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
