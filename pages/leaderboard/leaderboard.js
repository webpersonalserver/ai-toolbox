const { leaderboard, toastError } = require('../../utils/api')
const { ensureLogin } = require('../../utils/session')
const { DEFAULT_SHARE } = require('../../utils/share')

const ANONYMOUS_NAME = '匿名玩家'
const PODIUM_SIZE = 3

const UNRANKED_TEXT = '-'

const withDisplayName = (entry) => {
  const displayName = entry.nickname || ANONYMOUS_NAME
  return {
    ...entry,
    displayName,
    initial: displayName.slice(0, 1),
    rankText: entry.rank ? String(entry.rank) : UNRANKED_TEXT
  }
}

Page({
  data: {
    loading: true,
    size: 0,
    entries: [],
    me: null,
    podiumSize: PODIUM_SIZE
  },

  onShow() {
    this.loadLeaderboard()
  },

  onPullDownRefresh() {
    this.loadLeaderboard().then(() => wx.stopPullDownRefresh())
  },

  async loadLeaderboard() {
    try {
      await ensureLogin()
      const result = await leaderboard.list()
      this.setData({
        loading: false,
        size: result.size,
        entries: result.entries.map(withDisplayName),
        me: withDisplayName(result.me)
      })
    } catch (error) {
      this.setData({ loading: false })
      toastError(error)
    }
  },

  onShareAppMessage() {
    const { me } = this.data
    if (!me || !me.rank) return DEFAULT_SHARE
    return { ...DEFAULT_SHARE, title: `我在猜成语排行榜第 ${me.rank} 名，已闯过 ${me.solvedCount} 关，来挑战我！` }
  }
})
