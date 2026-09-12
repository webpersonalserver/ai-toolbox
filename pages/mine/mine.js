// pages/mine/mine.js — 我的（会员中心）
const api = require('../../utils/api')

Page({
  data: {
    quotaUsed: 0,
    quotaFree: 3,
    isMember: false
  },

  onShow() {
    this.refreshQuota()
  },

  async refreshQuota() {
    try {
      const q = await api.getQuota()
      this.setData({ quotaUsed: q.used, quotaFree: q.free, isMember: q.isMember })
    } catch (e) { /* 静默 */ }
  },

  // TODO: 接入微信虚拟支付 wx.requestVirtualPayment → 调云函数开通会员
  buyMembership() {
    wx.showModal({
      title: '会员开通',
      content: '会员体系将在支付功能联调后上线（9.9元/月 · 无水印 · 无限次）',
      showCancel: false
    })
  },

  about() {
    wx.showModal({
      title: '关于',
      content: 'AI 照片工具箱 v0.1.0\n老照片修复 · AI 证件照',
      showCancel: false
    })
  }
})