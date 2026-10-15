const { game, rescue, toastError, ERROR_CODES } = require('../../../utils/api')
const { ensureLogin, getSession } = require('../../../utils/session')
const { runWithItem } = require('../../../utils/item-flow')
const { describeRewards } = require('../../../utils/items')
const { DEFAULT_SHARE, buildRescueShare } = require('../../../utils/share')
const { CHEST_ROOM_URL } = require('../../../utils/milestone')
const { buildGuideSections } = require('../../../utils/rule-text')
const { hasSeenGuide, markGuideSeen, rulesGuideKeyOf } = require('../../../utils/onboarding')
const { gameConfigOf, hintTextsOf, clueLabelOf, describePoemSource, splitTypoClue } = require('../../../utils/games')
const { openPage, backToLevels, openLeaderboardTab } = require('../../../utils/navigation')
const { splitClue } = require('../../../utils/clue')
const { withMinimumDuration } = require('../../../utils/min-duration')
const { createSoundPlayer } = require('../../../utils/practice/sound')
const { isSwitchOn } = require('../../../utils/switches')

const PLAY_STAGES = {
  LOADING: 'loading',
  READY: 'ready',
  PLAYING: 'playing',
  SOLVED: 'solved',
  // The level could not be loaded (network): a retry card instead of an endless skeleton.
  ERROR: 'error',
  // 下一关 pressed: the "第 N 关" transition shown while the next level loads and starts.
  NEXT: 'next'
}
// The transition stays at least this long so it reads as a step forward, not a flicker.
const NEXT_LEVEL_TRANSITION_MS = 900

const SHARE_PURPOSE_RESCUE = 'rescue'
const AUTO_START_FLAG = '1'
const CHEER_MS = 1600
const BIG_CHEER_MS = 2600
const PASS_PRAISES = ['闯过啦！', '太厉害了！', '答对啦！', '漂亮！', '一猜就中！']
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
  if (allCleared) return { visible: true, title: '全部闯过啦！', subtitle: '你是真正的喵喵状元郎', mascot: '👑', big: true }
  if (titleUpgrade) return { visible: true, title: '称号升级啦！', subtitle: `你现在是「${titleUpgrade}」`, mascot: pick(BIG_MASCOTS), big: true }
  if (unlockedChest) return { visible: true, title: '解锁宝箱！', subtitle: '快去打开看看里面有什么', mascot: '🎁', big: true }
  return { visible: true, title: pick(PASS_PRAISES), subtitle: perfectPass ? '零失误，满分过关！' : '', mascot: pick(PASS_MASCOTS), big: false }
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
    guideVisible: false,
    guideSections: [],
    guideConfirmText: GUIDE_CONFIRM_TEXT.REVIEW,
    startAfterGuide: false,
    // 再练一次 from the 复习本 (?review=1): a passed level again, free, no hints or hearts; the answer can be shown and
    // hidden again (看答案) so the child looks instead of guessing.
    review: false,
    reviewAnswer: '',
    answerShown: false
  },

  onLoad(query) {
    this.shouldAutoStart = query.autoStart === AUTO_START_FLAG
    const levelNo = Number(query.levelNo) || 1
    const gameConfig = gameConfigOf(query.gameType)
    const review = query.review === '1'
    this.soundPlayer = createSoundPlayer()
    this.setData({ levelNo, review, gameType: gameConfig.gameType, game: gameConfig, hintTexts: hintTextsOf(gameConfig) })
    wx.setNavigationBarTitle({ title: `${gameConfig.name} · ${review ? '复习' : ''}第 ${levelNo} 关` })
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
    // Every character already revealed by hints (the hand-in did not go through last time): hand it in now.
    const revealed = puzzle.revealed || []
    if (stage === PLAY_STAGES.PLAYING && revealed.length && revealed.length === puzzle.answerLength) {
      this.handleComplete({ detail: { answer: revealed.join('') } })
    }
  },

  async loadLevel() {
    if (this.data.stage === PLAY_STAGES.ERROR) this.setData({ stage: PLAY_STAGES.LOADING })
    try {
      await ensureLogin()
      if (this.data.review) {
        const detail = await game.reviewLevel(this.data.gameType, this.data.levelNo)
        this.setData({ reviewAnswer: detail.answer, answerShown: false })
        this.applyLevelDetail({ ...detail, solved: false, attempt: {}, hintsUsed: 0, maxHints: 0, staminaCost: 0, solution: null })
        return
      }
      this.applyLevelDetail(await game.getLevel(this.data.gameType, this.data.levelNo))
      this.autoStartIfRequested()
    } catch (error) {
      // Leaving the skeleton up would look like the app froze; a retry card tells the child what to do.
      // A cloud-side reason (e.g. the level is still locked) is worth showing as well.
      if (error.code !== ERROR_CODES.NETWORK) toastError(error)
      this.setData({ stage: PLAY_STAGES.ERROR })
    }
  },

  // Only a fresh level starts by itself; a failed attempt stays on the "差一点点" card so the player sees it.
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
    clearTimeout(this.nextLevelTimer)
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
      guideSections: buildGuideSections(session.rules, this.data.game),
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

  // Review: a wrong answer just shakes (try again as often as needed); right moves the level to 已掌握.
  async submitReview(answer) {
    const result = await withMinimumDuration(() => game.reviewSubmit(this.data.gameType, this.data.levelNo, answer), MIN_CHECKING_MS)
    if (!result.correct) {
      this.soundPlayer.play('wrong')
      this.selectComponent('#puzzle').showWrongAnswer()
      return
    }
    this.setData({ stage: PLAY_STAGES.SOLVED, solution: result.solution })
    this.celebrate({ visible: true, title: '答对啦！', subtitle: '自己做出来的，真棒', mascot: '📒', big: false })
  },

  // After getting it right in review: 斩掉 crosses it out of the 复习本, 先留着 leaves it there.
  async dismissAndBack() {
    await this.withBusy(async () => {
      try {
        await game.dismissReview(this.data.gameType, this.data.levelNo)
        wx.navigateBack()
      } catch (error) {
        toastError(error)
      }
    })
  },

  backToBook() {
    wx.navigateBack()
  },

  toggleAnswer() {
    this.setData({ answerShown: !this.data.answerShown })
  },

  async handleComplete(event) {
    if (this.data.submitting) return
    this.setData({ submitting: true })
    if (this.data.review) {
      try {
        await this.submitReview(event.detail.answer)
      } catch (error) {
        toastError(error)
        this.selectComponent('#puzzle').clearAttempt()
      } finally {
        this.setData({ submitting: false })
      }
      return
    }
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
      this.soundPlayer.play('wrong')
      if (result.attempt.failed) {
        this.setData({ stage: PLAY_STAGES.READY })
        // A short buzz is enough; a long one feels like a punishment to young children.
        wx.vibrateShort({ type: 'medium' })
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
      wx.showToast({ title: isSwitchOn('hintKeepLastStep') ? '再提示就是直接给答案啦，最后一步自己来！' : '提示已经用到头啦', icon: 'none' })
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
      // Hints revealed the whole answer: hand it in, there is nothing left to tap.
      if (result.revealed.length && result.revealed.length === this.data.answerLength) {
        await this.handleComplete({ detail: { answer: result.revealed.join('') } })
      }
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
    openPage(CHEST_ROOM_URL)
  },


  noop() {},

  closeRescueSheet() {
    this.setData({ rescueSheetVisible: false })
  },

  // 下一关 stays on this page: the "第 N 关" transition plays while the next level loads and its attempt starts, then
  // the puzzle appears straight away. Only a choice for the child (out of stamina, the first-time guide) or a failed
  // load stops on the ready card.
  async goNextLevel() {
    const { gameType, nextLevelNo, stage } = this.data
    if (!nextLevelNo) {
      backToLevels(gameType)
      return
    }
    if (stage === PLAY_STAGES.NEXT) return
    clearTimeout(this.cheerTimer)
    this.setData({ stage: PLAY_STAGES.NEXT, levelNo: nextLevelNo, cheer: HIDDEN_CHEER, rescueSheetVisible: false })
    wx.setNavigationBarTitle({ title: `${this.data.game.name} · 第 ${nextLevelNo} 关` })
    const transitionDone = new Promise((resolve) => {
      this.nextLevelTimer = setTimeout(resolve, NEXT_LEVEL_TRANSITION_MS)
    })
    try {
      const [detail] = await Promise.all([game.getLevel(gameType, nextLevelNo), transitionDone])
      const canStartNow = !detail.solved && !detail.puzzle && !detail.attempt.failed && hasSeenGuide(rulesGuideKeyOf(gameType))
      const started = canStartNow ? await runWithItem(() => game.startAttempt(gameType, nextLevelNo)) : null
      this.applyLevelDetail(started || detail)
      if (!started && !hasSeenGuide(rulesGuideKeyOf(gameType))) this.handleStart()
    } catch (error) {
      toastError(error)
      this.setData({ stage: PLAY_STAGES.READY })
    }
  },

  openLeaderboard() {
    openLeaderboardTab(this.data.gameType)
  },

  goLevelList() {
    backToLevels(this.data.gameType)
  },

  onShareAppMessage(event) {
    const isRescueShare = event.from === 'button' && event.target.dataset.purpose === SHARE_PURPOSE_RESCUE
    if (!isRescueShare || !this.data.rescueId) return DEFAULT_SHARE
    this.setData({ rescueSheetVisible: false })
    return buildRescueShare(this.data.game.name, this.data.levelNo, this.data.rescueId)
  }
})
