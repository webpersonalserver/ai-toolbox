const { TIERS, TIER_ORDER } = require('../../../utils/practice/arithmetic')
const { bestStreakOf } = require('../../../utils/practice/records')
const { practice } = require('../../../utils/api')
const { EXAM_LEVELS } = require('../../../utils/practice/arithmetic-exam')
const { waitForPendingReport } = require('../../../utils/practice/pending-report')

const PRACTICE_ID = 'arithmetic'
const NO_RECORD_TEXT = '—'

const describeExams = (exams) => {
  const taken = (exams || []).filter((exam) => exam.best !== null)
  if (!taken.length) return '还没考过'
  const highest = taken[taken.length - 1]
  return `${EXAM_LEVELS[highest.level - 1].name} 最高 ${highest.best} 分`
}

const buildTiers = (cloudTiers) =>
  TIER_ORDER.map((tier) => {
    const cloudTier = cloudTiers ? cloudTiers[tier] : null
    const bestStreak = Math.max(bestStreakOf(tier), cloudTier ? cloudTier.bestStreak : 0)
    return {
      ...TIERS[tier],
      bestStreakText: bestStreak ? String(bestStreak) : NO_RECORD_TEXT,
      solvedText: cloudTier ? `已答对 ${cloudTier.solved} 题` : '',
      examText: cloudTier ? describeExams(cloudTier.exams) : ''
    }
  })

Page({
  data: {
    tiers: []
  },

  async onShow() {
    this.setData({ tiers: buildTiers(null) })
    try {
      await waitForPendingReport()
      const stats = await practice.stats(PRACTICE_ID)
      this.setData({ tiers: buildTiers(stats.tiers) })
    } catch (error) {
      console.error('[practice] stats unavailable, showing local records', error)
    }
  },

  openExam(event) {
    wx.navigateTo({ url: `/pages/practice/arithmetic/exam?tier=${event.currentTarget.dataset.tier}` })
  },

  openTier(event) {
    wx.navigateTo({ url: `/pages/practice/arithmetic/play?tier=${event.currentTarget.dataset.tier}` })
  }
})
