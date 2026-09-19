// pages/mine/mine.js — 我的（会员中心）
const api = require('../../utils/api')

Page({
  data: {
    quotaUsed: 0,
    quotaFree: 3,
    isMember: false,
    unlimited: false,
    levelLabel: '',
    expireText: '',
    openid: '',
    env: '',
    showDev: false,   // 连点标题 5 次唤出的开发者入口
    tapCount: 0,
    tapTimer: null
  },

  onShow() {
    this.refreshQuota()
  },

  async refreshQuota() {
    try {
      const q = await api.getQuota()
      this.setData({
        quotaUsed: q.used,
        quotaFree: q.free,
        isMember: !!q.isMember,
        unlimited: !!q.unlimited,
        levelLabel: q.levelLabel || (q.isMember ? '会员' : ''),
        expireText: this.formatExpire(q.expireAt),
        openid: q.openid || '',
        env: q.env || ''
      })
    } catch (e) { /* 静默 */ }
  },

  /** 到期时间文案：null = 永久 */
  formatExpire(expireAt) {
    if (!expireAt) return ''
    const d = new Date(expireAt)
    if (isNaN(d.getTime())) return ''
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 到期`
  },

  // 连点「我的账户」5 次 → 唤出开发者入口（自测/给体验成员开白名单用）
  onTitleTap() {
    if (this.data.showDev) return
    if (this.data.tapTimer) clearTimeout(this.data.tapTimer)
    const n = this.data.tapCount + 1
    if (n >= 5) {
      this.setData({ tapCount: 0, showDev: true })
      wx.showToast({ title: '开发者模式已开启', icon: 'none' })
      return
    }
    this.setData({
      tapCount: n,
      tapTimer: setTimeout(() => this.setData({ tapCount: 0 }), 2000)
    })
  },

  // 开发者口令：输入正确即把当前微信永久加入免费白名单（不限次）
  devActivate() {
    wx.showModal({
      title: '开发者口令',
      content: '输入口令后，当前微信将永久免额度',
      editable: true,
      placeholderText: '请输入口令',
      success: async (res) => {
        if (!res.confirm) return
        const pass = (res.content || '').trim()
        if (!pass) return
        wx.showLoading({ title: '激活中', mask: true })
        try {
          await api.bindMember(pass)
          wx.hideLoading()
          await this.refreshQuota()
          wx.showModal({ title: '激活成功', content: '当前微信已永久免额度（不限次数）', showCancel: false })
        } catch (e) {
          wx.hideLoading()
          wx.showModal({ title: '激活失败', content: e.message || '请检查口令后重试', showCancel: false })
        }
      }
    })
  },

  copyOpenid() {
    const id = this.data.openid
    if (!id) {
      wx.showToast({ title: '未获取到 openid', icon: 'none' })
      return
    }
    wx.setClipboardData({ data: id })
  },

  // 兑换码核销：输入白名单/会员兑换码
  redeem() {
    wx.showModal({
      title: '兑换码',
      editable: true,
      placeholderText: '请输入兑换码',
      success: async (res) => {
        if (!res.confirm) return
        const code = (res.content || '').trim()
        if (!code) {
          wx.showToast({ title: '请输入兑换码', icon: 'none' })
          return
        }
        wx.showLoading({ title: '兑换中', mask: true })
        try {
          const r = await api.redeemCode(code)
          wx.hideLoading()
          await this.refreshQuota()
          const tip = r.days > 0 ? `已开通 ${r.days} 天免费权益` : '已开通永久免费权益'
          wx.showModal({ title: '兑换成功', content: tip, showCancel: false })
        } catch (e) {
          wx.hideLoading()
          wx.showModal({
            title: '兑换失败',
            content: e.message || '请检查兑换码后重试',
            showCancel: false
          })
        }
      }
    })
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
