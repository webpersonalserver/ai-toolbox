const { game, toastError } = require('../../../utils/api')
const { ensureLogin } = require('../../../utils/session')
const { DEFAULT_SHARE } = require('../../../utils/share')
const { gameConfigOf } = require('../../../utils/games')

Page({
  data: {
    loading: true,
    gameType: '',
    game: null,
    loadingMore: false,
    entries: [],
    total: 0,
    page: 0,
    hasMore: true,
    expandedLevelNo: 0
  },

  onLoad(query) {
    const gameConfig = gameConfigOf(query.gameType)
    this.setData({ gameType: gameConfig.gameType, game: gameConfig })
    wx.setNavigationBarTitle({ title: `我的${gameConfig.bookName}` })
    this.loadNextPage()
  },

  onReachBottom() {
    this.loadNextPage()
  },

  async loadNextPage() {
    if (this.data.loadingMore || !this.data.hasMore) return
    this.setData({ loadingMore: true })
    try {
      await ensureLogin()
      const nextPage = this.data.page + 1
      const result = await game.solvedBook(this.data.gameType, nextPage)
      const startIndex = this.data.entries.length
      const changes = { total: result.total, page: nextPage, hasMore: result.hasMore, loading: false }
      result.entries.forEach((entry, offset) => {
        changes[`entries[${startIndex + offset}]`] = entry
      })
      this.setData(changes)
    } catch (error) {
      toastError(error)
      this.setData({ loading: false })
    } finally {
      this.setData({ loadingMore: false })
    }
  },

  toggleEntry(event) {
    const { levelNo } = event.currentTarget.dataset
    this.setData({ expandedLevelNo: this.data.expandedLevelNo === levelNo ? 0 : levelNo })
  },

  onShareAppMessage() {
    return DEFAULT_SHARE
  }
})
