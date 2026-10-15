const { math } = require('../../../utils/api')
const { getSession, setItems } = require('../../../utils/session')
const { runWithItem } = require('../../../utils/item-flow')
const { createSoundPlayer } = require('../../../utils/practice/sound')
const { describeTitleProgress } = require('../../../utils/milestone')
const { backToLevels } = require('../../../utils/navigation')

// 口算闯关: one level = 10 questions, judged one by one in the cloud. Stamina to start, a few chances per attempt,
// a hint shows the current answer. Same rules as the other lobby games, so they share the levels list and leaderboard.
const STAGES = { LOADING: 'loading', READY: 'ready', PLAYING: 'playing', SOLVED: 'solved', FAILED_LOAD: 'failedLoad' }
const RIGHT_PAUSE_MS = 450
const HIDDEN_CHEER = { visible: false, title: '', subtitle: '', mascot: '', big: false }
const MATH_GAME_TYPE = 'math'

const heartsOf = (attempt) => Array.from({ length: attempt.maxWrongAttempts }, (_, index) => index < attempt.attemptsLeft)

const dotsOf = (count, index) => Array.from({ length: count }, (_, position) => ({ id: position, state: position < index ? 'done' : position === index ? 'current' : '' }))

// The equation with its blank filled in, for the review after passing.
const filledText = (question, answer) =>
  question.tokens.map((token) => (token === '' ? answer : token)).join(' ').replace(/\s+/g, ' ')

Page({
  data: {
    stage: STAGES.LOADING,
    levelNo: 1,
    stageName: '',
    staminaCost: 1,
    items: { hint: 0, stamina: 0 },
    attempt: null,
    hearts: [],
    dots: [],
    index: 0,
    question: null,
    shownAnswer: '',
    busy: false,
    result: null,
    review: [],
    cheer: HIDDEN_CHEER
  },

  onLoad(query) {
    this.soundPlayer = createSoundPlayer()
    this.timers = []
    this.autoStart = query.autoStart === '1'
    this.setData({ levelNo: Number(query.levelNo) || 1 })
    this.load()
  },

  onShow() {
    this.syncItems()
  },

  onUnload() {
    this.timers.forEach((timer) => clearTimeout(timer))
    this.soundPlayer.destroy()
  },

  later(callback, delayMs) {
    this.timers.push(setTimeout(callback, delayMs))
  },

  syncItems() {
    const session = getSession()
    if (session) this.setData({ items: session.items })
  },

  async load() {
    try {
      const view = await math.level(this.data.levelNo)
      this.applyView(view)
      if (this.autoStart && this.data.stage === STAGES.READY && !view.attempt.failed) this.start()
    } catch (error) {
      console.error('[math] level unavailable', error)
      this.setData({ stage: STAGES.FAILED_LOAD })
    }
  },

  applyView(view) {
    wx.setNavigationBarTitle({ title: `口算闯关 · 第 ${view.levelNo} 关` })
    this.questions = view.questions
    this.shownAnswers = view.shownAnswers || {}
    const stage = view.solved ? STAGES.SOLVED : view.attempt.active ? STAGES.PLAYING : STAGES.READY
    this.setData({
      stage,
      stageName: view.stage,
      staminaCost: view.staminaCost,
      attempt: view.attempt,
      hearts: heartsOf(view.attempt),
      cheer: HIDDEN_CHEER,
      review: view.solved ? view.questions.map((question) => ({ id: question.index, text: filledText(question, this.shownAnswers[question.index]) })) : []
    })
    if (stage === STAGES.PLAYING) this.showQuestion(view.index)
  },

  showQuestion(index) {
    const question = this.questions[index]
    this.setData({
      index,
      question: { ...question, id: `${this.data.levelNo}-${index}` },
      dots: dotsOf(this.questions.length, index),
      shownAnswer: this.shownAnswers[index] || ''
    })
  },

  retryLoad() {
    this.setData({ stage: STAGES.LOADING })
    this.load()
  },

  async start() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      const view = await runWithItem(() => math.start(this.data.levelNo))
      if (!view) return
      if (view.items) setItems(view.items)
      this.syncItems()
      this.soundPlayer.play('gong')
      this.applyView(view)
    } finally {
      this.setData({ busy: false })
    }
  },

  async handleSubmitted(event) {
    const { index, levelNo } = this.data
    const quiz = this.selectComponent('#question')
    try {
      const outcome = await math.answer(levelNo, index, event.detail.value)
      quiz.markAnswer(outcome.correct)
      this.setData({ attempt: outcome.attempt, hearts: heartsOf(outcome.attempt) })
      if (!outcome.correct) {
        this.soundPlayer.play('wrong')
        wx.vibrateShort({ type: 'medium' })
        if (outcome.attempt.failed) this.later(() => this.setData({ stage: STAGES.READY }), RIGHT_PAUSE_MS * 2)
        return
      }
      this.soundPlayer.play('correct')
      if (outcome.passed) {
        this.later(() => this.finish(outcome), RIGHT_PAUSE_MS)
        return
      }
      this.later(() => this.showQuestion(outcome.index), RIGHT_PAUSE_MS)
    } catch (error) {
      console.error('[math] answer not checked', error)
      quiz.resetAnswer()
      wx.showToast({ title: '网络不太好，再按一次确定', icon: 'none' })
    }
  },

  handleEmpty() {
    wx.showToast({ title: '先按数字，再点确定', icon: 'none' })
  },

  async useHint() {
    if (this.data.shownAnswer || this.data.busy) return
    this.setData({ busy: true })
    try {
      const result = await runWithItem(() => math.hint(this.data.levelNo))
      if (!result) return
      if (result.items) setItems(result.items)
      this.syncItems()
      this.shownAnswers[result.index] = result.answer
      if (result.index === this.data.index) this.setData({ shownAnswer: result.answer })
    } finally {
      this.setData({ busy: false })
    }
  },

  async finish(outcome) {
    this.soundPlayer.play('milestone')
    const milestone = outcome.achievement.milestone
    this.setData({
      cheer: { visible: true, title: `第 ${this.data.levelNo} 关通过！`, subtitle: outcome.titleUpgrade ? `升级为「${outcome.titleUpgrade}」` : '10 道题全部答对', mascot: '🏅', big: Boolean(outcome.titleUpgrade) },
      result: {
        nextLevelNo: outcome.nextLevelNo,
        titleText: describeTitleProgress(outcome.achievement),
        chestText: milestone.pendingChests > 0 ? `有 ${milestone.pendingChests} 个宝箱可以打开啦` : `再闯 ${milestone.levelsToNextChest} 关开宝箱`
      }
    })
    this.later(async () => {
      try {
        this.applyView(await math.level(this.data.levelNo))
      } catch (error) {
        this.setData({ stage: STAGES.SOLVED, cheer: HIDDEN_CHEER })
      }
    }, 1600)
  },

  goNext() {
    const next = this.data.result && this.data.result.nextLevelNo
    if (next) wx.redirectTo({ url: `/pages/game/math/math?levelNo=${next}&autoStart=1` })
  },

  backToLevels() {
    backToLevels(MATH_GAME_TYPE)
  }
})
