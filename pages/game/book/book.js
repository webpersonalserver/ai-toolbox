const { game, toastError } = require('../../../utils/api')
const { ensureLogin } = require('../../../utils/session')
const { DEFAULT_SHARE } = require('../../../utils/share')
const { gameConfigOf, clueLabelOf, splitTypoClue } = require('../../../utils/games')
const { splitClue } = require('../../../utils/clue')
const { openPage, backToLevels } = require('../../../utils/navigation')

// A game's 复习本: the levels passed with help (wrong answers, a lost attempt, hints, a friend), question only.
// Two things to do with each: 我会了 crosses it out (after a confirm — it cannot be brought back), 再练一次 replays it
// for free without hints; after getting it right there the child chooses to cross it out or keep it.
const EMPTY_PAGE = { entries: [], total: 0, page: 0, hasMore: true }

const reasonTagsOf = ({ wrongCount, fails, hintsUsed, rescued }) =>
  [wrongCount ? `答错 ${wrongCount} 次` : '', fails ? `失败 ${fails} 次` : '', hintsUsed ? `提示 ${hintsUsed} 次` : '', rescued ? '好友帮过' : ''].filter(Boolean)

const toEntryView = (entry, gameConfig) => ({
  ...entry,
  label: clueLabelOf(gameConfig, entry),
  clueSegments: splitClue(entry.clue),
  clueChars: splitTypoClue(entry.clue, entry.wrongPosition),
  tags: reasonTagsOf(entry)
})

Page({
  data: {
    loading: true,
    // The first page failed (network): show a retry card rather than "nothing to review".
    loadFailed: false,
    gameType: '',
    game: null,
    loadingMore: false,
    dismissingLevelNo: 0,
    ...EMPTY_PAGE
  },

  onLoad(query) {
    const gameConfig = gameConfigOf(query.gameType)
    this.setData({ gameType: gameConfig.gameType, game: gameConfig })
    wx.setNavigationBarTitle({ title: `复习本 · ${gameConfig.name}` })
  },

  // Coming back from 再练一次 the list may have changed (crossed out there), so it is loaded again.
  onShow() {
    this.reload()
  },

  // A new load makes any answer still on its way stale (generation), so two loads never pile up the same levels.
  reload() {
    this.generation = (this.generation || 0) + 1
    this.setData({ ...EMPTY_PAGE, loadingMore: false })
    return this.loadNextPage()
  },

  onReachBottom() {
    this.loadNextPage()
  },

  async loadNextPage() {
    if (this.data.loadingMore || !this.data.hasMore) return
    const { generation } = this
    this.setData({ loadingMore: true })
    try {
      await ensureLogin()
      const nextPage = this.data.page + 1
      const result = await game.reviewList(this.data.gameType, nextPage)
      if (generation !== this.generation) return
      const shown = new Set(this.data.entries.map((entry) => entry.levelNo))
      const added = result.entries.filter((entry) => !shown.has(entry.levelNo)).map((entry) => toEntryView(entry, this.data.game))
      this.setData({
        entries: [...this.data.entries, ...added],
        total: result.total,
        page: nextPage,
        hasMore: result.hasMore,
        loading: false,
        loadFailed: false
      })
    } catch (error) {
      if (generation !== this.generation) return
      toastError(error)
      this.setData({ loading: false, loadFailed: this.data.page === 0 })
    } finally {
      if (generation === this.generation) this.setData({ loadingMore: false })
    }
  },

  retryLoad() {
    this.setData({ loading: true, loadFailed: false })
    this.reload()
  },

  goPlay() {
    backToLevels(this.data.gameType)
  },

  practiseAgain(event) {
    openPage(`/pages/game/play/play?gameType=${this.data.gameType}&levelNo=${event.currentTarget.dataset.levelNo}&review=1`)
  },

  // 我会了: asked once, since a crossed-out level cannot be brought back.
  dismiss(event) {
    const { levelNo } = event.currentTarget.dataset
    if (this.data.dismissingLevelNo) return
    wx.showModal({
      title: '确定会了吗？',
      content: `第 ${levelNo} 关会从复习本里移走，移走后就找不回来了`,
      confirmText: '我会了',
      cancelText: '再想想',
      success: async ({ confirm }) => {
        if (!confirm) return
        this.setData({ dismissingLevelNo: levelNo })
        try {
          await game.dismissReview(this.data.gameType, levelNo)
          this.setData({ entries: this.data.entries.filter((entry) => entry.levelNo !== levelNo), total: this.data.total - 1 })
          wx.showToast({ title: '真棒，又会了一个！', icon: 'none' })
        } catch (error) {
          toastError(error)
        } finally {
          this.setData({ dismissingLevelNo: 0 })
        }
      }
    })
  },

  onShareAppMessage() {
    return DEFAULT_SHARE
  }
})
