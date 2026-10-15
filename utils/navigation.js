const LEADERBOARD_PATH = '/pages/leaderboard/leaderboard'
// A second tap while the next page is still opening is ignored (a child's double tap would open it twice).
const OPEN_PAGE_GAP_MS = 800
let lastOpenedAt = 0

const openPage = (url) => {
  const now = Date.now()
  if (now - lastOpenedAt < OPEN_PAGE_GAP_MS) return
  lastOpenedAt = now
  wx.navigateTo({ url, fail: () => { lastOpenedAt = 0 } })
}

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

const LEVELS_ROUTE = 'pages/game/levels/levels'

// 关卡列表 from a level page: back when the list is the page below, otherwise (opened from the lobby, 我的, a share)
// the list replaces this page, so the button never lands somewhere else.
const backToLevels = (gameType) => {
  const pages = getCurrentPages()
  const below = pages[pages.length - 2]
  if (below && below.route === LEVELS_ROUTE && below.options && below.options.gameType === gameType) {
    wx.navigateBack()
    return
  }
  wx.redirectTo({ url: `/${LEVELS_ROUTE}?gameType=${gameType}` })
}

module.exports = { openPage, backToLevels, openLeaderboardTab, takePendingLeaderboardGameType }
