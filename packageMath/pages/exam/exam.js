const { unitOf } = require('../../../utils/practice/catalog')
const { skillOf } = require('../../../utils/practice/skills/index')
const {
  EXAM_QUESTION_COUNT,
  POINTS_PER_QUESTION,
  UNLOCK_SCORE,
  WARNING_SECONDS,
  EXAM_LEVELS,
  gradeOf,
  levelOf,
  describeSeconds,
  formatClock,
  buildExamPaper
} = require('../../../utils/practice/exam')
const { practice } = require('../../../utils/api')
const { ensureLogin } = require('../../../utils/session')
const { createSoundPlayer } = require('../../../utils/practice/sound')
const { trackReport } = require('../../../utils/practice/pending-report')
const { HIDDEN_FLOWER_TOAST, HIDDEN_MEDAL_POPUP, createHonorPresenter, medalShareOf, mergeHonors } = require('../../../utils/practice/honors')
const { buildCertificateShare, buildExamShare } = require('../../../utils/share')

const PRACTICE_ID = 'math'
const SECOND_MS = 1000
const CORRECT_PAUSE_MS = 450
const STAGES = { SELECT: 'select', RUNNING: 'running', RESULT: 'result' }
const FULL_SCORE = EXAM_QUESTION_COUNT * POINTS_PER_QUESTION
const HIDDEN_CHEER = { visible: false, title: '', subtitle: '', mascot: '', big: false }
const HIDDEN_CERTIFICATE = { visible: false, nickname: '', achievement: '', dateText: '' }

const newRunId = () => `exam${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

const todayText = () => {
  const date = new Date()
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`
}

const buildLevelCards = (unit, cloudExams) =>
  EXAM_LEVELS.map((level, index) => {
    const cloud = cloudExams ? cloudExams[index] : null
    const unlocked = cloud ? cloud.unlocked : index === 0
    const previousName = index ? EXAM_LEVELS[index - 1].name : ''
    return {
      ...level,
      timeText: describeSeconds(unit.examSeconds[level.level]),
      unlocked,
      bestText: cloud && cloud.best !== null ? `最高 ${cloud.best} 分` : '还没考过',
      lockText: `${previousName}考到 ${UNLOCK_SCORE} 分解锁`
    }
  })

Page({
  data: {
    stage: STAGES.SELECT,
    unitName: '',
    questionCount: EXAM_QUESTION_COUNT,
    maxDigits: 2,
    levels: [],
    level: null,
    question: null,
    locked: false,
    progressText: '',
    clockText: '',
    timePercent: 100,
    warning: false,
    result: null,
    explain: { visible: false, steps: [] },
    cheer: HIDDEN_CHEER,
    certificate: HIDDEN_CERTIFICATE,
    flowerToast: HIDDEN_FLOWER_TOAST,
    medalPopup: HIDDEN_MEDAL_POPUP
  },

  onLoad(query) {
    this.unit = unitOf(query.unitId)
    this.skill = skillOf(this.unit.skill)
    this.timers = []
    this.soundPlayer = createSoundPlayer()
    this.honorPresenter = createHonorPresenter(this)
    wx.setNavigationBarTitle({ title: `${this.unit.name} · 限时考试` })
    this.setData({ unitName: this.unit.name, levels: buildLevelCards(this.unit, null) })
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
      const unitStats = (stats.units || {})[this.unit.id]
      if (unitStats) this.setData({ levels: buildLevelCards(this.unit, unitStats.exams) })
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
    this.paper = buildExamPaper(this.unit)
    this.index = 0
    this.correctCount = 0
    this.wrongQuestions = []
    this.timeLimit = this.unit.examSeconds[level]
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
    this.missedCurrent = false
    const question = this.paper[this.index]
    this.setData({
      question,
      maxDigits: question.maxDigits,
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

  // Only a first-try answer scores; a miss is noted once and the question stays until it is answered right.
  handleAnswered(event) {
    if (event.detail.correct) {
      if (!this.missedCurrent) this.correctCount += 1
      this.soundPlayer.play('correct')
      this.setData({ locked: true })
      this.later(() => this.advance(), CORRECT_PAUSE_MS)
      return
    }
    if (!this.missedCurrent) {
      this.missedCurrent = true
      this.wrongQuestions.push(this.paper[this.index])
    }
    this.soundPlayer.play('wrong')
    wx.vibrateShort({ type: 'medium' })
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
        wrongAnswers: this.wrongQuestions.map((question, index) => ({ id: index, equation: question.equation })),
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
        achievement: `${this.unit.name}${this.data.level.name}考试`,
        dateText: todayText()
      }
    })
  },

  closeCertificate() {
    this.setData({ certificate: HIDDEN_CERTIFICATE })
  },

  // Correct answers count as practice (totals, chests, flowers) and missed ones go to 小怪兽收容所;
  // then the paper itself is recorded.
  async submitResult({ level, seconds, score }) {
    const unitId = this.unit.id
    const mistakes = this.wrongQuestions.map((question) => ({ key: question.key, data: this.skill.toMistake(question) }))
    try {
      let answersHonors = null
      if (this.correctCount || mistakes.length) {
        const answers = { practiceId: PRACTICE_ID, unitId, solvedDelta: this.correctCount, streak: 0, streakRunId: newRunId(), reportId: newRunId() }
        if (mistakes.length) answers.mistakes = mistakes
        const answersReport = await trackReport(practice.report(answers))
        answersHonors = answersReport.honors
      }
      const outcome = await trackReport(practice.reportExam({ practiceId: PRACTICE_ID, unitId, level, correct: this.correctCount, seconds }))
      this.honorPresenter.present(mergeHonors(answersHonors, outcome.honors))
      const nextLevel = level < EXAM_LEVELS.length && outcome.exams[level].unlocked ? level + 1 : null
      this.setData({
        'result.newBest': outcome.isNewBest && outcome.previousBest !== null,
        'result.unlockedLevelName': outcome.unlockedLevel ? levelOf(outcome.unlockedLevel).name : '',
        'result.nextLevel': nextLevel,
        'result.nextLevelName': nextLevel ? levelOf(nextLevel).name : '',
        levels: buildLevelCards(this.unit, outcome.exams)
      })
    } catch (error) {
      console.error('[exam] result not saved', error, score)
      wx.showToast({ title: '网络不太好，这次成绩没保存上', icon: 'none' })
    }
  },

  openExplain(event) {
    const question = this.wrongQuestions[event.currentTarget.dataset.index]
    this.setData({ explain: { visible: true, steps: this.skill.explain(question) } })
  },

  closeExplain() {
    this.setData({ explain: { visible: false, steps: [] } })
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
      return buildCertificateShare(nickname, achievement)
    }
    return buildExamShare(this.unit.name)
  }
})
