const { game, toastError } = require('../../../utils/api')
const { ensureLogin } = require('../../../utils/session')
const { showRescueNotices } = require('../../../utils/rescue-notice')
const { DEFAULT_SHARE } = require('../../../utils/share')
const { HIDDEN_REWARD_POPUP, openMilestoneChests, describeTitleProgress } = require('../../../utils/milestone')
const { gameConfigOf } = require('../../../utils/games')
const { openLeaderboardTab } = require('../../../utils/navigation')

const LEVELS_PER_PAGE = 50

const LEVEL_STATUS = {
  SOLVED: 'solved',
  CURRENT: 'current',
  LOCKED: 'locked'
}

const pageIndexOf = (levelNo) => Math.floor((levelNo - 1) / LEVELS_PER_PAGE)

const activeStageNameOf = (stages, levelNo) => {
  const stage = stages.find((item) => levelNo >= item.firstLevelNo && levelNo <= item.lastLevelNo)
  return stage ? stage.name : ''
}

const buildPageLevels = ({ total, currentLevel, solved }, pageIndex) => {
  const solvedSet = new Set(solved)
  const firstLevelNo = pageIndex * LEVELS_PER_PAGE + 1
  const lastLevelNo = Math.min(firstLevelNo + LEVELS_PER_PAGE - 1, total)
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
    gameType: '',
    game: null,
    stages: [],
    activeStageName: '',
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
    pendingChests: 0,
    openingChests: false,
    rewardPopup: HIDDEN_REWARD_POPUP
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
      this.setData({
        loading: false,
        pageCount: Math.ceil(levelList.total / LEVELS_PER_PAGE),
        solvedCount: levelList.solved.length,
        total: levelList.total,
        allSolved: levelList.allCleared,
        titleName: levelList.achievement.title.name,
        titleProgressText: describeTitleProgress(levelList.achievement),
        pendingChests: levelList.achievement.milestone.pendingChests,
        stages: levelList.stages
      })
      this.showPage(isFirstLoad ? pageIndexOf(levelList.currentLevel) : this.data.pageIndex)
      showRescueNotices(levelList.rescueNotices.map((notice) => ({ ...notice, gameName: this.data.game.name })))
    } catch (error) {
      this.setData({ loading: false })
      toastError(error)
    }
  },

  showPage(pageIndex) {
    if (!this.levelList) return
    const safeIndex = Math.min(Math.max(pageIndex, 0), Math.max(this.data.pageCount - 1, 0))
    const pageLevels = buildPageLevels(this.levelList, safeIndex)
    this.setData({
      pageIndex: safeIndex,
      ...pageLevels,
      activeStageName: activeStageNameOf(this.data.stages, pageLevels.firstLevelNo)
    })
  },

  jumpToStage(event) {
    this.showPage(pageIndexOf(event.currentTarget.dataset.firstLevelNo))
  },

  async handleOpenChests() {
    if (this.data.openingChests) return
    this.setData({ openingChests: true })
    const popup = await openMilestoneChests(this.data.gameType)
    this.setData({ openingChests: false })
    if (popup) this.setData({ pendingChests: 0, rewardPopup: popup })
  },

  closeRewardPopup() {
    this.setData({ rewardPopup: HIDDEN_REWARD_POPUP })
  },

  openLeaderboard() {
    openLeaderboardTab(this.data.gameType)
  },

  openBook() {
    wx.navigateTo({ url: `/pages/game/book/book?gameType=${this.data.gameType}` })
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
      wx.showToast({ title: '先通过前面的关卡吧', icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/pages/game/play/play?gameType=${this.data.gameType}&levelNo=${levelNo}` })
  },

  onShareAppMessage() {
    return DEFAULT_SHARE
  }
})
