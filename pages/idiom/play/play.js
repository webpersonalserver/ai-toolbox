const { idiom, rescue, toastError } = require('../../../utils/api')
const { ensureLogin, getSession } = require('../../../utils/session')
const { runWithItem } = require('../../../utils/item-flow')
const { describeStaminaRecovery } = require('../../../utils/items')
const { DEFAULT_SHARE, buildRescueShare } = require('../../../utils/share')
const { openMilestoneChests } = require('../../../utils/milestone')
const { buildGuideSections } = require('../../../utils/rule-text')
const { GUIDE_KEYS, hasSeenGuide, markGuideSeen } = require('../../../utils/onboarding')

const PLAY_STAGES = {
  LOADING: 'loading',
  READY: 'ready',
  PLAYING: 'playing',
  SOLVED: 'solved'
}

const SHARE_PURPOSE_RESCUE = 'rescue'

const GUIDE_CONFIRM_TEXT = {
  BEFORE_START: '知道了，开始挑战',
  REVIEW: '知道了'
}

const buildHearts = (attempt) =>
  Array.from({ length: attempt.maxWrongAttempts }, (_, index) => index < attempt.attemptsLeft)

Page({
  data: {
    stage: PLAY_STAGES.LOADING,
    levelNo: 0,
    total: 0,
    staminaCost: 1,
    attempt: null,
    hearts: [],
    clue: '',
    board: [],
    answerLength: 4,
    revealed: [],
    hintsUsed: 0,
    maxHints: 0,
    items: { hint: 0, stamina: 0 },
    staminaRecoveryText: '',
    solution: null,
    nextLevelNo: null,
    titleUpgrade: '',
    allCleared: false,
    milestone: null,
    submitting: false,
    busy: false,
    rescueId: '',
    rescueSheetVisible: false,
    guideVisible: false,
    guideSections: [],
    guideConfirmText: GUIDE_CONFIRM_TEXT.REVIEW,
    startAfterGuide: false
  },

  onLoad(query) {
    const levelNo = Number(query.levelNo) || 1
    this.setData({ levelNo })
    wx.setNavigationBarTitle({ title: `第 ${levelNo} 关` })
    this.loadLevel()
  },

  onShow() {
    this.syncItems()
  },

  syncItems() {
    const session = getSession()
    if (!session) return
    this.setData({ items: session.items, staminaRecoveryText: describeStaminaRecovery(session.items) })
  },

  applyLevelDetail(detail) {
    const stage = detail.solved ? PLAY_STAGES.SOLVED : detail.puzzle ? PLAY_STAGES.PLAYING : PLAY_STAGES.READY
    const puzzle = detail.puzzle || {}
    this.setData({
      stage,
      total: detail.total,
      staminaCost: detail.staminaCost,
      attempt: detail.attempt,
      hearts: buildHearts(detail.attempt),
      clue: puzzle.clue || '',
      board: puzzle.board || [],
      answerLength: puzzle.answerLength || 4,
      revealed: puzzle.revealed || [],
      hintsUsed: detail.hintsUsed,
      maxHints: detail.maxHints,
      solution: detail.solution,
      nextLevelNo: detail.levelNo < detail.total ? detail.levelNo + 1 : null
    })
    this.syncItems()
  },

  async loadLevel() {
    try {
      await ensureLogin()
      this.applyLevelDetail(await idiom.getLevel(this.data.levelNo))
    } catch (error) {
      toastError(error)
    }
  },

  async withBusy(task) {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      await task()
    } finally {
      this.setData({ busy: false })
    }
  },

  handleStart() {
    if (!hasSeenGuide(GUIDE_KEYS.IDIOM_RULES)) {
      this.showGuide({ startAfterGuide: true })
      return
    }
    return this.startAttempt()
  },

  showGuide({ startAfterGuide }) {
    const session = getSession()
    if (!session) return
    this.setData({
      guideVisible: true,
      guideSections: buildGuideSections(session.rules),
      guideConfirmText: startAfterGuide ? GUIDE_CONFIRM_TEXT.BEFORE_START : GUIDE_CONFIRM_TEXT.REVIEW,
      startAfterGuide
    })
  },

  openGuide() {
    this.showGuide({ startAfterGuide: false })
  },

  handleGuideConfirm() {
    markGuideSeen(GUIDE_KEYS.IDIOM_RULES)
    const { startAfterGuide } = this.data
    this.setData({ guideVisible: false, startAfterGuide: false })
    if (startAfterGuide) this.startAttempt()
  },

  handleGuideClose() {
    this.setData({ guideVisible: false, startAfterGuide: false })
  },

  startAttempt() {
    return this.withBusy(async () => {
      const detail = await runWithItem(() => idiom.startAttempt(this.data.levelNo))
      if (detail) this.applyLevelDetail(detail)
    })
  },

  async handleComplete(event) {
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      const result = await idiom.submit(this.data.levelNo, event.detail.answer)
      if (result.correct) {
        this.setData({
          stage: PLAY_STAGES.SOLVED,
          solution: result.solution,
          nextLevelNo: result.nextLevelNo,
          titleUpgrade: result.titleUpgrade || '',
          allCleared: result.allCleared,
          milestone: result.achievement.milestone
        })
        wx.vibrateShort({ type: 'light' })
        return
      }
      this.setData({ attempt: result.attempt, hearts: buildHearts(result.attempt) })
      if (result.attempt.failed) {
        this.setData({ stage: PLAY_STAGES.READY })
        wx.vibrateLong()
      } else {
        this.selectComponent('#puzzle').showWrongAnswer()
      }
    } catch (error) {
      toastError(error)
      this.selectComponent('#puzzle').clearAttempt()
    } finally {
      this.setData({ submitting: false })
    }
  },

  handleHint() {
    if (this.data.hintsUsed >= this.data.maxHints) {
      wx.showToast({ title: `每关最多提示 ${this.data.maxHints} 次，试试求助好友`, icon: 'none' })
      return
    }
    return this.withBusy(async () => {
      const result = await runWithItem(() => idiom.useHint(this.data.levelNo))
      this.syncItems()
      if (!result) return
      if (result.needRescue) {
        await this.prepareRescue()
        return
      }
      this.setData({ revealed: result.revealed, hintsUsed: result.hintsUsed })
    })
  },

  handleRescue() {
    return this.withBusy(() => this.prepareRescue())
  },

  async prepareRescue() {
    try {
      const { rescueId } = await rescue.create(this.data.levelNo)
      this.setData({ rescueId, rescueSheetVisible: true })
    } catch (error) {
      toastError(error)
    }
  },

  handleOpenChests() {
    return this.withBusy(async () => {
      const result = await openMilestoneChests()
      if (!result) return
      this.syncItems()
      this.setData({ 'milestone.pendingChests': 0 })
    })
  },

  noop() {},

  closeRescueSheet() {
    this.setData({ rescueSheetVisible: false })
  },

  goNextLevel() {
    if (this.data.nextLevelNo) {
      wx.redirectTo({ url: `/pages/idiom/play/play?levelNo=${this.data.nextLevelNo}` })
    } else {
      wx.navigateBack()
    }
  },

  openLeaderboard() {
    wx.redirectTo({ url: '/pages/leaderboard/leaderboard' })
  },

  goLevelList() {
    wx.navigateBack()
  },

  onShareAppMessage(event) {
    const isRescueShare = event.from === 'button' && event.target.dataset.purpose === SHARE_PURPOSE_RESCUE
    if (!isRescueShare || !this.data.rescueId) return DEFAULT_SHARE
    this.setData({ rescueSheetVisible: false })
    return buildRescueShare(this.data.levelNo, this.data.rescueId)
  }
})
