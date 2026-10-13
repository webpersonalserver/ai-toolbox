const { PRACTICES } = require('../../utils/practice/registry')
const { DEFAULT_SHARE } = require('../../utils/share')
const { practice } = require('../../utils/api')

const HONORS_URL = '/pages/practice/honors'

Page({
  data: {
    practices: PRACTICES,
    honors: null
  },

  async onShow() {
    try {
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
