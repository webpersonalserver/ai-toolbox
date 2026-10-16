const { EXAM_QUESTION_COUNT, EXAM_LIVES, buildExam } = require('../../../utils/practice/multiplication')
const { readProgress, saveExamResult } = require('../../../utils/practice/multiplication-records')
const { createSoundPlayer } = require('../../../utils/practice/sound')
const { syncProgress, describeNewChests } = require('../../../utils/practice/multiplication-rewards')
const { HIDDEN_FLOWER_TOAST, HIDDEN_MEDAL_POPUP, createHonorPresenter, medalShareOf } = require('../../../utils/practice/honors')
const { KUNGFU_SHARE } = require('../../../utils/share')

const CORRECT_PAUSE_MS = 800
const WRONG_PAUSE_MS = 1800
const GRANDMASTER_CHEER_MS = 2200
const SECOND_MS = 1000
const PRAISES = ['好！', '漂亮！', '稳！', '准！', '快！']
const MASCOTS = ['⚔️', '💥', '⚡', '🔥']
const HIDDEN_CHEER = { visible: false, title: '', subtitle: '', mascot: '', big: false }
const HIDDEN_RESULT = { visible: false, kind: 'fail', title: '', subtitle: '', lines: [], actions: [] }

const pick = (list) => list[Math.floor(Math.random() * list.length)]
const describeSeconds = (seconds) => `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
const heartsOf = (lives) => Array.from({ length: EXAM_LIVES }, (_, index) => ({ id: index, alive: index < lives }))

Page({
  data: {
    flowerToast: HIDDEN_FLOWER_TOAST,
    medalPopup: HIDDEN_MEDAL_POPUP,
    started: false,
    questionCount: EXAM_QUESTION_COUNT,
    lives: EXAM_LIVES,
    hearts: heartsOf(EXAM_LIVES),
    previousBest: '',
    question: null,
    revealed: false,
    locked: false,
    progressText: '',
    elapsedText: '0 分 0 秒',
    combo: 0,
    feedbackLine: '',
    cheer: HIDDEN_CHEER,
    result: HIDDEN_RESULT
  },

  onLoad() {
    this.timers = []
    this.soundPlayer = createSoundPlayer()
    this.honorPresenter = createHonorPresenter(this)
    const { exam } = readProgress()
    this.setData({ previousBest: exam.passed ? `你的最快纪录：${describeSeconds(exam.fastestSeconds)}` : '' })
  },

  onUnload() {
    this.timers.forEach((timer) => clearTimeout(timer))
    clearInterval(this.clock)
    this.soundPlayer.destroy()
    this.honorPresenter.destroy()
  },

  later(callback, delayMs) {
    this.timers.push(setTimeout(callback, delayMs))
  },

  startExam() {
    this.questions = buildExam()
    this.index = 0
    this.lives = EXAM_LIVES
    this.correctCount = 0
    this.missedVerses = []
    this.startedAt = Date.now()
    clearInterval(this.clock)
    this.clock = setInterval(() => this.setData({ elapsedText: describeSeconds(this.elapsedSeconds()) }), SECOND_MS)
    this.soundPlayer.play('gong')
    this.setData({ started: true, combo: 0, lives: EXAM_LIVES, hearts: heartsOf(EXAM_LIVES), elapsedText: '0 分 0 秒', result: HIDDEN_RESULT })
    this.showQuestion()
  },

  elapsedSeconds() {
    return Math.round((Date.now() - this.startedAt) / SECOND_MS)
  },

  showQuestion() {
    this.missedCurrent = false
    this.setData({
      question: this.questions[this.index],
      revealed: false,
      locked: false,
      feedbackLine: '',
      cheer: HIDDEN_CHEER,
      progressText: `第 ${this.index + 1} / ${this.questions.length} 题`
    })
  },

  advance() {
    this.index += 1
    if (this.index >= this.questions.length) {
      this.finishExam(true)
      return
    }
    this.showQuestion()
  },

  handleEmpty() {
    this.setData({ feedbackLine: '先按数字，再出招' })
  },

  handleAnswered(event) {
    if (event.detail.correct) {
      this.handleCorrect()
    } else {
      this.handleWrong()
    }
  },

  handleCorrect() {
    if (!this.missedCurrent) this.correctCount += 1
    const combo = this.data.combo + 1
    this.soundPlayer.play('correct')
    wx.vibrateShort({ type: 'light' })
    this.setData({
      locked: true,
      combo,
      cheer: { visible: true, title: combo >= 3 ? `${combo} 连击！` : pick(PRAISES), subtitle: '', mascot: pick(MASCOTS), big: false }
    })
    this.later(() => this.advance(), CORRECT_PAUSE_MS)
  },

  // A miss costs a life; while lives remain the question stays until it is answered right, only the last life shows the answer.
  handleWrong() {
    this.lives -= 1
    if (!this.missedCurrent) {
      this.missedCurrent = true
      this.missedVerses.push(this.questions[this.index].fact.verse)
    }
    this.soundPlayer.play('wrong')
    // A light buzz: a miss should nudge, not feel like a punishment.
    wx.vibrateShort({ type: 'light' })
    this.setData({
      combo: 0,
      lives: this.lives,
      hearts: heartsOf(this.lives),
      feedbackLine: this.lives ? `被挡了一下！还有 ${this.lives} 颗❤️，稳住再来` : '这次先到这里，看看答案记一记！'
    })
    if (this.lives) return
    this.setData({ locked: true, revealed: true })
    this.later(() => this.finishExam(false), WRONG_PAUSE_MS)
  },

  finishExam(passed) {
    clearInterval(this.clock)
    const seconds = this.elapsedSeconds()
    const { firstPass, fasterPass } = saveExamResult({ passed, correct: this.correctCount, seconds })
    const actions = [
      { key: 'again', text: passed ? '再来一次，刷新纪录' : '再来一次', primary: true },
      { key: 'back', text: passed ? '返回秘籍' : '回去修炼', primary: false }
    ]
    if (!passed) {
      syncProgress({ practiced: true }).then((result) => result && this.honorPresenter.present(result.honors))
      this.setData({
        locked: true,
        result: {
          visible: true,
          kind: 'fail',
          heading: '九九大挑战',
          title: '差一点就神功大成！',
          subtitle: `闯到第 ${this.index + 1} 题，答对 ${this.correctCount} 题`,
          lines: ['这几句口诀再练练：', ...this.missedVerses],
          actions
        }
      })
      return
    }
    const chestsSynced = syncProgress({ practiced: true })
    let title = '又一次神功大成！'
    if (fasterPass) title = '再破纪录，宗师风范！'
    if (firstPass) title = '恭喜你，神功大成！'
    this.soundPlayer.play('gong')
    this.later(() => this.soundPlayer.play('milestone'), 600)
    wx.vibrateShort({ type: 'heavy' })
    this.later(() => wx.vibrateShort({ type: 'heavy' }), 200)
    this.setData({
      locked: true,
      cheer: { visible: true, title: '神功大成！', subtitle: '九九八十一，尽在掌握', mascot: '👑', big: true }
    })
    this.later(() => {
      this.setData({
        cheer: HIDDEN_CHEER,
        result: {
          visible: true,
          kind: 'grandmaster',
          heading: '',
          title,
          subtitle: '九九口诀，尽在掌握',
          lines: [`答对 ${this.correctCount} / ${this.questions.length} 题`, `用时 ${describeSeconds(seconds)}`, `还剩 ${this.lives} 颗❤️${this.lives === EXAM_LIVES ? ' · 毫发无伤！' : ''}`],
          actions
        }
      })
      chestsSynced.then((result) => {
        if (result) this.honorPresenter.present(result.honors)
        const chestLine = describeNewChests(result)
        if (chestLine && this.data.result.visible) this.setData({ 'result.lines': [...this.data.result.lines, chestLine] })
      })
    }, GRANDMASTER_CHEER_MS)
  },

  handleMedalClose() {
    this.honorPresenter.closeMedal()
  },

  onShareAppMessage(event) {
    return medalShareOf(event, this.data.medalPopup) || KUNGFU_SHARE
  },

  handleResultAction(event) {
    const { key } = event.detail
    if (key === 'again') this.startExam()
    if (key === 'back') wx.navigateBack()
  }
})
