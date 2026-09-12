// components/paywall/paywall.js — 付费弹窗组件
Component({
  properties: {
    visible: { type: Boolean, value: false },
    used: { type: Number, value: 0 },
    free: { type: Number, value: 3 }
  },
  methods: {
    close() {
      this.triggerEvent('close')
    },
    payOnce() {
      // TODO: 接入微信虚拟支付 wx.requestVirtualPayment → 调云函数解锁 1 次
      wx.showToast({ title: '单次支付功能接入中', icon: 'none' })
      this.triggerEvent('purchased', { plan: 'once' })
    },
    payMonthly() {
      // TODO: 接入虚拟支付 → 调云函数开通包月会员（无限次）
      wx.showToast({ title: '包月会员接入中', icon: 'none' })
      this.triggerEvent('purchased', { plan: 'monthly' })
    },
    paySeason() {
      wx.showToast({ title: '包季会员接入中', icon: 'none' })
      this.triggerEvent('purchased', { plan: 'season' })
    },
    // 防止点击蒙层内容冒泡
    noop() {}
  }
})