// pages/mine/mine.js — 我的（会员中心占位）
Page({
  data: {
    freeQuota: 3,
    membership: null  // { expireAt, plan } 未开通为 null
  },

  onShow() {
    const app = getApp()
    this.setData({ freeQuota: app.globalData.freeQuota })
  },

  // TODO: 接入微信虚拟支付 wx.requestVirtualPayment
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
