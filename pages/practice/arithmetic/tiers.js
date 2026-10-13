const { TIERS, TIER_ORDER } = require('../../../utils/practice/arithmetic')
const { bestStreakOf } = require('../../../utils/practice/records')
const { practice } = require('../../../utils/api')
const { waitForPendingReport } = require('../../../utils/practice/pending-report')

const PRACTICE_ID = 'arithmetic'
const NO_RECORD_TEXT = '—'

const buildTiers = (cloudTiers) =>
  TIER_ORDER.map((tier) => {
    const cloudTier = cloudTiers ? cloudTiers[tier] : null
    const bestStreak = Math.max(bestStreakOf(tier), cloudTier ? cloudTier.bestStreak : 0)
    return {
      ...TIERS[tier],
      bestStreakText: bestStreak ? String(bestStreak) : NO_RECORD_TEXT,
      solvedText: cloudTier ? `已答对 ${cloudTier.solved} 题` : ''
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

  openTier(event) {
    wx.navigateTo({ url: `/pages/practice/arithmetic/play?tier=${event.currentTarget.dataset.tier}` })
  }
})
