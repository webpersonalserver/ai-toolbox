const { tierOf } = require('../../../utils/practice/arithmetic')
const {
  EXAM_QUESTION_COUNT,
  POINTS_PER_QUESTION,
  UNLOCK_SCORE,
  WARNING_SECONDS,
  EXAM_LEVELS,
  TIME_LIMIT_SECONDS,
  gradeOf,
  levelOf,
  describeSeconds,
  formatClock,
  buildExamPaper
} = require('../../../utils/practice/arithmetic-exam')
const { practice } = require('../../../utils/api')
const { ensureLogin } = require('../../../utils/session')
const { createSoundPlayer } = require('../../../utils/practice/sound')
const { trackReport } = require('../../../utils/practice/pending-report')
const { HIDDEN_FLOWER_TOAST, HIDDEN_MEDAL_POPUP, createHonorPresenter, medalShareOf, mergeHonors } = require('../../../utils/practice/honors')

const PRACTICE_ID = 'arithmetic'
const SECOND_MS = 1000
const CORRECT_PAUSE_MS = 450
const WRONG_PAUSE_MS = 1100
const STAGES = { SELECT: 'select', RUNNING: 'running', RESULT: 'result' }
const FULL_SCORE = EXAM_QUESTION_COUNT * POINTS_PER_QUESTION
const HIDDEN_CHEER = { visible: false, title: '', subtitle: '', mascot: '', big: false }
const HIDDEN_CERTIFICATE = { visible: false, nickname: '', achievement: '', dateText: '' }
const PRACTICE_TAB_PATH = '/pages/practice/index'

const newRunId = () => `exam${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

const todayText = () => {
  const date = new Date()
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`
}

const buildLevelCards = (tier, cloudExams) =>
  EXAM_LEVELS.map((level, index) => {
    const cloud = cloudExams ? cloudExams[index] : null
    const unlocked = cloud ? cloud.unlocked : index === 0
    const previousName = index ? EXAM_LEVELS[index - 1].name : ''
    return {
      ...level,
      timeText: describeSeconds(TIME_LIMIT_SECONDS[tier][level.level]),
      unlocked,
      bestText: cloud && cloud.best !== null ? `最高 ${cloud.best} 分` : '还没考过',
      lockText: `${previousName}考到 ${UNLOCK_SCORE} 分解锁`
    }
  })

Page({
  data: {
    stage: STAGES.SELECT,
    tierLabel: '',
    questionCount: EXAM_QUESTION_COUNT,
    maxDigits: 2,
    levels: [],
    level: null,
    question: null,
    revealed: false,
    locked: false,
    progressText: '',
    clockText: '',
    timePercent: 100,
    warning: false,
    result: null,
    cheer: HIDDEN_CHEER,
    certificate: HIDDEN_CERTIFICATE,
    flowerToast: HIDDEN_FLOWER_TOAST,
    medalPopup: HIDDEN_MEDAL_POPUP
  },

  onLoad(query) {
    this.config = tierOf(Number(query.tier))
    this.timers = []
    this.soundPlayer = createSoundPlayer()
    this.honorPresenter = createHonorPresenter(this)
    wx.setNavigationBarTitle({ title: `${this.config.label} · 限时考试` })
    this.setData({ tierLabel: this.config.label, maxDigits: this.config.maxInputDigits, levels: buildLevelCards(this.config.tier, null) })
    this.loadLevels()
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

  async loadLevels() {
    try {
      const stats = await practice.stats(PRACTICE_ID)
      this.setData({ levels: buildLevelCards(this.config.tier, stats.tiers[this.config.tier].exams) })
    } catch (error) {
      console.error('[exam] levels unavailable, only 初级 open for now', error)
    }
  },

  chooseLevel(event) {
    const card = this.data.levels.find((level) => level.level === event.currentTarget.dataset.level)
    if (!card.unlocked) {
      wx.showToast({ title: card.lockText, icon: 'none' })
      return
    }
    this.startExam(card.level)
  },

  startExam(level) {
    this.paper = buildExamPaper(this.config.tier)
    this.index = 0
    this.correctCount = 0
    this.wrongAnswers = []
    this.timeLimit = TIME_LIMIT_SECONDS[this.config.tier][level]
    this.startedAt = Date.now()
    this.finished = false
    this.soundPlayer.play('gong')
    this.setData({ stage: STAGES.RUNNING, level: levelOf(level), result: null, warning: false })
    this.showQuestion()
    this.tick()
    this.clock = setInterval(() => this.tick(), SECOND_MS)
  },

  stopClock() {
    clearInterval(this.clock)
    this.clock = null
  },

  elapsedSeconds() {
    return Math.min(Math.round((Date.now() - this.startedAt) / SECOND_MS), this.timeLimit)
  },

  tick() {
    const remaining = this.timeLimit - this.elapsedSeconds()
    this.setData({
      clockText: formatClock(remaining),
      timePercent: Math.round((remaining / this.timeLimit) * 100),
      warning: remaining <= WARNING_SECONDS
    })
    if (remaining <= 0) this.finishExam(true)
  },

  showQuestion() {
    this.setData({
      question: this.paper[this.index],
      revealed: false,
      locked: false,
      cheer: HIDDEN_CHEER,
      progressText: `第 ${this.index + 1} / ${this.paper.length} 题`
    })
  },

  advance() {
    if (this.finished) return
    this.index += 1
    if (this.index >= this.paper.length) {
      this.finishExam(false)
      return
    }
    this.showQuestion()
  },

  handleEmpty() {
    wx.showToast({ title: '先按数字，再交答案', icon: 'none' })
  },

  // One try per question in an exam: a miss shows the right answer and moves on.
  handleAnswered(event) {
    if (event.detail.correct) {
      this.correctCount += 1
      this.soundPlayer.play('correct')
      this.setData({ locked: true })
      this.later(() => this.advance(), CORRECT_PAUSE_MS)
      return
    }
    const question = this.paper[this.index]
    this.wrongAnswers.push(question.equation)
    this.soundPlayer.play('wrong')
    wx.vibrateShort({ type: 'medium' })
    this.setData({ locked: true, revealed: true })
    this.later(() => this.advance(), WRONG_PAUSE_MS)
  },

  finishExam(timeUp) {
    if (this.finished) return
    this.finished = true
    this.stopClock()
    const seconds = Math.max(this.elapsedSeconds(), 1)
    const score = this.correctCount * POINTS_PER_QUESTION
    const grade = gradeOf(score)
    const unanswered = this.paper.length - this.index - (timeUp ? 0 : 1)
    const level = this.data.level
    this.setData({
      stage: STAGES.RESULT,
      locked: true,
      result: {
        score,
        grade: grade.name,
        mascot: grade.mascot,
        isFullScore: score === FULL_SCORE,
        correctText: `答对 ${this.correctCount} / ${this.paper.length} 题`,
        timeText: timeUp ? `时间到！还有 ${Math.max(unanswered, 0)} 题没做` : `用时 ${describeSeconds(seconds)}（限时 ${describeSeconds(this.timeLimit)}）`,
        wrongAnswers: this.wrongAnswers,
        newBest: false,
        unlockedLevelName: '',
        nextLevel: null
      }
    })
    this.celebrate(score)
    this.submitResult({ level: level.level, seconds, score })
  },

  celebrate(score) {
    if (score === FULL_SCORE) {
      this.soundPlayer.play('milestone')
      this.later(() => this.soundPlayer.play('gong'), 500)
      wx.vibrateShort({ type: 'heavy' })
      this.setData({ cheer: { visible: true, title: '100 分！', subtitle: '满分小状元', mascot: '👑', big: true } })
      this.later(() => this.showCertificate(), 1800)
      return
    }
    if (score >= UNLOCK_SCORE) {
      this.soundPlayer.play('milestone')
      this.setData({ cheer: { visible: true, title: `${score} 分！`, subtitle: gradeOf(score).name, mascot: gradeOf(score).mascot, big: false } })
    }
  },

  async showCertificate() {
    let nickname = '小同学'
    try {
      const session = await ensureLogin()
      nickname = session.profile.nickname || nickname
    } catch (error) {
      console.error('[exam] nickname unavailable for the certificate', error)
    }
    this.setData({
      cheer: HIDDEN_CHEER,
      certificate: {
        visible: true,
        nickname,
        achievement: `${this.config.label}加减法${this.data.level.name}考试`,
        dateText: todayText()
      }
    })
  },

  closeCertificate() {
    this.setData({ certificate: HIDDEN_CERTIFICATE })
  },

  // Correct answers count as practice (totals, chests, flowers); then the paper itself is recorded.
  async submitResult({ level, seconds, score }) {
    try {
      let answersHonors = null
      if (this.correctCount) {
        const answersReport = await trackReport(
          practice.report({ practiceId: PRACTICE_ID, tier: this.config.tier, solvedDelta: this.correctCount, streak: 0, streakRunId: newRunId() })
        )
        answersHonors = answersReport.honors
      }
      const outcome = await trackReport(
        practice.reportExam({ practiceId: PRACTICE_ID, tier: this.config.tier, level, correct: this.correctCount, seconds })
      )
      this.honorPresenter.present(mergeHonors(answersHonors, outcome.honors))
      const nextLevel = level < EXAM_LEVELS.length && outcome.exams[level].unlocked ? level + 1 : null
      this.setData({
        'result.newBest': outcome.isNewBest && outcome.previousBest !== null,
        'result.unlockedLevelName': outcome.unlockedLevel ? levelOf(outcome.unlockedLevel).name : '',
        'result.nextLevel': nextLevel,
        'result.nextLevelName': nextLevel ? levelOf(nextLevel).name : '',
        levels: buildLevelCards(this.config.tier, outcome.exams)
      })
    } catch (error) {
      console.error('[exam] result not saved', error, score)
      wx.showToast({ title: '网络不太好，这次成绩没保存上', icon: 'none' })
    }
  },

  retry() {
    this.startExam(this.data.level.level)
  },

  goNextLevel() {
    this.startExam(this.data.result.nextLevel)
  },

  backToLevels() {
    this.setData({ stage: STAGES.SELECT, result: null, cheer: HIDDEN_CHEER })
  },

  handleMedalClose() {
    this.honorPresenter.closeMedal()
  },

  onShareAppMessage(event) {
    const medalShare = medalShareOf(event, this.data.medalPopup)
    if (medalShare) return medalShare
    const isCertificate = event.from === 'button' && event.target.dataset.purpose === 'certificate'
    if (isCertificate) {
      const { nickname, achievement } = this.data.certificate
      return { title: `${nickname}在${achievement}中考了 100 分，获得一张奖状！`, path: PRACTICE_TAB_PATH }
    }
    return { title: `来挑战${this.config.label}加减法限时考试，看看你能考几分！`, path: PRACTICE_TAB_PATH }
  }
})
