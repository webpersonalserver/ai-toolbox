const LEADERBOARD_PATH = '/pages/leaderboard/leaderboard'

// Tab pages cannot receive query params, so the requested game is handed over via globalData.
const openLeaderboardTab = (gameType) => {
  getApp().globalData.pendingLeaderboardGameType = gameType || ''
  wx.switchTab({ url: LEADERBOARD_PATH })
}

const takePendingLeaderboardGameType = () => {
  const { globalData } = getApp()
  const gameType = globalData.pendingLeaderboardGameType
  globalData.pendingLeaderboardGameType = ''
  return gameType
}

module.exports = { openLeaderboardTab, takePendingLeaderboardGameType }
