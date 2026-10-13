const { tierOf, generateQuestion, isCorrect } = require('../../../utils/practice/arithmetic')
const {
  bestStreakOf,
  saveBestStreak,
  isSoundEnabled,
  setSoundEnabled,
  saveUnreportedSolved,
  takeUnreportedSolved
} = require('../../../utils/practice/records')
const { nextSolvedChest, nextStreakChest, expectsChest, isDailyCapReached } = require('../../../utils/practice/rewards')
const { practice } = require('../../../utils/api')
const { createSoundPlayer } = require('../../../utils/practice/sound')

const PRACTICE_ID = 'arithmetic'
const WELFARE_URL = '/pages/welfare/welfare'

const MAX_WRONG_BEFORE_REVEAL = 5
const CORRECT_PAUSE_MS = 1500
const BIG_CHEER_PAUSE_MS = 2600
const SECOND_VIBRATE_DELAY_MS = 150
const REVEAL_PAUSE_MS = 2300
const WRONG_SHAKE_MS = 450
const RECORD_MIN_STREAK = 3
const HOT_STREAK = 3

const OPERATOR_SYMBOLS = { '+': '+', '-': '−' }
const PRAISES = ['太棒啦！', '你是天才吧！', '聪明到发光！', '哇！全对！', '超级厉害！', '算得好快呀！', '小小数学家！', '你真了不起！']
const RETRY_PRAISES = ['改对啦！真棒！', '坚持就是胜利！']
const MASCOTS = ['🎉', '🌟', '🥳', '👍', '🤩', '💯', '🎈', '🏅']
const BIG_MASCOTS = ['🏆', '👑', '🚀', '🦄']
const ENCOURAGEMENTS = ['差一点点！', '再想想～', '别急，慢慢算', '换个思路试试', '你可以的！']
const MILESTONES = { 5: '真棒！连对 5 题', 10: '势不可挡！', 20: '数学小天才！', 50: '无人能敌！', 100: '传奇诞生！' }
const MILESTONE_EVERY_AFTER_HUNDRED = 50

const pick = (list) => list[Math.floor(Math.random() * list.length)]

const milestoneTitleOf = (streak) => {
  if (MILESTONES[streak]) return MILESTONES[streak]
  if (streak > 100 && streak % MILESTONE_EVERY_AFTER_HUNDRED === 0) return `连对 ${streak} 题！`
  return ''
}

const newRunId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

const dotsOf = (value) => Array.from({ length: value }, (_, index) => index)

const buildTokens = (question, showDots) => {
  const numberToken = (field) => {
    const isBlank = question.blank === field
    const value = question[field]
    return { kind: isBlank ? 'blank' : 'number', text: isBlank ? '' : String(value), dots: showDots && !isBlank ? dotsOf(value) : [] }
  }
  return [
    numberToken('left'),
    { kind: 'symbol', text: OPERATOR_SYMBOLS[question.operation], dots: [] },
    numberToken('right'),
    { kind: 'symbol', text: '=', dots: [] },
    numberToken('result')
  ]
}

Page({
  data: {
    tierLabel: '',
    maxInputDigits: 2,
    tokens: [],
    input: '',
    inputState: 'idle',
    feedbackLine: '',
    streak: 0,
    bestStreak: 0,
    starCount: 0,
    hotStreak: HOT_STREAK,
    streakBump: false,
    rewardBar: null,
    chestCount: 0,
    chestBump: false,
    recordBroken: false,
    soundEnabled: true,
    locked: false,
    cheer: { visible: false, title: '', subtitle: '', mascot: '', big: false },
    keypad: ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'delete', '0', 'confirm']
  },

  onLoad(query) {
    this.config = tierOf(Number(query.tier))
    this.bestAtStart = bestStreakOf(this.config.tier)
    this.question = null
    this.firstTry = true
    this.wrongCount = 0
    this.timers = []
    this.soundPlayer = createSoundPlayer()
    this.streakRunId = newRunId()
    this.unreportedSolved = takeUnreportedSolved(this.config.tier)
    this.reportedStreak = 0
    this.reportQueue = Promise.resolve()
    this.rewardState = null
    wx.setNavigationBarTitle({ title: `加减运算 · ${this.config.label}` })
    this.setData({
      tierLabel: this.config.label,
      maxInputDigits: this.config.maxInputDigits,
      bestStreak: this.bestAtStart,
      soundEnabled: isSoundEnabled()
    })
    this.nextQuestion()
    this.loadRewardState()
  },

  onHide() {
    this.reportOnLeave()
  },

  onUnload() {
    this.reportOnLeave()
    this.timers.forEach((timer) => clearTimeout(timer))
    this.soundPlayer.destroy()
  },

  async loadRewardState() {
    try {
      const stats = await practice.stats(PRACTICE_ID)
      this.rewardState = { rules: stats.rewardRules, totalSolved: stats.totalSolved + this.unreportedSolved, earnedToday: stats.earnedToday }
      const bestStreak = Math.max(this.data.bestStreak, stats.tiers[this.config.tier].bestStreak)
      this.bestAtStart = Math.max(this.bestAtStart, bestStreak)
      this.setData({ bestStreak, chestCount: stats.pendingChestCount })
      this.refreshRewardBar()
      if (this.unreportedSolved) this.report()
    } catch (error) {
      console.error('[practice] stats unavailable, rewards hidden for now', error)
    }
  },

  refreshRewardBar() {
    if (!this.rewardState) return
    const { rules, totalSolved, earnedToday } = this.rewardState
    if (isDailyCapReached(earnedToday, rules.dailyCaps)) {
      this.setData({ rewardBar: { capReached: true, progressPercent: 100, solvedText: '今天的宝箱攒满啦，明天再来', streakText: '练习照样记录题数和连对' } })
      return
    }
    const solvedChest = nextSolvedChest(totalSolved, rules, earnedToday)
    const streakChest = nextStreakChest(this.data.streak, rules, earnedToday)
    this.setData({
      rewardBar: {
        capReached: false,
        progressPercent: solvedChest ? solvedChest.progressPercent : 0,
        solvedText: solvedChest ? `再答对 ${solvedChest.remaining} 题得宝箱（${solvedChest.rewardText}）` : '',
        streakText: streakChest ? `连对到 ${streakChest.target} 题再得一个（${streakChest.rewardText}）` : ''
      }
    })
  },

  // Counts this answer and tells whether it is expected to earn a chest (the cloud decides for real).
  countSolved(streak, countsForStreak) {
    this.unreportedSolved += 1
    if (!this.rewardState) return false
    const { rules, totalSolved, earnedToday } = this.rewardState
    this.rewardState.totalSolved = totalSolved + 1
    return expectsChest(rules, earnedToday, { fromTotal: totalSolved, toTotal: totalSolved + 1, streak, countsForStreak })
  },

  report() {
    const solvedDelta = this.unreportedSolved
    const streak = this.data.streak
    this.unreportedSolved = 0
    this.reportedStreak = Math.max(this.reportedStreak, streak)
    const payload = { practiceId: PRACTICE_ID, tier: this.config.tier, solvedDelta, streak, streakRunId: this.streakRunId }
    this.reportQueue = this.reportQueue
      .then(() => practice.report(payload))
      .then((result) => {
        this.applyReport(result)
        return true
      })
      .catch((error) => {
        console.error('[practice] report failed, will retry with the next one', error)
        this.unreportedSolved += solvedDelta
        return false
      })
    return this.reportQueue
  },

  applyReport({ newChests, stats }) {
    if (this.rewardState) {
      this.rewardState.totalSolved = stats.totalSolved + this.unreportedSolved
      this.rewardState.earnedToday = stats.earnedToday
    }
    this.setData({ chestCount: stats.pendingChestCount, chestBump: false }, () => this.setData({ chestBump: newChests.length > 0 }))
    this.refreshRewardBar()
  },

  reportOnLeave() {
    if (!this.unreportedSolved && this.data.streak <= this.reportedStreak) return
    const tier = this.config.tier
    saveUnreportedSolved(tier, this.unreportedSolved)
    this.report().then((reported) => {
      if (reported) saveUnreportedSolved(tier, this.unreportedSolved)
    })
  },

  openWelfare() {
    wx.navigateTo({ url: WELFARE_URL })
  },

  later(callback, delayMs) {
    this.timers.push(setTimeout(callback, delayMs))
  },

  playSound(name) {
    this.soundPlayer.play(name)
  },

  toggleSound() {
    const soundEnabled = !this.data.soundEnabled
    setSoundEnabled(soundEnabled)
    this.setData({ soundEnabled })
  },

  nextQuestion() {
    this.question = generateQuestion(this.config.tier, { previousKey: this.question ? this.question.key : '' })
    this.firstTry = true
    this.wrongCount = 0
    this.setData({
      tokens: buildTokens(this.question, this.config.showDots),
      input: '',
      inputState: 'idle',
      feedbackLine: '',
      locked: false
    })
  },

  handleKey(event) {
    if (this.data.locked) return
    const { key } = event.currentTarget.dataset
    if (key === 'confirm') return this.confirmAnswer()
    if (key === 'delete') return this.setData({ input: this.data.input.slice(0, -1), inputState: 'idle' })
    const current = this.data.input === '0' ? '' : this.data.input
    if (current.length >= this.data.maxInputDigits) return
    this.setData({ input: current + key, inputState: 'idle' })
  },

  confirmAnswer() {
    if (this.data.input === '') {
      this.setData({ feedbackLine: '先点数字，把答案填进问号里' })
      return
    }
    if (isCorrect(this.question, this.data.input)) {
      this.handleCorrect()
    } else {
      this.handleWrong()
    }
  },

  handleCorrect() {
    const countsForStreak = this.firstTry
    const streak = countsForStreak ? this.data.streak + 1 : this.data.streak
    const bestStreak = Math.max(this.data.bestStreak, streak)
    const beatsRecord = countsForStreak && streak > this.bestAtStart && streak >= RECORD_MIN_STREAK
    const firstRecordMoment = beatsRecord && !this.data.recordBroken
    const milestoneTitle = countsForStreak ? milestoneTitleOf(streak) : ''
    const big = Boolean(milestoneTitle) || firstRecordMoment
    if (bestStreak > this.data.bestStreak) saveBestStreak(this.config.tier, bestStreak)
    const expectsChest = this.countSolved(streak, countsForStreak)

    let title = countsForStreak ? pick(PRAISES) : pick(RETRY_PRAISES)
    if (firstRecordMoment) title = '新纪录！'
    if (milestoneTitle) title = milestoneTitle
    let subtitle = '奖励你一颗星星 ⭐'
    if (countsForStreak && streak >= 2) subtitle = `已经连对 ${streak} 题啦！`
    if (firstRecordMoment) subtitle = `连对 ${streak} 题，超过了以前的自己！`
    if (expectsChest) subtitle = '🎁 得到一个宝箱！去福利袋打开'

    this.playSound(big ? 'milestone' : 'correct')
    wx.vibrateShort({ type: 'heavy' })
    if (big) this.later(() => wx.vibrateShort({ type: 'heavy' }), SECOND_VIBRATE_DELAY_MS)
    this.setData({
      locked: true,
      inputState: 'correct',
      feedbackLine: '',
      streak,
      bestStreak,
      starCount: this.data.starCount + 1,
      recordBroken: this.data.recordBroken || beatsRecord,
      streakBump: false,
      cheer: { visible: false, title, subtitle, mascot: pick(big ? BIG_MASCOTS : MASCOTS), big }
    }, () => this.setData({ streakBump: countsForStreak, 'cheer.visible': true }))
    this.refreshRewardBar()
    if (expectsChest) this.report()
    this.later(() => {
      this.setData({ 'cheer.visible': false })
      this.nextQuestion()
    }, big ? BIG_CHEER_PAUSE_MS : CORRECT_PAUSE_MS)
  },

  handleWrong() {
    this.firstTry = false
    if (this.data.streak > 0) this.streakRunId = newRunId()
    this.wrongCount += 1
    this.playSound('wrong')
    wx.vibrateShort({ type: 'medium' })
    if (this.wrongCount >= MAX_WRONG_BEFORE_REVEAL) {
      this.setData({
        locked: true,
        streak: 0,
        input: String(this.question.answer),
        inputState: 'revealed',
        feedbackLine: `正确答案是 ${this.question.answer}，记住它，下一题加油！`
      })
      this.refreshRewardBar()
      this.later(() => this.nextQuestion(), REVEAL_PAUSE_MS)
      return
    }
    const remaining = MAX_WRONG_BEFORE_REVEAL - this.wrongCount
    this.setData({
      streak: 0,
      inputState: 'wrong',
      feedbackLine: `${pick(ENCOURAGEMENTS)}${remaining <= 2 ? `（再错 ${remaining} 次就告诉你答案）` : ''}`
    })
    this.refreshRewardBar()
    this.later(() => this.setData({ input: '', inputState: 'idle' }), WRONG_SHAKE_MS)
  }
})
