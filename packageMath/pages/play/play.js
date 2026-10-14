const { unitOf } = require('../../../utils/practice/catalog')
const { skillOf } = require('../../../utils/practice/skills/index')
const { COPY, MASCOT, mascotView, pick } = require('../../../utils/practice/copy')
const { ROUND_SIZE, starsOfRound, nextStarHint } = require('../../../utils/practice/round')
const { bestStreakOf, saveBestStreak, isSoundEnabled, setSoundEnabled } = require('../../../utils/practice/records')
const { saveUnitReports, takeUnitReports } = require('../../../utils/practice/unit-reports')
const { nextSolvedChest, nextStreakChest, expectsChest, expectsFlower, isDailyCapReached } = require('../../../utils/practice/rewards')
const { practice } = require('../../../utils/api')
const { trackReport } = require('../../../utils/practice/pending-report')
const { createSoundPlayer } = require('../../../utils/practice/sound')
const { HIDDEN_FLOWER_TOAST, HIDDEN_MEDAL_POPUP, createHonorPresenter, medalShareOf } = require('../../../utils/practice/honors')
const { ARITHMETIC_SHARE } = require('../../../utils/share')

const SUBJECT_ID = 'math'
const CHESTS_URL = '/pages/welfare/chests'
const MAP_URL = '/packageMath/pages/map/map'
const MODES = { ROUND: 'round', ENDLESS: 'endless', MONSTERS: 'monsters' }

const MAX_WRONG_BEFORE_REVEAL = 5
const CORRECT_PAUSE_MS = 1500
const BIG_CHEER_PAUSE_MS = 2600
const SECOND_VIBRATE_DELAY_MS = 150
const REVEAL_PAUSE_MS = 2300
const WRONG_SHAKE_MS = 450
const RECORD_MIN_STREAK = 3
// Breaking a streak this long is worth a word of praise before the retry.
const PRAISED_STREAK = 3
const HOT_STREAK = 3
const SYMBOL_TOKENS = ['+', '−', '=', '×', '÷', '分成', '和', '合成']
const CHOICE_LABELS = { '>': '大于', '<': '小于', '=': '等于' }
// Longer equations (连加连减, 三位数) get a smaller font so they stay on one line.
const COMPACT_CHARACTERS = 8
const COMPACT_TOKENS = 5

const MASCOTS = ['🎉', '🌟', '🥳', '👍', '🤩', '💯', '🎈', '🏅']
const BIG_MASCOTS = ['🏆', '👑', '🚀', '🦄']
const MILESTONES = { 5: '连对 5 题，好厉害喵！', 10: '势不可挡！', 20: '数学小天才！', 50: '无人能敌！', 100: '传奇诞生！' }
const MILESTONE_EVERY_AFTER_HUNDRED = 50
const HIDDEN_CHEER = { visible: false, title: '', subtitle: '', mascot: '', big: false }

const milestoneTitleOf = (streak) => {
  if (MILESTONES[streak]) return MILESTONES[streak]
  if (streak > 100 && streak % MILESTONE_EVERY_AFTER_HUNDRED === 0) return `连对 ${streak} 题！`
  return ''
}

const newReportId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
const newRunId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

// The equation with a picture under each known number (the blank and the symbols get none).
const buildTokens = (question, pictures) =>
  question.tokens.map((text, index) => ({
    id: index,
    kind: text === '' ? 'blank' : SYMBOL_TOKENS.includes(text) ? 'symbol' : 'number',
    text,
    picture: pictures[index] || null
  }))

const isCompact = (question) => {
  const characters = question.tokens.reduce((total, token) => total + (token === '' ? question.maxDigits : token.length), 0)
  return characters > COMPACT_CHARACTERS || question.tokens.length > COMPACT_TOKENS
}

// 分与合 shows the whole on top and its two parts below; bond holds the token index of each circle.
const bondOf = (question, tokens) =>
  question.layout === 'bond' ? { top: tokens[question.bond.top], left: tokens[question.bond.left], right: tokens[question.bond.right] } : null

const roundDots = (results, size = ROUND_SIZE) =>
  Array.from({ length: size }, (_, index) => ({ id: index, state: results[index] || (index === results.length ? 'current' : '') }))

Page({
  data: {
    unitName: '',
    mode: MODES.ROUND,
    maxDigits: 2,
    tokens: [],
    bond: null,
    story: '',
    choices: [],
    compact: false,
    input: '',
    inputState: 'idle',
    feedbackLine: '',
    canExplain: false,
    explain: { visible: false, steps: [] },
    streak: 0,
    bestStreak: 0,
    hotStreak: HOT_STREAK,
    streakBump: false,
    dots: [],
    roundResult: null,
    rewardBar: null,
    chestCount: 0,
    chestBump: false,
    flowerToast: HIDDEN_FLOWER_TOAST,
    medalPopup: HIDDEN_MEDAL_POPUP,
    recordBroken: false,
    soundEnabled: true,
    locked: false,
    mascot: MASCOT,
    labels: { explain: COPY.explainButton, nextRound: COPY.nextRound, endless: COPY.endless, monsterRound: COPY.monsterRound },
    monsterLoading: false,
    cheer: HIDDEN_CHEER,
    keypad: ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'delete', '0', 'confirm']
  },

  onLoad(query) {
    this.setData({ mascot: mascotView() })
    this.unit = unitOf(query.unitId)
    this.skill = skillOf(this.unit.skill)
    this.bestAtStart = Math.max(bestStreakOf(this.unit.id), this.unit.legacyTier ? bestStreakOf(this.unit.legacyTier) : 0)
    this.question = null
    this.firstTry = true
    this.wrongCount = 0
    this.timers = []
    this.soundPlayer = createSoundPlayer()
    this.honorPresenter = createHonorPresenter(this)
    this.hasReportedAnswer = false
    this.streakRunId = newRunId()
    this.unreportedSolved = 0
    this.pendingMistakes = []
    this.pendingReviews = []
    this.pendingDiscards = []
    this.caughtKeys = []
    this.pendingRoundStars = null
    this.unsentReports = takeUnitReports(this.unit.id, this.unit.legacyTier, newReportId)
    this.reportedStreak = 0
    this.reportQueue = Promise.resolve()
    this.rewardState = null
    wx.setNavigationBarTitle({ title: this.unit.name })
    this.setData({ unitName: this.unit.name, bestStreak: this.bestAtStart, soundEnabled: isSoundEnabled() })
    if (query.mode === MODES.MONSTERS) {
      wx.setNavigationBarTitle({ title: `${this.unit.name} · 抓小怪兽` })
      this.startMonsters()
    } else {
      this.startMode(query.mode === MODES.ENDLESS ? MODES.ENDLESS : MODES.ROUND)
    }
    this.loadRewardState()
  },

  onHide() {
    this.reportOnLeave()
  },

  onUnload() {
    this.reportOnLeave()
    this.timers.forEach((timer) => clearTimeout(timer))
    this.soundPlayer.destroy()
    this.honorPresenter.destroy()
  },

  noop() {},

  // ----- rounds -----

  startMode(mode, monsters = []) {
    this.roundResults = []
    this.firstTryCorrect = 0
    this.monsters = monsters
    this.roundSize = mode === MODES.MONSTERS ? monsters.length : ROUND_SIZE
    this.setData({ mode, roundResult: null, dots: mode === MODES.ENDLESS ? [] : roundDots([], this.roundSize) })
    this.nextQuestion()
  },

  // 小怪兽藏身洞: up to one round of this unit's mistakes, oldest first. Answers here only review them.
  async startMonsters() {
    this.setData({ mode: MODES.MONSTERS, monsterLoading: true, locked: true, roundResult: null })
    let monsters = []
    try {
      await this.sendReports()
      const { mistakes } = await practice.mistakes(SUBJECT_ID, this.unit.id)
      const rebuilt = mistakes.map((mistake) => ({ key: mistake.key, question: this.skill.fromMistake(mistake.data, this.unit.options) }))
      const playable = rebuilt.filter((monster) => monster.question)
      // Records that no longer make a question can never be caught: drop them so the count goes down.
      this.pendingDiscards.push(...rebuilt.filter((monster) => !monster.question).map((monster) => monster.key))
      this.monsterTotal = playable.length
      monsters = playable.slice(0, ROUND_SIZE)
    } catch (error) {
      console.error('[math] mistakes unavailable', error)
      this.setData({ monsterLoading: false })
      wx.showToast({ title: '网络不太好，藏身洞没打开', icon: 'none' })
      return
    }
    this.setData({ monsterLoading: false })
    if (this.pendingDiscards.length) this.report()
    if (!monsters.length) {
      this.setData({ roundResult: this.monsterResultOf({ empty: true }) })
      return
    }
    this.caughtKeys = []
    this.startMode(MODES.MONSTERS, monsters)
  },

  startRound() {
    this.startMode(MODES.ROUND)
  },

  continueMonsters() {
    this.startMonsters()
  },

  startEndless() {
    this.startMode(MODES.ENDLESS)
  },

  backToMap() {
    wx.navigateBack({ fail: () => wx.redirectTo({ url: MAP_URL }) })
  },

  // A question is done (right, or answer shown): record it in the round, then move on or finish the round.
  finishQuestion(state) {
    if (this.data.mode === MODES.ENDLESS) return this.nextQuestion()
    this.roundResults.push(state)
    if (state === 'first') this.firstTryCorrect += 1
    if (this.roundResults.length < this.roundSize) {
      this.setData({ dots: roundDots(this.roundResults, this.roundSize) })
      return this.nextQuestion()
    }
    if (this.data.mode === MODES.MONSTERS) return this.finishMonsterRound()
    this.finishRound()
  },

  // Whether a monster is caught is decided by the cloud (right twice in a row), so the card waits for the report.
  async finishMonsterRound() {
    this.setData({ locked: true, dots: roundDots(this.roundResults, this.roundSize) })
    const saved = await this.report()
    const caught = this.caughtKeys.length
    this.soundPlayer.play(caught ? 'milestone' : 'correct')
    this.setData({ roundResult: this.monsterResultOf({ saved, caught, remaining: Math.max(this.monsterTotal - caught, 0) }) })
  },

  monsterResultOf({ empty = false, saved = true, caught = 0, remaining = 0 }) {
    const base = { monsters: true, stars: 0, slots: [], hint: '', canContinue: false }
    if (empty) return { ...base, happy: true, line: COPY.monsterHouseEmpty, detail: '' }
    const detail = `这轮第一次就答对 ${this.firstTryCorrect} / ${this.roundSize} 题`
    if (!saved) return { ...base, happy: false, line: '网络不太好，抓到的小怪兽稍后再登记喵～', detail }
    if (!remaining) return { ...base, happy: true, line: COPY.monsterAllCaught, detail }
    return {
      ...base,
      happy: caught > 0,
      line: caught ? `抓回 ${caught} 只小怪兽！还剩 ${remaining} 只` : `还有 ${remaining} 只小怪兽躲在藏身洞，连续答对 2 次就能抓住喵～`,
      detail,
      canContinue: true
    }
  },

  finishRound() {
    const stars = starsOfRound(this.firstTryCorrect)
    const hint = nextStarHint(this.firstTryCorrect)
    this.pendingRoundStars = stars
    this.report()
    const roundResult = {
      stars,
      happy: stars >= 2,
      slots: [1, 2, 3].map((slot) => ({ id: slot, on: slot <= stars })),
      line: COPY.roundStars[stars],
      detail: `第一次就答对 ${this.firstTryCorrect} / ${ROUND_SIZE} 题`,
      hint: hint ? `再多答对 ${hint.more} 题就是 ${hint.stars} 颗星` : ''
    }
    this.setData({ locked: true, dots: roundDots(this.roundResults) })
    if (stars < 3) {
      this.soundPlayer.play('correct')
      this.setData({ roundResult })
      return
    }
    // Three stars: the full-screen celebration plays first, then the result card slides in.
    this.soundPlayer.play('milestone')
    this.later(() => this.soundPlayer.play('gong'), 400)
    this.setData({ cheer: { visible: true, title: '三颗星！', subtitle: '你是这座岛的小主人喵！', mascot: '👑', big: true } })
    this.later(() => this.setData({ cheer: HIDDEN_CHEER, roundResult }), BIG_CHEER_PAUSE_MS)
  },

  // ----- rewards (same rules as before: chests, flowers, daily caps) -----

  async loadRewardState() {
    try {
      const stats = await practice.stats(SUBJECT_ID)
      const unitStats = (stats.units || {})[this.unit.id] || {}
      this.rewardState = { rules: stats.rewardRules, flowerRules: stats.flowerRules, totalSolved: stats.totalSolved + this.pendingSolved(), earnedToday: stats.earnedToday }
      const bestStreak = Math.max(this.data.bestStreak, unitStats.bestStreak || 0)
      this.bestAtStart = Math.max(this.bestAtStart, bestStreak)
      this.setData({ bestStreak, chestCount: stats.pendingChestCount })
      this.refreshRewardBar()
      if (this.unsentReports.length) this.sendReports()
    } catch (error) {
      console.error('[math] stats unavailable, rewards hidden for now', error)
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

  // Counts this answer and tells what it is expected to earn (the cloud decides for real).
  countSolved(streak, countsForStreak) {
    this.unreportedSolved += 1
    const isFirstAnswer = !this.hasReportedAnswer
    if (!this.rewardState) return { chest: false, shouldReport: isFirstAnswer }
    const { rules, flowerRules, totalSolved, earnedToday } = this.rewardState
    this.rewardState.totalSolved = totalSolved + 1
    const moment = { fromTotal: totalSolved, toTotal: totalSolved + 1, streak, countsForStreak }
    const chest = expectsChest(rules, earnedToday, moment)
    return { chest, shouldReport: isFirstAnswer || chest || expectsFlower(flowerRules, moment) }
  },

  pendingSolved() {
    return this.unreportedSolved + this.unsentReports.reduce((total, report) => total + report.solvedDelta, 0)
  },

  // Packages answers, new mistakes and a finished round's stars, then sends every unconfirmed report in order.
  report() {
    const streak = this.data.streak
    if (this.hasNews()) {
      const payload = {
        practiceId: SUBJECT_ID,
        unitId: this.unit.id,
        solvedDelta: this.unreportedSolved,
        streak,
        streakRunId: this.streakRunId,
        reportId: newReportId()
      }
      if (this.pendingMistakes.length) payload.mistakes = this.pendingMistakes
      if (this.pendingReviews.length) payload.reviews = this.pendingReviews
      if (this.pendingDiscards.length) payload.discards = this.pendingDiscards
      if (this.pendingRoundStars !== null) payload.roundStars = this.pendingRoundStars
      this.unsentReports.push(payload)
      if (this.unreportedSolved) this.hasReportedAnswer = true
      this.unreportedSolved = 0
      this.pendingMistakes = []
      this.pendingReviews = []
      this.pendingDiscards = []
      this.pendingRoundStars = null
      this.reportedStreak = Math.max(this.reportedStreak, streak)
    }
    return this.sendReports()
  },

  sendReports() {
    this.reportQueue = this.reportQueue.then(async () => {
      while (this.unsentReports.length) {
        let result
        try {
          result = await practice.report(this.unsentReports[0])
        } catch (error) {
          console.error('[math] report failed, will resend the same report later', error)
          if (!this.reportFailureShown) {
            this.reportFailureShown = true
            wx.showToast({ title: '网络不太好，答题记录稍后补上', icon: 'none' })
          }
          return false
        }
        this.unsentReports.shift()
        try {
          this.applyReport(result)
        } catch (error) {
          console.error('[math] report saved, but refreshing the page failed', error)
        }
      }
      return true
    })
    return trackReport(this.reportQueue)
  },

  hasNews() {
    const { unreportedSolved, pendingMistakes, pendingReviews, pendingDiscards, pendingRoundStars, reportedStreak } = this
    const hasMistakeNews = pendingMistakes.length || pendingReviews.length || pendingDiscards.length
    return unreportedSolved || this.data.streak > reportedStreak || hasMistakeNews || pendingRoundStars !== null
  },

  applyReport({ newChests, stats, honors, caughtMistakes = [] }) {
    this.caughtKeys.push(...caughtMistakes)
    this.honorPresenter.present(honors)
    if (this.rewardState) {
      this.rewardState.totalSolved = stats.totalSolved + this.pendingSolved()
      this.rewardState.earnedToday = stats.earnedToday
    }
    this.setData({ chestCount: stats.pendingChestCount, chestBump: false }, () => this.setData({ chestBump: newChests.length > 0 }))
    this.refreshRewardBar()
  },

  // Unconfirmed reports are saved first, so closing the app mid-request loses nothing; the next visit resends them.
  reportOnLeave() {
    if (!this.hasNews() && !this.unsentReports.length) return
    const sending = this.report()
    saveUnitReports(this.unit.id, this.unsentReports)
    sending.then(() => saveUnitReports(this.unit.id, this.unsentReports))
  },

  handleMedalClose() {
    this.honorPresenter.closeMedal()
  },

  onShareAppMessage(event) {
    return medalShareOf(event, this.data.medalPopup) || ARITHMETIC_SHARE
  },

  // The top-bar chest only wiggles: leaving mid-question would lose the round. Chests open from the result card.
  bumpChest() {
    this.setData({ chestBump: false }, () => this.setData({ chestBump: true }))
  },

  openChests() {
    wx.navigateTo({ url: CHESTS_URL })
  },

  later(callback, delayMs) {
    this.timers.push(setTimeout(callback, delayMs))
  },

  toggleSound() {
    const soundEnabled = !this.data.soundEnabled
    setSoundEnabled(soundEnabled)
    this.setData({ soundEnabled })
  },

  // ----- questions -----

  nextQuestion() {
    const monster = this.data.mode === MODES.MONSTERS ? this.monsters[this.roundResults.length] : null
    this.monsterKey = monster ? monster.key : ''
    this.question = monster ? monster.question : this.skill.generate(this.unit.options, { previousKey: this.question ? this.question.key : '' })
    this.firstTry = true
    this.wrongCount = 0
    const tokens = buildTokens(this.question, this.skill.visual(this.question, this.unit.options))
    this.setData({
      tokens,
      bond: bondOf(this.question, tokens),
      story: this.question.story || '',
      choices: (this.question.choices || []).map((value) => ({ value, label: CHOICE_LABELS[value] || '' })),
      compact: isCompact(this.question),
      maxDigits: this.question.maxDigits,
      input: '',
      inputState: 'idle',
      feedbackLine: '',
      canExplain: false,
      cheer: HIDDEN_CHEER,
      locked: false
    })
  },

  handleKey(event) {
    if (this.data.locked) return
    const { key } = event.currentTarget.dataset
    if (key === 'confirm') return this.confirmAnswer()
    if (key === 'delete') return this.setData({ input: this.data.input.slice(0, -1), inputState: 'idle' })
    const current = this.data.input === '0' ? '' : this.data.input
    if (current.length >= this.data.maxDigits) return
    this.setData({ input: current + key, inputState: 'idle' })
  },

  handleChoice(event) {
    if (this.data.locked) return
    this.setData({ input: event.currentTarget.dataset.choice, inputState: 'idle' })
    this.confirmAnswer()
  },

  confirmAnswer() {
    if (this.data.input === '') {
      this.setData({ feedbackLine: '先点数字，把答案填进问号里喵～' })
      return
    }
    if (this.skill.check(this.question, this.data.input)) {
      this.handleCorrect()
    } else {
      this.handleWrong()
    }
  },

  openExplain() {
    this.setData({ explain: { visible: true, steps: this.skill.explain(this.question) } })
  },

  closeExplain() {
    this.setData({ explain: { visible: false, steps: [] }, feedbackLine: '现在你来算一次吧喵～' })
  },

  handleCorrect() {
    const countsForStreak = this.firstTry
    const streak = countsForStreak ? this.data.streak + 1 : this.data.streak
    const bestStreak = Math.max(this.data.bestStreak, streak)
    const beatsRecord = countsForStreak && streak > this.bestAtStart && streak >= RECORD_MIN_STREAK
    const firstRecordMoment = beatsRecord && !this.data.recordBroken
    const milestoneTitle = countsForStreak ? milestoneTitleOf(streak) : ''
    const big = Boolean(milestoneTitle) || firstRecordMoment
    if (bestStreak > this.data.bestStreak) saveBestStreak(this.unit.id, bestStreak)
    const expected = this.countSolved(streak, countsForStreak)
    if (this.monsterKey && countsForStreak) this.pendingReviews.push({ key: this.monsterKey, correct: true })

    let title = countsForStreak ? pick(COPY.correct) : pick(COPY.retryCorrect)
    if (firstRecordMoment) title = '新纪录！'
    if (milestoneTitle) title = milestoneTitle
    let subtitle = ''
    if (countsForStreak && streak >= 2) subtitle = `已经连对 ${streak} 题啦！`
    if (firstRecordMoment) subtitle = `连对 ${streak} 题，超过了以前的自己！`
    if (expected.chest) subtitle = '🎁 得到一个宝箱！去「我的宝箱」打开'

    this.soundPlayer.play(big ? 'milestone' : 'correct')
    wx.vibrateShort({ type: 'heavy' })
    if (big) this.later(() => wx.vibrateShort({ type: 'heavy' }), SECOND_VIBRATE_DELAY_MS)
    this.setData({
      locked: true,
      inputState: 'correct',
      feedbackLine: '',
      canExplain: false,
      streak,
      bestStreak,
      recordBroken: this.data.recordBroken || beatsRecord,
      streakBump: false,
      cheer: { visible: false, title, subtitle, mascot: pick(big ? BIG_MASCOTS : MASCOTS), big }
    }, () => this.setData({ streakBump: countsForStreak, 'cheer.visible': true }))
    this.refreshRewardBar()
    if (expected.shouldReport) this.report()
    this.later(() => this.finishQuestion(countsForStreak ? 'first' : 'retry'), big ? BIG_CHEER_PAUSE_MS : CORRECT_PAUSE_MS)
  },

  handleWrong() {
    if (this.firstTry && this.monsterKey) this.pendingReviews.push({ key: this.monsterKey, correct: false })
    if (this.firstTry && !this.monsterKey) this.pendingMistakes.push({ key: this.question.key, data: this.skill.toMistake(this.question) })
    const brokenStreak = this.data.streak
    this.firstTry = false
    if (this.data.streak > 0) this.streakRunId = newRunId()
    this.wrongCount += 1
    this.soundPlayer.play('wrong')
    wx.vibrateShort({ type: 'medium' })
    if (this.wrongCount >= MAX_WRONG_BEFORE_REVEAL) {
      this.setData({
        locked: true,
        streak: 0,
        canExplain: false,
        input: this.question.answer,
        inputState: 'revealed',
        feedbackLine: `答案是 ${this.question.answer}，这只小怪兽躲进藏身洞啦，下次去抓它喵！`
      })
      this.refreshRewardBar()
      this.later(() => this.finishQuestion('revealed'), REVEAL_PAUSE_MS)
      return
    }
    const remaining = MAX_WRONG_BEFORE_REVEAL - this.wrongCount
    // A long streak just ended: praise it first so the miss does not feel like losing everything.
    const line = brokenStreak >= PRAISED_STREAK ? `刚才连对 ${brokenStreak} 题，超棒！再来一次～` : pick(COPY.wrong)
    this.setData({
      streak: 0,
      inputState: 'wrong',
      canExplain: true,
      feedbackLine: `${line}${remaining <= 2 ? `（再试 ${remaining} 次，喵算算就来帮你）` : ''}`
    })
    this.refreshRewardBar()
    this.later(() => this.setData({ input: '', inputState: 'idle' }), WRONG_SHAKE_MS)
  }
})
