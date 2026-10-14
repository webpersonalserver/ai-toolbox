const { game, toastError } = require('../../../utils/api')
const { ensureLogin } = require('../../../utils/session')
const { DEFAULT_SHARE } = require('../../../utils/share')
const { gameConfigOf, GAME_TYPES } = require('../../../utils/games')

// Only these entries have more to show when opened (出处 / 释义); tapping the others would do nothing.
const EXPANDABLE_GAME_TYPES = [GAME_TYPES.IDIOM, GAME_TYPES.TYPO]

Page({
  data: {
    loading: true,
    // The first page failed (network): show a retry card rather than the "nothing collected yet" empty state.
    loadFailed: false,
    expandable: false,
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
    this.setData({
      gameType: gameConfig.gameType,
      game: gameConfig,
      expandable: EXPANDABLE_GAME_TYPES.includes(gameConfig.gameType)
    })
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
      const changes = { total: result.total, page: nextPage, hasMore: result.hasMore, loading: false, loadFailed: false }
      result.entries.forEach((entry, offset) => {
        changes[`entries[${startIndex + offset}]`] = entry
      })
      this.setData(changes)
    } catch (error) {
      toastError(error)
      this.setData({ loading: false, loadFailed: this.data.page === 0 })
    } finally {
      this.setData({ loadingMore: false })
    }
  },

  retryLoad() {
    this.setData({ loading: true, loadFailed: false })
    this.loadNextPage()
  },

  goPlay() {
    wx.navigateBack()
  },

  toggleEntry(event) {
    if (!this.data.expandable) return
    const { levelNo } = event.currentTarget.dataset
    this.setData({ expandedLevelNo: this.data.expandedLevelNo === levelNo ? 0 : levelNo })
  },

  onShareAppMessage() {
    return DEFAULT_SHARE
  }
})
