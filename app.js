// app.js — 全局入口
App({
  globalData: {
    userInfo: null,
    // 用户免费额度（本地缓存，正式版以服务端为准）
    freeQuota: 3
  },
  onLaunch() {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('基础库版本过低，请升级到 2.2.3 以上以使用云能力')
      return
    }
    wx.cloud.init({
      env: 'cloud1-d8g9yyxwe128b2185',
      traceUser: true
    })
  }
})
