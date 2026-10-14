const { daily } = require('../../utils/api')
const { getSession, updateSession } = require('../../utils/session')
const { describeRewards } = require('../../utils/items')
const { buildChallenge, describeSeconds } = require('../../utils/daily')
const { createSoundPlayer } = require('../../utils/practice/sound')
const { trackReport } = require('../../utils/practice/pending-report')
const { HIDDEN_FLOWER_TOAST, HIDDEN_MEDAL_POPUP, createHonorPresenter, medalShareOf } = require('../../utils/practice/honors')
const { DEFAULT_SHARE } = require('../../utils/share')

const STAGES = { LOADING: 'loading', INTRO: 'intro', RUNNING: 'running', RESULT: 'result', FAILED: 'failed' }
const SECOND_MS = 1000
const RIGHT_PAUSE_MS = 700
const WRONG_PAUSE_MS = 1600
const DEFAULT_REWARDS = [{ type: 'stamina', amount: 5 }]

const monthDayOf = (dateKey) => `${Number(dateKey.slice(4, 6))} 月 ${Number(dateKey.slice(6, 8))} 日`

const lineOf = (correct, total) => {
  if (correct === total) return '全部答对！今天的你闪闪发光 ✨'
  if (correct >= total - 2) return '差一点点就全对啦，明天再来冲满分！'
  return '完成挑战就是胜利，明天会更好！'
}

Page({
  data: {
    stage: STAGES.LOADING,
    dateText: '',
    rewardText: '',
    question: null,
    progressText: '',
    dots: [],
    clockText: '0 秒',
    picked: '',
    choiceState: '',
    revealed: false,
    locked: false,
    result: null,
    flowerToast: HIDDEN_FLOWER_TOAST,
    medalPopup: HIDDEN_MEDAL_POPUP
  },

  onLoad() {
    this.timers = []
    this.soundPlayer = createSoundPlayer()
    this.honorPresenter = createHonorPresenter(this)
    const session = getSession()
    const rewards = (session && session.rules.daily && session.rules.daily.rewards) || DEFAULT_REWARDS
    this.setData({ rewardText: describeRewards(rewards) })
    this.load()
  },

  onUnload() {
    this.stopClock()
    this.timers.forEach((timer) => clearTimeout(timer))
    this.soundPlayer.destroy()
    this.honorPresenter.destroy()
  },

  later(callback, delayMs) {
    this.timers.push(setTimeout(callback, delayMs))
  },

  async load() {
    try {
      const today = await daily.today()
      this.dateKey = today.dateKey
      this.questions = buildChallenge(today)
      this.setData({ dateText: monthDayOf(today.dateKey) })
      if (today.result) {
        this.setData({ stage: STAGES.RESULT, result: this.resultViewOf(today.result, [], true) })
        return
      }
      this.setData({ stage: STAGES.INTRO, dots: this.questions.map((question, index) => ({ id: index, subject: question.subject, state: '' })) })
    } catch (error) {
      console.error('[daily] challenge unavailable', error)
      this.setData({ stage: STAGES.FAILED })
    }
  },

  start() {
    this.index = 0
    this.correctCount = 0
    this.missed = []
    this.startedAt = Date.now()
    this.soundPlayer.play('gong')
    this.setData({ stage: STAGES.RUNNING, clockText: '0 秒' })
    this.clock = setInterval(() => this.setData({ clockText: describeSeconds(this.elapsedSeconds()) }), SECOND_MS)
    this.showQuestion()
  },

  stopClock() {
    clearInterval(this.clock)
    this.clock = null
  },

  elapsedSeconds() {
    return Math.max(Math.round((Date.now() - this.startedAt) / SECOND_MS), 1)
  },

  showQuestion() {
    const question = this.questions[this.index]
    this.answered = false
    this.setData({
      question,
      picked: '',
      choiceState: '',
      revealed: false,
      locked: false,
      progressText: `第 ${this.index + 1} / ${this.questions.length} 题`,
      [`dots[${this.index}].state`]: 'current'
    })
  },

  // Only the first answer counts: a wrong one shows the right answer, then the challenge moves on.
  record(correct) {
    if (this.answered) return
    this.answered = true
    const question = this.questions[this.index]
    if (correct) this.correctCount += 1
    else this.missed.push({ id: question.id, text: question.reviewText })
    this.soundPlayer.play(correct ? 'correct' : 'wrong')
    if (!correct) wx.vibrateShort({ type: 'medium' })
    this.setData({ locked: true, revealed: !correct, [`dots[${this.index}].state`]: correct ? 'right' : 'wrong' })
    this.later(() => this.next(), correct ? RIGHT_PAUSE_MS : WRONG_PAUSE_MS)
  },

  pickChoice(event) {
    if (this.data.locked) return
    const { choice } = event.currentTarget.dataset
    const correct = choice === this.data.question.answer
    this.setData({ picked: choice, choiceState: correct ? 'right' : 'wrong' })
    this.record(correct)
  },

  handleAnswered(event) {
    this.record(event.detail.correct)
  },

  handleEmpty() {
    wx.showToast({ title: '先按数字，再点确定', icon: 'none' })
  },

  next() {
    this.index += 1
    if (this.index < this.questions.length) {
      this.showQuestion()
      return
    }
    this.finish()
  },

  resultViewOf(result, missed, fromEarlier) {
    return {
      correct: result.correct,
      total: result.total,
      perfect: result.correct === result.total,
      timeText: describeSeconds(result.seconds),
      line: lineOf(result.correct, result.total),
      missed,
      fromEarlier,
      rewardsText: ''
    }
  },

  async finish() {
    this.stopClock()
    const result = { correct: this.correctCount, total: this.questions.length, seconds: this.elapsedSeconds() }
    this.soundPlayer.play(result.correct === result.total ? 'milestone' : 'correct')
    this.setData({ stage: STAGES.RESULT, question: null, result: this.resultViewOf(result, this.missed, false) })
    try {
      const outcome = await trackReport(daily.submit({ dateKey: this.dateKey, correct: result.correct, seconds: result.seconds }))
      if (outcome.alreadyDone) {
        this.setData({ 'result.rewardsText': '今天已经领过挑战奖励啦' })
        return
      }
      if (outcome.items) updateSession({ items: outcome.items, today: { dailyChallenge: outcome.result } })
      this.setData({ 'result.rewardsText': `获得 ${describeRewards(outcome.rewards)}` })
      this.honorPresenter.present(outcome.honors)
    } catch (error) {
      console.error('[daily] result not saved', error)
      this.setData({ 'result.rewardsText': '网络不太好，奖励没领到，回大厅再进来试试' })
    }
  },

  backToLobby() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) })
  },

  handleMedalClose() {
    this.honorPresenter.closeMedal()
  },

  onShareAppMessage(event) {
    return medalShareOf(event, this.data.medalPopup) || DEFAULT_SHARE
  }
})
