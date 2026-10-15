const { leaderboard, sprint, toastError } = require('../../utils/api')
const { ensureLogin, getSession } = require('../../utils/session')
const { DEFAULT_SHARE, buildRankShare } = require('../../utils/share')
const { gameConfigOf } = require('../../utils/games')
const { takePendingLeaderboardGameType } = require('../../utils/navigation')
const { SUBJECTS, subjectOfGame } = require('../../utils/lobby')
const { ISLANDS } = require('../../utils/practice/catalog')

// Two levels, like the lobby: subject (汉字城堡 / 数字星球 / 字母乐园), then that subject's boards. Level games rank by levels
// passed; 口算竞速 has one board per island (score = right − wrong, weekly unless 控制中心 turns that off).
const SPRINT_BOARD = 'sprint'
const LOBBY_SUBJECT_KEY = 'lobby.subject.v1'
const MATH_ISLANDS = ISLANDS.filter((island) => island.subject === 'math').map(({ id, name }) => ({ id, name }))

const readLobbySubject = () => {
  try {
    return wx.getStorageSync(LOBBY_SUBJECT_KEY) || ''
  } catch (error) {
    return ''
  }
}

const boardsOf = (subject) => [
  ...subject.gameTypes.map((gameType) => ({ id: gameType, name: gameConfigOf(gameType).name })),
  ...(subject.hasSprint ? [{ id: SPRINT_BOARD, name: '口算竞速' }] : [])
]

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
    // The board for the current tab never loaded (network): show a retry card, not "nobody on the board yet".
    loadFailed: false,
    subjectId: 'chinese',
    subjectTabs: [],
    boardId: '',
    boards: [],
    islandId: MATH_ISLANDS[0].id,
    islands: MATH_ISLANDS,
    isSprint: false,
    comingSoon: false,
    ruleText: '',
    unit: '关',
    size: 0,
    entries: [],
    openSeatsText: '',
    me: null,
    podiumSize: PODIUM_SIZE
  },

  // Opened from a game's 排行榜 link: that game's board. Otherwise the board on screen, or the lobby's subject.
  onShow() {
    const requested = takePendingLeaderboardGameType()
    if (requested && subjectOfGame(requested)) {
      this.select(subjectOfGame(requested).id, requested)
      return
    }
    if (this.data.boardId) {
      this.loadLeaderboard()
      return
    }
    const lobbySubject = SUBJECTS.find((subject) => subject.id === readLobbySubject() && !subject.comingSoon)
    this.select((lobbySubject || SUBJECTS[0]).id)
  },

  select(subjectId, boardId) {
    const subject = SUBJECTS.find((candidate) => candidate.id === subjectId)
    const boards = boardsOf(subject)
    const chosen = boards.find((board) => board.id === boardId) || boards[0] || null
    this.setData({
      subjectId,
      subjectTabs: SUBJECTS.map((item) => ({ id: item.id, name: item.name, icon: item.icon, active: item.id === subjectId })),
      boards,
      boardId: chosen ? chosen.id : '',
      isSprint: Boolean(chosen) && chosen.id === SPRINT_BOARD,
      comingSoon: Boolean(subject.comingSoon),
      entries: [],
      me: null,
      loading: Boolean(chosen)
    })
    if (chosen) this.loadLeaderboard()
  },

  switchSubject(event) {
    const { id } = event.currentTarget.dataset
    if (id !== this.data.subjectId) this.select(id)
  },

  switchBoard(event) {
    const { id } = event.currentTarget.dataset
    if (id !== this.data.boardId) this.select(this.data.subjectId, id)
  },

  switchIsland(event) {
    const { id } = event.currentTarget.dataset
    if (id === this.data.islandId) return
    this.setData({ islandId: id, loading: true })
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
      size: result.size,
      entries: result.entries.map((entry) => withDisplayName({ ...entry, value: entry.solvedCount, detail: entry.titleName })),
      openSeatsText: describeOpenSeats(result.size, result.entries.length),
      me: withDisplayName({ ...result.me, value: result.me.solvedCount, detail: result.me.rank ? result.me.titleName : '还没上榜，闯过 1 关就能上榜' })
    }
  },

  // 口算竞速 entries carry score and right / wrong counts; the player's own row is built from the session profile.
  async loadSprintBoard() {
    const result = await sprint.board(this.data.islandId)
    const profile = (getSession() || {}).profile || {}
    const mine = result.me
    const meRow = withDisplayName({
      nickname: profile.nickname,
      avatarUrl: profile.avatarUrl,
      rank: mine ? mine.rank : 0,
      value: mine ? mine.score : 0,
      detail: mine ? `对 ${mine.correct} · 错 ${mine.wrong}` : '还没挑战过这座岛',
      inTop: result.entries.some((entry) => entry.isMe)
    })
    return {
      ruleText: `${result.weekly ? '本周' : '总榜'} · 得分 = 答对 − 答错，同分答错少的在前`,
      unit: '分',
      size: result.entries.length,
      entries: result.entries.map((entry) => withDisplayName({ ...entry, value: entry.score, detail: `对 ${entry.correct} · 错 ${entry.wrong}` })),
      openSeatsText: '',
      me: meRow
    }
  },

  openSprint() {
    wx.navigateTo({ url: '/pages/game/sprint/sprint' })
  },

  retryLoad() {
    this.setData({ loading: true, loadFailed: false })
    this.loadLeaderboard()
  },

  onShareAppMessage() {
    const { me, isSprint, islandId, boardId } = this.data
    if (!me || !me.rank) return DEFAULT_SHARE
    if (isSprint) {
      const island = MATH_ISLANDS.find((item) => item.id === islandId)
      return buildRankShare(`我在口算竞速「${island.name}」排第 ${me.rank} 名，得了 ${me.value} 分，来比比！`)
    }
    return buildRankShare(`我在${gameConfigOf(boardId).name}排行榜第 ${me.rank} 名，已闯过 ${me.value} 关，来挑战我！`)
  }
})
