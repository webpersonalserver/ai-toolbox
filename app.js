// app.js — 全局入口
App({
  globalData: {
    userInfo: null,
    // 用户免费额度（本地缓存，正式版以服务端为准）
    freeQuota: 3
  },
  onLaunch() {
    // 初始化云开发（开通云环境后填入环境 ID）
    // wx.cloud.init({ env: 'your-env-id', traceUser: true })
  }
})
