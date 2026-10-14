const { game, rescue, toastError } = require('../../../utils/api')
const { ensureLogin, getSession } = require('../../../utils/session')
const { runWithItem } = require('../../../utils/item-flow')
const { describeRewards } = require('../../../utils/items')
const { DEFAULT_SHARE, buildRescueShare } = require('../../../utils/share')
const { HIDDEN_REWARD_POPUP, openMilestoneChests } = require('../../../utils/milestone')
const { buildGuideSections } = require('../../../utils/rule-text')
const { hasSeenGuide, markGuideSeen, rulesGuideKeyOf } = require('../../../utils/onboarding')
const { gameConfigOf, hintTextsOf, clueLabelOf, describePoemSource, splitTypoClue } = require('../../../utils/games')
const { openLeaderboardTab } = require('../../../utils/navigation')
const { splitClue } = require('../../../utils/clue')
const { withMinimumDuration } = require('../../../utils/min-duration')
const { createSoundPlayer } = require('../../../utils/practice/sound')
const { isSwitchOn } = require('../../../utils/switches')

const PLAY_STAGES = {
  LOADING: 'loading',
  READY: 'ready',
  PLAYING: 'playing',
  SOLVED: 'solved'
}

const SHARE_PURPOSE_RESCUE = 'rescue'
const AUTO_START_FLAG = '1'
const CHEER_MS = 1600
const BIG_CHEER_MS = 2600
const PASS_PRAISES = ['过关啦！', '太厉害了！', '答对啦！', '漂亮！', '一猜就中！']
const PASS_MASCOTS = ['🎉', '🥳', '🌟', '👏', '🤩']
const BIG_MASCOTS = ['🏆', '👑', '🎁']
const HIDDEN_CHEER = { visible: false, title: '', subtitle: '', mascot: '', big: false }
const MIN_CHECKING_MS = 550

const GUIDE_CONFIRM_TEXT = {
  BEFORE_START: '知道了，开始挑战',
  REVIEW: '知道了'
}

const pick = (list) => list[Math.floor(Math.random() * list.length)]

// Bigger moments (new title, a chest unlocked, everything cleared) get the full-screen version.
const passCheerOf = ({ titleUpgrade, unlockedChest, allCleared, perfectPass }) => {
  if (allCleared) return { visible: true, title: '全部通关！', subtitle: '你是真正的解谜达人', mascot: '👑', big: true }
  if (titleUpgrade) return { visible: true, title: `晋升「${titleUpgrade}」！`, subtitle: '段位又升了一级', mascot: pick(BIG_MASCOTS), big: true }
  if (unlockedChest) return { visible: true, title: '解锁宝箱！', subtitle: '快去打开看看里面有什么', mascot: '🎁', big: true }
  return { visible: true, title: pick(PASS_PRAISES), subtitle: perfectPass ? '零失误，完美通关！' : '', mascot: pick(PASS_MASCOTS), big: false }
}

// Solving exactly the Nth level of a chest interval is the moment a chest unlocks; older unopened chests don't count.
const justUnlockedChest = (milestone) => milestone.pendingChests > 0 && milestone.levelsToNextChest === milestone.everyLevels

const buildHearts = (attempt) =>
  Array.from({ length: attempt.maxWrongAttempts }, (_, index) => index < attempt.attemptsLeft)

Page({
  data: {
    sharing: true,
    stage: PLAY_STAGES.LOADING,
    gameType: '',
    game: null,
    hintTexts: {},
    levelNo: 0,
    stageName: '',
    poemSource: '',
    total: 0,
    staminaCost: 1,
    attempt: null,
    hearts: [],
    clue: '',
    board: [],
    answerLength: 4,
    revealed: [],
    eliminated: [],
    clueChars: [],
    clueHint: '',
    meaning: '',
    answerPinyin: [],
    hanziKind: '',
    clueLabel: '',
    clueSegments: [],
    clueHintSegments: [],
    hintsUsed: 0,
    maxHints: 0,
    items: { hint: 0, stamina: 0 },
    solution: null,
    nextLevelNo: null,
    titleUpgrade: '',
    allCleared: false,
    milestone: null,
    nextChestText: '',
    submitting: false,
    busy: false,
    rescueId: '',
    rescueSheetVisible: false,
    cheer: HIDDEN_CHEER,
    perfectPass: false,
    rewardPopup: HIDDEN_REWARD_POPUP,
    guideVisible: false,
    guideSections: [],
    guideConfirmText: GUIDE_CONFIRM_TEXT.REVIEW,
    startAfterGuide: false
  },

  onLoad(query) {
    this.shouldAutoStart = query.autoStart === AUTO_START_FLAG
    const levelNo = Number(query.levelNo) || 1
    const gameConfig = gameConfigOf(query.gameType)
    this.soundPlayer = createSoundPlayer()
    this.setData({ levelNo, gameType: gameConfig.gameType, game: gameConfig, hintTexts: hintTextsOf(gameConfig) })
    wx.setNavigationBarTitle({ title: `${gameConfig.name} · 第 ${levelNo} 关` })
    this.loadLevel()
  },

  onShow() {
    this.setData({ sharing: isSwitchOn('sharing') })
    this.syncItems()
  },

  syncItems() {
    const session = getSession()
    if (!session) return
    this.setData({ items: session.items })
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
      stageName: puzzle.stage || (detail.solution && detail.solution.stage) || this.data.stageName,
      poemSource: describePoemSource(puzzle),
      board: puzzle.board || [],
      answerLength: puzzle.answerLength || 4,
      revealed: puzzle.revealed || [],
      eliminated: puzzle.eliminated || [],
      clueChars: splitTypoClue(puzzle.clue, puzzle.wrongPosition),
      clueHint: puzzle.clueHint || '',
      meaning: puzzle.meaning || '',
      answerPinyin: puzzle.answerPinyin || [],
      hanziKind: puzzle.kind || '',
      clueLabel: clueLabelOf(this.data.game, puzzle),
      clueSegments: splitClue(puzzle.clue),
      clueHintSegments: splitClue(puzzle.clueHint),
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
      this.applyLevelDetail(await game.getLevel(this.data.gameType, this.data.levelNo))
      this.autoStartIfRequested()
    } catch (error) {
      toastError(error)
    }
  },

  // Only a fresh level starts by itself; a failed attempt stays on the "挑战失败" card so the player sees it.
  autoStartIfRequested() {
    const { shouldAutoStart } = this
    this.shouldAutoStart = false
    if (shouldAutoStart && this.data.stage === PLAY_STAGES.READY && !this.data.attempt.failed) {
      this.handleStart()
    }
  },

  celebrate(cheer) {
    clearTimeout(this.celebrationTimer)
    this.soundPlayer.play(cheer.big ? 'milestone' : 'correct')
    if (cheer.big) this.celebrationTimer = setTimeout(() => this.soundPlayer.play('gong'), 400)
    wx.vibrateShort({ type: 'heavy' })
    this.setData({ cheer })
    this.cheerTimer = setTimeout(() => this.setData({ cheer: HIDDEN_CHEER }), cheer.big ? BIG_CHEER_MS : CHEER_MS)
  },

  onUnload() {
    clearTimeout(this.celebrationTimer)
    clearTimeout(this.cheerTimer)
    this.soundPlayer.destroy()
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
    if (!hasSeenGuide(rulesGuideKeyOf(this.data.gameType))) {
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
      guideSections: buildGuideSections(session.rules, this.data.game, this.data.maxHints),
      guideConfirmText: startAfterGuide ? GUIDE_CONFIRM_TEXT.BEFORE_START : GUIDE_CONFIRM_TEXT.REVIEW,
      startAfterGuide
    })
  },

  openGuide() {
    this.showGuide({ startAfterGuide: false })
  },

  handleGuideConfirm() {
    markGuideSeen(rulesGuideKeyOf(this.data.gameType))
    const { startAfterGuide } = this.data
    this.setData({ guideVisible: false, startAfterGuide: false })
    if (startAfterGuide) this.startAttempt()
  },

  handleGuideClose() {
    this.setData({ guideVisible: false, startAfterGuide: false })
  },

  startAttempt() {
    return this.withBusy(async () => {
      const detail = await runWithItem(() => game.startAttempt(this.data.gameType, this.data.levelNo))
      if (detail) this.applyLevelDetail(detail)
    })
  },

  async handleComplete(event) {
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      wx.vibrateShort({ type: 'light' })
      const result = await withMinimumDuration(
        () => game.submit(this.data.gameType, this.data.levelNo, event.detail.answer),
        MIN_CHECKING_MS
      )
      if (result.correct) {
        const { attempt, hintsUsed } = this.data
        const perfectPass = attempt.attemptsLeft === attempt.maxWrongAttempts && hintsUsed === 0
        const titleUpgrade = result.titleUpgrade || ''
        this.setData({
          perfectPass,
          stage: PLAY_STAGES.SOLVED,
          solution: result.solution,
          nextLevelNo: result.nextLevelNo,
          titleUpgrade,
          allCleared: result.allCleared,
          milestone: result.achievement.milestone,
          nextChestText: describeRewards(result.achievement.milestone.nextChestRewards)
        })
        this.celebrate(passCheerOf({ titleUpgrade, unlockedChest: justUnlockedChest(result.achievement.milestone), allCleared: result.allCleared, perfectPass }))
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
      const result = await runWithItem(() => game.useHint(this.data.gameType, this.data.levelNo))
      this.syncItems()
      if (!result) return
      if (result.needRescue) {
        await this.prepareRescue()
        return
      }
      this.setData({ revealed: result.revealed, eliminated: result.eliminated, hintsUsed: result.hintsUsed })
    })
  },

  handleRescue() {
    return this.withBusy(() => this.prepareRescue())
  },

  async prepareRescue() {
    try {
      const { rescueId } = await rescue.create(this.data.gameType, this.data.levelNo)
      this.setData({ rescueId, rescueSheetVisible: true })
    } catch (error) {
      toastError(error)
    }
  },

  handleOpenChests() {
    return this.withBusy(async () => {
      const popup = await openMilestoneChests(this.data.gameType)
      if (!popup) return
      this.syncItems()
      this.setData({ 'milestone.pendingChests': 0, rewardPopup: popup })
    })
  },

  closeRewardPopup() {
    this.setData({ rewardPopup: HIDDEN_REWARD_POPUP })
    this.syncItems()
  },

  noop() {},

  closeRescueSheet() {
    this.setData({ rescueSheetVisible: false })
  },

  goNextLevel() {
    if (this.data.nextLevelNo) {
      wx.redirectTo({
        url: `/pages/game/play/play?gameType=${this.data.gameType}&levelNo=${this.data.nextLevelNo}&autoStart=${AUTO_START_FLAG}`
      })
    } else {
      wx.navigateBack()
    }
  },

  openLeaderboard() {
    openLeaderboardTab(this.data.gameType)
  },

  goLevelList() {
    wx.navigateBack()
  },

  onShareAppMessage(event) {
    const isRescueShare = event.from === 'button' && event.target.dataset.purpose === SHARE_PURPOSE_RESCUE
    if (!isRescueShare || !this.data.rescueId) return DEFAULT_SHARE
    this.setData({ rescueSheetVisible: false })
    return buildRescueShare(this.data.game.name, this.data.levelNo, this.data.rescueId)
  }
})
