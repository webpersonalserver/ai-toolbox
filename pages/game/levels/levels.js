const { game, toastError } = require('../../../utils/api')
const { ensureLogin } = require('../../../utils/session')
const { showRescueNotices } = require('../../../utils/rescue-notice')
const { DEFAULT_SHARE } = require('../../../utils/share')
const { CHEST_ROOM_URL, describeTitleProgress } = require('../../../utils/milestone')
const { gameConfigOf, playUrlOf } = require('../../../utils/games')
const { openPage, openLeaderboardTab } = require('../../../utils/navigation')

const LEVELS_PER_PAGE = 50

const LEVEL_STATUS = {
  SOLVED: 'solved',
  CURRENT: 'current',
  LOCKED: 'locked'
}

// Pages follow the stages (入门, 进阶 …): a page never mixes two of them, so the stage tabs always match the levels
// below. A stage longer than LEVELS_PER_PAGE is split into several pages; a game without stages pages by 50.
const chunksOf = (firstLevelNo, lastLevelNo, stageName) => {
  const chunks = []
  for (let first = firstLevelNo; first <= lastLevelNo; first += LEVELS_PER_PAGE) {
    chunks.push({ firstLevelNo: first, lastLevelNo: Math.min(first + LEVELS_PER_PAGE - 1, lastLevelNo), stageName })
  }
  return chunks
}

const pagesOf = (total, stages) => {
  const ranges = stages.map((stage) => ({ first: stage.firstLevelNo, last: Math.min(stage.lastLevelNo, total), name: stage.name }))
  // Stages must cover 1 … total without gaps; otherwise (or with none) the plain 50-level pages are used.
  const covers = ranges.length && ranges.every((range, index) => range.first === (index ? ranges[index - 1].last + 1 : 1)) && ranges[ranges.length - 1].last === total
  if (!covers) return chunksOf(1, total, '')
  return ranges.flatMap((range) => chunksOf(range.first, range.last, range.name))
}

// The page holding the level; past the last level (all passed) the last page.
const pageIndexOf = (pages, levelNo) => {
  const index = pages.findIndex((page) => levelNo >= page.firstLevelNo && levelNo <= page.lastLevelNo)
  if (index >= 0) return index
  return pages.length && levelNo > pages[pages.length - 1].lastLevelNo ? pages.length - 1 : 0
}

const buildPageLevels = ({ currentLevel, solved }, { firstLevelNo, lastLevelNo }) => {
  const solvedSet = new Set(solved)
  const levels = []
  for (let levelNo = firstLevelNo; levelNo <= lastLevelNo; levelNo += 1) {
    let status = LEVEL_STATUS.LOCKED
    if (solvedSet.has(levelNo)) status = LEVEL_STATUS.SOLVED
    else if (levelNo <= currentLevel) status = LEVEL_STATUS.CURRENT
    levels.push({ levelNo, status })
  }
  return { levels, firstLevelNo, lastLevelNo }
}

Page({
  data: {
    loading: true,
    // The first load failed (network): show a retry card rather than the "no levels yet" empty state.
    loadFailed: false,
    gameType: '',
    game: null,
    stages: [],
    activeStageName: '',
    stageAnchor: '',
    levels: [],
    pageIndex: 0,
    pageCount: 0,
    firstLevelNo: 0,
    lastLevelNo: 0,
    solvedCount: 0,
    total: 0,
    allSolved: false,
    titleName: '',
    titleProgressText: '',
    pendingChests: 0
  },

  onLoad(query) {
    const gameConfig = gameConfigOf(query.gameType)
    this.setData({ gameType: gameConfig.gameType, game: gameConfig })
    wx.setNavigationBarTitle({ title: gameConfig.name })
  },

  onShow() {
    this.refresh()
  },

  async refresh() {
    try {
      await ensureLogin()
      const levelList = await game.levelList(this.data.gameType)
      const isFirstLoad = this.data.loading
      this.levelList = levelList
      this.pages = pagesOf(levelList.total, levelList.stages)
      this.setData({
        loading: false,
        loadFailed: false,
        pageCount: this.pages.length,
        solvedCount: levelList.solved.length,
        total: levelList.total,
        allSolved: levelList.allCleared,
        titleName: levelList.achievement.title.name,
        titleProgressText: describeTitleProgress(levelList.achievement),
        pendingChests: levelList.achievement.milestone.pendingChests,
        stages: levelList.stages
      })
      this.showPage(isFirstLoad ? pageIndexOf(this.pages, levelList.currentLevel) : this.data.pageIndex)
      showRescueNotices(levelList.rescueNotices.map((notice) => ({ ...notice, gameName: this.data.game.name })))
    } catch (error) {
      // A failed background refresh keeps the list already on screen; only an empty page needs the retry card.
      this.setData({ loading: false, loadFailed: !this.levelList })
      toastError(error)
    }
  },

  retryLoad() {
    this.setData({ loading: true, loadFailed: false })
    this.refresh()
  },

  showPage(pageIndex) {
    if (!this.levelList) return
    if (!this.pages.length) return
    const safeIndex = Math.min(Math.max(pageIndex, 0), this.pages.length - 1)
    const page = this.pages[safeIndex]
    const stageIndex = this.data.stages.findIndex((stage) => stage.name === page.stageName)
    this.setData({
      pageIndex: safeIndex,
      ...buildPageLevels(this.levelList, page),
      activeStageName: page.stageName,
      // Keeps the active tab in view when the row of stages is wider than the screen.
      stageAnchor: stageIndex >= 0 ? `stage-${stageIndex}` : ''
    })
  },

  jumpToStage(event) {
    this.showPage(pageIndexOf(this.pages, event.currentTarget.dataset.firstLevelNo))
  },

  handleOpenChests() {
    openPage(CHEST_ROOM_URL)
  },


  openLeaderboard() {
    openLeaderboardTab(this.data.gameType)
  },

  openBook() {
    openPage(`/pages/game/book/book?gameType=${this.data.gameType}`)
  },

  showPreviousPage() {
    this.showPage(this.data.pageIndex - 1)
  },

  showNextPage() {
    this.showPage(this.data.pageIndex + 1)
  },

  handleLevelTap(event) {
    const { levelNo, status } = event.currentTarget.dataset
    if (status === LEVEL_STATUS.LOCKED) {
      wx.showToast({ title: '先闯过前面的关，这关就会打开哦', icon: 'none' })
      return
    }
    // Fresh levels start straight away; a failed attempt still stops on the "再来一次" card (see play.autoStartIfRequested).
    openPage(playUrlOf(this.data.gameType, levelNo))
  },

  onShareAppMessage() {
    return DEFAULT_SHARE
  }
})
