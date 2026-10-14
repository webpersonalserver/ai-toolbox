const { refreshCloudImages } = require('./utils/assets')

const CLOUD_ENV_ID = 'cloud1-d8g9yyxwe128b2185'

App({
  globalData: {
    session: null,
    pendingLeaderboardGameType: ''
  },
  onLaunch() {
    wx.cloud.init({ env: CLOUD_ENV_ID, traceUser: true })
    refreshCloudImages()
  },
  // Image links last a day; an app left in the background that long fetches new ones when it comes back.
  onShow() {
    refreshCloudImages()
  }
})
