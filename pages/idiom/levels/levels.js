const { idiom, toastError } = require('../../../utils/api')
const { ensureLogin } = require('../../../utils/session')
const { showRescueNotices } = require('../../../utils/rescue-notice')
const { DEFAULT_SHARE } = require('../../../utils/share')
const { openMilestoneChests, describeTitleProgress } = require('../../../utils/milestone')

const LEVELS_PER_PAGE = 50

const LEVEL_STATUS = {
  SOLVED: 'solved',
  CURRENT: 'current',
  LOCKED: 'locked'
}

const pageIndexOf = (levelNo) => Math.floor((levelNo - 1) / LEVELS_PER_PAGE)

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
    openingChests: false
  },

  onShow() {
    this.refresh()
  },

  async refresh() {
    try {
      await ensureLogin()
      const levelList = await idiom.levelList()
      const isFirstLoad = this.data.loading
      this.levelList = levelList
      this.setData({
        loading: false,
        pageCount: Math.ceil(levelList.total / LEVELS_PER_PAGE),
        solvedCount: levelList.solved.length,
        total: levelList.total,
        allSolved: levelList.total > 0 && levelList.solved.length >= levelList.total,
        titleName: levelList.achievement.title.name,
        titleProgressText: describeTitleProgress(levelList.achievement),
        pendingChests: levelList.achievement.milestone.pendingChests
      })
      this.showPage(isFirstLoad ? pageIndexOf(levelList.currentLevel) : this.data.pageIndex)
      showRescueNotices(levelList.rescueNotices)
    } catch (error) {
      this.setData({ loading: false })
      toastError(error)
    }
  },

  showPage(pageIndex) {
    if (!this.levelList) return
    const safeIndex = Math.min(Math.max(pageIndex, 0), Math.max(this.data.pageCount - 1, 0))
    this.setData({ pageIndex: safeIndex, ...buildPageLevels(this.levelList, safeIndex) })
  },

  async handleOpenChests() {
    if (this.data.openingChests) return
    this.setData({ openingChests: true })
    const result = await openMilestoneChests()
    this.setData({ openingChests: false, pendingChests: result ? 0 : this.data.pendingChests })
  },

  openBook() {
    wx.navigateTo({ url: '/pages/idiom/book/book' })
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
    wx.navigateTo({ url: `/pages/idiom/play/play?levelNo=${levelNo}` })
  },

  onShareAppMessage() {
    return DEFAULT_SHARE
  }
})
