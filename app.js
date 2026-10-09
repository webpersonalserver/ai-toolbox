const CLOUD_ENV_ID = 'cloud1-d8g9yyxwe128b2185'

App({
  globalData: {
    session: null
  },
  onLaunch() {
    wx.cloud.init({ env: CLOUD_ENV_ID, traceUser: true })
  }
})
