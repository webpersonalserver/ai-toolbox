const { ROW_COUNT, techniqueOf, buildTrainingQueue, requeueMissed, starsOf, realmOf } = require('../../../utils/practice/multiplication')
const { readProgress, masteredRowCount, saveTrainingResult } = require('../../../utils/practice/multiplication-records')
const { createSoundPlayer } = require('../../../utils/practice/sound')
const { syncProgress, describeNewChests } = require('../../../utils/practice/multiplication-rewards')
const { HIDDEN_FLOWER_TOAST, HIDDEN_MEDAL_POPUP, createHonorPresenter, medalShareOf } = require('../../../utils/practice/honors')

const CHINESE_ORDINALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九']
const WRONG_BEFORE_REVEAL = 2
const CORRECT_PAUSE_MS = 1000
const REVEAL_PAUSE_MS = 2200
const MASTERY_CHEER_MS = 1800
const PRAISES = ['好招式！', '内力大增！', '一招制胜！', '身手不凡！', '出手如电！', '功力见长！']
const MASCOTS = ['🥋', '⚡', '🔥', '💥', '👊', '🌟']
const ENCOURAGEMENTS = ['招式不对，再来！', '稳住内力，再想想', '差一点就打中了！']
const HIDDEN_CHEER = { visible: false, title: '', subtitle: '', mascot: '', big: false }

const pick = (list) => list[Math.floor(Math.random() * list.length)]

Page({
  data: {
    flowerToast: HIDDEN_FLOWER_TOAST,
    medalPopup: HIDDEN_MEDAL_POPUP,
    heading: '',
    question: null,
    revealed: false,
    locked: false,
    progressText: '',
    progressPercent: 0,
    combo: 0,
    feedbackLine: '',
    cheer: HIDDEN_CHEER,
    result: { visible: false }
  },

  onLoad(query) {
    this.row = Math.min(Math.max(Number(query.row) || 1, 1), ROW_COUNT)
    this.technique = techniqueOf(this.row)
    this.timers = []
    this.soundPlayer = createSoundPlayer()
    this.honorPresenter = createHonorPresenter(this)
    wx.setNavigationBarTitle({ title: `练功 · ${this.technique.name}` })
    this.setData({ heading: `第${CHINESE_ORDINALS[this.row - 1]}重 · ${this.technique.name}` })
    this.startTraining()
  },

  onUnload() {
    this.timers.forEach((timer) => clearTimeout(timer))
    this.soundPlayer.destroy()
    this.honorPresenter.destroy()
  },

  later(callback, delayMs) {
    this.timers.push(setTimeout(callback, delayMs))
  },

  startTraining() {
    this.queue = buildTrainingQueue(this.row)
    this.index = 0
    this.mistakes = 0
    this.setData({ combo: 0, result: { visible: false } })
    this.showQuestion()
  },

  showQuestion() {
    this.wrongOnCurrent = 0
    this.setData({
      question: this.queue[this.index],
      revealed: false,
      locked: false,
      feedbackLine: '',
      cheer: HIDDEN_CHEER,
      progressText: `第 ${this.index + 1} / ${this.queue.length} 招`,
      progressPercent: Math.round((this.index / this.queue.length) * 100)
    })
  },

  advance() {
    this.index += 1
    if (this.index >= this.queue.length) {
      this.finishTraining()
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
    const combo = this.wrongOnCurrent ? this.data.combo : this.data.combo + 1
    this.soundPlayer.play('correct')
    wx.vibrateShort({ type: 'light' })
    this.setData({
      locked: true,
      combo,
      feedbackLine: '',
      cheer: { visible: true, title: pick(PRAISES), subtitle: combo >= 3 ? `${combo} 连击！` : '', mascot: pick(MASCOTS), big: false }
    })
    this.later(() => this.advance(), CORRECT_PAUSE_MS)
  },

  handleWrong() {
    this.wrongOnCurrent += 1
    this.mistakes += 1
    this.soundPlayer.play('wrong')
    wx.vibrateShort({ type: 'medium' })
    if (this.wrongOnCurrent < WRONG_BEFORE_REVEAL) {
      this.setData({ combo: 0, feedbackLine: pick(ENCOURAGEMENTS) })
      return
    }
    this.queue = requeueMissed(this.queue, this.index, this.queue[this.index])
    this.setData({
      combo: 0,
      locked: true,
      revealed: true,
      feedbackLine: '这句口诀念三遍，过一会儿还会再考你'
    })
    this.later(() => this.advance(), REVEAL_PAUSE_MS)
  },

  finishTraining() {
    const realmBefore = realmOf(masteredRowCount(readProgress()), readProgress().exam.passed)
    const stars = starsOf(this.mistakes)
    const { firstMastery, improvedStars } = saveTrainingResult(this.row, stars)
    const chestsSynced = syncProgress({ practiced: true })
    const progressAfter = readProgress()
    const realmAfter = realmOf(masteredRowCount(progressAfter), progressAfter.exam.passed)
    this.soundPlayer.play('gong')
    this.later(() => this.soundPlayer.play('milestone'), 500)
    wx.vibrateShort({ type: 'heavy' })
    this.setData({
      locked: true,
      progressPercent: 100,
      cheer: { visible: true, title: `${this.technique.name} 练成！`, subtitle: firstMastery ? '突破成功！' : '功力更加深厚', mascot: '🥋', big: true }
    })
    let subtitle = '功力更加深厚了'
    if (improvedStars) subtitle = '星级刷新！'
    if (realmAfter !== realmBefore) subtitle = `境界提升：${realmAfter}`
    const isLastRow = this.row >= ROW_COUNT
    const actions = [
      isLastRow ? { key: 'exam', text: '闭关考核，冲击神功大成', primary: true } : { key: 'next', text: `修炼第${CHINESE_ORDINALS[this.row]}重`, primary: true },
      { key: 'again', text: stars < 3 ? '再练一遍，冲三星' : '再练一遍', primary: false },
      { key: 'back', text: '返回秘籍', primary: false }
    ]
    this.later(() => {
      this.setData({
        cheer: HIDDEN_CHEER,
        result: {
          visible: true,
          heading: this.data.heading,
          title: `${this.technique.name} 练成！`,
          subtitle,
          stars,
          lines: [this.mistakes ? `出错 ${this.mistakes} 次${stars < 3 ? '，零失误可得三星' : ''}` : '零失误，完美！'],
          actions
        }
      })
      chestsSynced.then((result) => {
        if (result) this.honorPresenter.present(result.honors)
        const chestLine = describeNewChests(result)
        if (chestLine && this.data.result.visible) this.setData({ 'result.lines': [...this.data.result.lines, chestLine] })
      })
    }, MASTERY_CHEER_MS)
  },

  handleMedalClose() {
    this.honorPresenter.closeMedal()
  },

  onShareAppMessage(event) {
    return medalShareOf(event, this.data.medalPopup) || { title: '一起修炼九九神功，看谁先神功大成！', path: '/pages/practice/multiplication/index' }
  },

  handleResultAction(event) {
    const { key } = event.detail
    if (key === 'next') wx.redirectTo({ url: `/pages/practice/multiplication/study?row=${this.row + 1}` })
    if (key === 'exam') wx.redirectTo({ url: '/pages/practice/multiplication/exam' })
    if (key === 'again') this.startTraining()
    if (key === 'back') wx.navigateBack()
  }
})
