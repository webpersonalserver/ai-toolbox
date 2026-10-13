const { leaderboard, toastError } = require('../../utils/api')
const { ensureLogin } = require('../../utils/session')
const { DEFAULT_SHARE, buildRankShare } = require('../../utils/share')
const { GAME_ORDER, gameConfigOf } = require('../../utils/games')
const { takePendingLeaderboardGameType } = require('../../utils/navigation')

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

// While the board has empty places, say so: anyone who has cleared one level is already on it.
const describeOpenSeats = (size, taken) => {
  if (!taken || taken >= size) return ''
  return `榜单刚开张，还有 ${size - taken} 个空位，闯过 1 关就能上榜！`
}

Page({
  data: {
    loading: true,
    gameType: '',
    gameTabs: GAME_ORDER.map((gameType) => gameConfigOf(gameType)),
    size: 0,
    entries: [],
    openSeatsText: '',
    me: null,
    podiumSize: PODIUM_SIZE
  },

  onShow() {
    const requestedGameType = takePendingLeaderboardGameType()
    const gameType = requestedGameType || this.data.gameType || GAME_ORDER[0]
    this.setData({ gameType: gameConfigOf(gameType).gameType })
    this.loadLeaderboard()
  },

  switchGame(event) {
    const { gameType } = event.currentTarget.dataset
    if (gameType === this.data.gameType) return
    this.setData({ gameType, loading: true })
    this.loadLeaderboard()
  },

  onPullDownRefresh() {
    this.loadLeaderboard().then(() => wx.stopPullDownRefresh())
  },

  async loadLeaderboard() {
    try {
      await ensureLogin()
      const result = await leaderboard.list(this.data.gameType)
      this.setData({
        loading: false,
        size: result.size,
        entries: result.entries.map(withDisplayName),
        openSeatsText: describeOpenSeats(result.size, result.entries.length),
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
    return buildRankShare(`我在${gameConfigOf(this.data.gameType).name}排行榜第 ${me.rank} 名，已闯过 ${me.solvedCount} 关，来挑战我！`)
  }
})
