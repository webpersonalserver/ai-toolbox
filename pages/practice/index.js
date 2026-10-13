const { PRACTICES } = require('../../utils/practice/registry')
const { DEFAULT_SHARE } = require('../../utils/share')

Page({
  data: {
    practices: PRACTICES
  },

  openPractice(event) {
    wx.navigateTo({ url: event.currentTarget.dataset.url })
  },

  onShareAppMessage() {
    return DEFAULT_SHARE
  }
})
