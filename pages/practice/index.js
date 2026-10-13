const { PRACTICES } = require('../../utils/practice/registry')
const { DEFAULT_SHARE } = require('../../utils/share')
const { practice } = require('../../utils/api')
const { waitForPendingReport } = require('../../utils/practice/pending-report')

const HONORS_URL = '/pages/practice/honors'
// Shown until the cloud answers, so the card keeps its place and the list below does not jump.
const PLACEHOLDER_HONORS = { flowers: '—', todayFlowers: 0, unlockedCount: '—', medalCount: '—', dayStreak: '—' }

Page({
  data: {
    practices: PRACTICES,
    honors: PLACEHOLDER_HONORS
  },

  async onShow() {
    try {
      await waitForPendingReport()
      this.setData({ honors: await practice.honors() })
    } catch (error) {
      console.error('[practice] honors unavailable', error)
    }
  },

  openHonors() {
    wx.navigateTo({ url: HONORS_URL })
  },

  openPractice(event) {
    wx.navigateTo({ url: event.currentTarget.dataset.url })
  },

  onShareAppMessage() {
    return DEFAULT_SHARE
  }
})
