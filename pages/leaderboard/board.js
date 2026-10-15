const { leaderboard, sprint, toastError } = require('../../utils/api')
const { ensureLogin, getSession } = require('../../utils/session')
const { DEFAULT_SHARE, buildRankShare } = require('../../utils/share')
const { gameConfigOf } = require('../../utils/games')
const { sprintSubjectOf, sprintUrlOf } = require('../../utils/sprint')
const { SPRINT_BOARD, withDisplayName } = require('./board-shared')
const { openPage } = require('../../utils/navigation')

// One board in full, opened from a card on the leaderboard tab: board = a level game, or a 竞速 (口算 / 识字, one board
// per track, chosen with the dropdown here; score = right − wrong, weekly unless 控制中心 turns that off).
const PODIUM_SIZE = 3

// While the board has empty places, say so: anyone who has cleared one level is already on it.
const describeOpenSeats = (size, taken) => {
  if (!taken || taken >= size) return ''
  return `榜单刚开张，还有 ${size - taken} 个空位，闯过 1 关就能上榜！`
}

Page({
  data: {
    loading: true,
    // The board never loaded (network): show a retry card, not "nobody on the board yet".
    loadFailed: false,
    boardId: '',
    isSprint: false,
    subjectId: '',
    sprintName: '',
    thisTrack: '',
    trackWord: '',
    trackIcon: '',
    islandId: '',
    islandIndex: 0,
    islandName: '',
    islands: [],
    ruleText: '',
    unit: '关',
    entries: [],
    openSeatsText: '',
    me: null,
    podiumSize: PODIUM_SIZE
  },

  // ?board=<gameType | sprint>; a 竞速 also has &subject=<math | chinese> and optionally &island=<track id> (the card
  // opens the player's best track).
  onLoad(query) {
    const isSprint = query.board === SPRINT_BOARD
    if (isSprint) {
      const subject = sprintSubjectOf(query.subject)
      const islandIndex = Math.max(subject.tracks.findIndex((track) => track.id === query.island), 0)
      const track = subject.tracks[islandIndex]
      this.setData({ subjectId: subject.id, sprintName: subject.name, thisTrack: subject.thisTrack, trackWord: subject.trackWord, trackIcon: subject.trackIcon, islands: subject.tracks, islandIndex, islandId: track.id, islandName: track.name })
    }
    this.setData({ boardId: query.board, isSprint })
    wx.setNavigationBarTitle({ title: `${isSprint ? this.data.sprintName : gameConfigOf(query.board).name} · 排行榜` })
    this.loadLeaderboard()
  },

  pickIsland(event) {
    const islandIndex = Number(event.detail.value)
    const island = this.data.islands[islandIndex]
    if (!island || island.id === this.data.islandId) return
    this.setData({ islandId: island.id, islandIndex, islandName: island.name, loading: true })
    this.loadLeaderboard()
  },

  onPullDownRefresh() {
    this.loadLeaderboard().then(() => wx.stopPullDownRefresh())
  },

  boardKey() {
    return this.data.isSprint ? `${SPRINT_BOARD}:${this.data.islandId}` : this.data.boardId
  },

  async loadLeaderboard() {
    const key = this.boardKey()
    try {
      await ensureLogin()
      const view = this.data.isSprint ? await this.loadSprintBoard() : await this.loadLevelBoard()
      if (key !== this.boardKey()) return
      this.loadedKey = key
      this.setData({ loading: false, loadFailed: false, ...view })
    } catch (error) {
      // A failed pull-down refresh keeps the board already on screen; only a board with nothing to show needs the card.
      if (key !== this.boardKey()) return
      this.setData({ loading: false, loadFailed: this.loadedKey !== key })
      toastError(error)
    }
  },

  async loadLevelBoard() {
    const result = await leaderboard.list(this.data.boardId)
    return {
      ruleText: `按闯过的关数排名，展示前 ${result.size} 名`,
      unit: '关',
      entries: result.entries.map((entry) => withDisplayName({ ...entry, value: entry.solvedCount, detail: entry.titleName })),
      openSeatsText: describeOpenSeats(result.size, result.entries.length),
      me: withDisplayName({ ...result.me, value: result.me.solvedCount, detail: result.me.rank ? result.me.titleName : '还没上榜，闯过 1 关就能上榜' })
    }
  },

  // 竞速 entries carry score and right / wrong counts; the player's own row is built from the session profile.
  async loadSprintBoard() {
    const result = await sprint.board(this.data.islandId)
    const profile = (getSession() || {}).profile || {}
    const mine = result.me
    const meRow = withDisplayName({
      nickname: profile.nickname,
      avatarUrl: profile.avatarUrl,
      rank: mine ? mine.rank : 0,
      value: mine ? mine.score : 0,
      detail: mine ? `对 ${mine.correct} · 错 ${mine.wrong}` : `还没挑战过${this.data.thisTrack}`,
      inTop: result.entries.some((entry) => entry.isMe)
    })
    return {
      ruleText: `${result.weekly ? '本周' : '总榜'} · 得分 = 答对 − 答错，同分答错少的在前`,
      unit: '分',
      entries: result.entries.map((entry) => withDisplayName({ ...entry, value: entry.score, detail: `对 ${entry.correct} · 错 ${entry.wrong}` })),
      openSeatsText: '',
      me: meRow
    }
  },

  openSprint() {
    openPage(sprintUrlOf(this.data.subjectId, this.data.islandId))
  },

  retryLoad() {
    this.setData({ loading: true, loadFailed: false })
    this.loadLeaderboard()
  },

  onShareAppMessage() {
    const { me, isSprint, sprintName, islandName, boardId } = this.data
    if (!me || !me.rank) return DEFAULT_SHARE
    if (isSprint) return buildRankShare(`我在${sprintName}「${islandName}」排第 ${me.rank} 名，得了 ${me.value} 分，来比比！`)
    return buildRankShare(`我在${gameConfigOf(boardId).name}排行榜第 ${me.rank} 名，已闯过 ${me.value} 关，来挑战我！`)
  }
})
