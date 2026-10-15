const { admin, toastError } = require('../../utils/api')
const { ensureLogin, getSession } = require('../../utils/session')
const { GAME_ORDER, gameConfigOf } = require('../../utils/games')
const { sprintSubjectOf } = require('../../utils/sprint')

// 数据统计, in the order it matters: are children using it (today, trend), what they play, where they get stuck,
// whether hints are about right, 求助. The per-game part (卡关 and 通关) follows the game tabs.
const PERCENT_DIGITS = 2
const NO_NICKNAME_TEXT = '未设置昵称'
const STUCK_SORTS = { FAILS: 'fails', HINTS: 'hints' }

const formatRate = (rate) => `${(rate * 100).toFixed(PERCENT_DIGITS)}%`
const formatDate = (dateKey) => `${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`
const percentOf = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '—')

const toOverviewView = (overview) => ({
  ...overview,
  retentionText: overview.newYesterday ? `${percentOf(overview.retained, overview.newYesterday)}（${overview.retained}/${overview.newYesterday}）` : '昨天没有新人',
  games: GAME_ORDER.map((gameType) => overview.games.find((row) => row.gameType === gameType))
    .filter(Boolean)
    .map((row) => ({ ...row, name: gameConfigOf(row.gameType).name })),
  sprints: overview.sprints.map((row) => ({ ...row, name: sprintSubjectOf(row.subject).name })),
  trend: overview.trend.map((day) => ({ ...day, dateText: formatDate(day.date) }))
})

Page({
  data: {
    loading: true,
    overview: null,
    gameType: GAME_ORDER[0],
    gameTabs: GAME_ORDER.map((gameType) => gameConfigOf(gameType)),
    stuckSort: STUCK_SORTS.FAILS,
    stuck: { byFails: [], byHints: [] },
    stuckRows: [],
    current: null,
    recentCompletions: [],
    showAds: false,
    adStats: []
  },

  onShow() {
    this.loadAll()
  },

  onPullDownRefresh() {
    this.loadAll().then(() => wx.stopPullDownRefresh())
  },

  async loadAll() {
    try {
      const session = await ensureLogin()
      if (!session.isAdmin) {
        wx.showToast({ title: '没有权限', icon: 'none' })
        wx.navigateBack()
        return
      }
      const overview = await admin.overview()
      this.setData({ loading: false, overview: toOverviewView(overview), showAds: Boolean((getSession() || session).rules.ad.enabled) })
      await this.loadGame()
    } catch (error) {
      this.setData({ loading: false })
      toastError(error)
    }
  },

  // The tabbed part: 卡关 for the game, and its 通关 numbers.
  async loadGame() {
    const requested = this.data.gameType
    try {
      const [stuck, stats] = await Promise.all([admin.stuckLevels(requested), admin.stats(requested)])
      if (requested !== this.data.gameType) return
      this.setData({
        stuck,
        stuckRows: this.data.stuckSort === STUCK_SORTS.HINTS ? stuck.byHints : stuck.byFails,
        current: { ...stats.current, clearRateText: formatRate(stats.current.clearRate) },
        recentCompletions: stats.recentCompletions.map((completion) => ({
          ...completion,
          displayName: completion.nickname || NO_NICKNAME_TEXT,
          dateText: formatDate(completion.date)
        })),
        adStats: (stats.adStats || []).map((day) => ({ ...day, dateText: formatDate(day.date) }))
      })
    } catch (error) {
      toastError(error)
    }
  },

  switchGame(event) {
    const { gameType } = event.currentTarget.dataset
    if (gameType === this.data.gameType) return
    this.setData({ gameType, stuck: { byFails: [], byHints: [] }, stuckRows: [], current: null })
    this.loadGame()
  },

  switchStuckSort(event) {
    const { sort } = event.currentTarget.dataset
    this.setData({ stuckSort: sort, stuckRows: sort === STUCK_SORTS.HINTS ? this.data.stuck.byHints : this.data.stuck.byFails })
  },

  copyOpenid(event) {
    wx.setClipboardData({ data: event.currentTarget.dataset.openid })
  }
})
