const { TECHNIQUES, ROW_COUNT, EXAM_QUESTION_COUNT, EXAM_LIVES, realmOf } = require('../../../utils/practice/multiplication')
const { readProgress, rowProgressOf, masteredRowCount } = require('../../../utils/practice/multiplication-records')
const { syncProgress } = require('../../../utils/practice/multiplication-rewards')
const { HIDDEN_FLOWER_TOAST, HIDDEN_MEDAL_POPUP, createHonorPresenter, medalShareOf } = require('../../../utils/practice/honors')
const { KUNGFU_SHARE } = require('../../../utils/share')

const CHINESE_ORDINALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九']
const STAR_SLOTS = [1, 2, 3]

const describeSeconds = (seconds) => `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`

Page({
  data: {
    flowerToast: HIDDEN_FLOWER_TOAST,
    medalPopup: HIDDEN_MEDAL_POPUP,
    realm: '',
    masteredCount: 0,
    rowCount: ROW_COUNT,
    starSlots: STAR_SLOTS,
    rows: [],
    exam: null,
    pendingChestCount: 0,
    examRule: `${EXAM_QUESTION_COUNT} 题 · ${EXAM_LIVES} 条命，闯完就是神功大成`
  },

  onLoad() {
    this.honorPresenter = createHonorPresenter(this)
  },

  onUnload() {
    this.honorPresenter.destroy()
  },

  onShow() {
    this.renderProgress()
    syncProgress().then((result) => {
      if (!result) return
      this.honorPresenter.present(result.honors)
      this.renderProgress()
      this.setData({ pendingChestCount: result.pendingChestCount })
    })
  },

  renderProgress() {
    const progress = readProgress()
    const masteredCount = masteredRowCount(progress)
    this.setData({
      realm: realmOf(masteredCount, progress.exam.passed),
      masteredCount,
      rows: TECHNIQUES.map((technique) => {
        const rowProgress = rowProgressOf(progress, technique.row)
        const previousMastered = technique.row === 1 || rowProgressOf(progress, technique.row - 1).mastered
        return {
          ...technique,
          ordinal: `第${CHINESE_ORDINALS[technique.row - 1]}重`,
          stars: rowProgress.stars,
          mastered: rowProgress.mastered,
          unlocked: previousMastered || rowProgress.mastered
        }
      }),
      exam: {
        passed: progress.exam.passed,
        passText: progress.exam.passed ? `已大成 ${progress.exam.passCount} 次 · 最快 ${describeSeconds(progress.exam.fastestSeconds)}` : '',
        adviceText: masteredCount < ROW_COUNT ? '建议九重全部练成再来，不过随时都可以挑战' : '九重已全部练成，去证明自己吧！'
      }
    })
  },

  openRow(event) {
    const { row, unlocked } = event.currentTarget.dataset
    if (!unlocked) {
      wx.showToast({ title: '先练成上一重才能解锁', icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/pages/practice/multiplication/study?row=${row}` })
  },

  openWelfare() {
    wx.navigateTo({ url: '/pages/welfare/welfare' })
  },

  handleMedalClose() {
    this.honorPresenter.closeMedal()
  },

  onShareAppMessage(event) {
    return medalShareOf(event, this.data.medalPopup) || KUNGFU_SHARE
  },

  openExam() {
    wx.navigateTo({ url: '/pages/practice/multiplication/exam' })
  }
})
