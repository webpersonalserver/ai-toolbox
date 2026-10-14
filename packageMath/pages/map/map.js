const { practice } = require('../../../utils/api')
const { unitOf } = require('../../../utils/practice/catalog')
const { COPY, MASCOT, mascotView } = require('../../../utils/practice/copy')
const { imageOf } = require('../../../utils/assets')
const { buildIslandMap, routeDots } = require('../../../utils/practice/island-map')
const { readProgress, masteredRowCount } = require('../../../utils/practice/multiplication-records')
const { waitForPendingReport } = require('../../../utils/practice/pending-report')
const { DEFAULT_SHARE } = require('../../../utils/share')

const SUBJECT_ID = 'math'
const WEEKLY_URL = '/packageMath/pages/weekly/weekly'
// Island centres inside the map area (the header sits above it, in normal flow).
const TOP_PADDING_RPX = 210
// An island (picture rising above its box + name card) spans about 220rpx above its centre and 170rpx below;
// the spacing leaves the route room to wind between them.
const ISLAND_SPACING_RPX = 580
const BOTTOM_PADDING_RPX = 260
// The route leaves from under an island's name card and arrives just above the next island's picture.
const ROUTE_LEAVE_BELOW_RPX = 195
const ROUTE_ARRIVE_ABOVE_RPX = 235
// Islands zig-zag across the sea so the route reads as a winding path.
const ISLAND_X_PERCENT = [30, 70]

const islandPosition = (index) => ({ x: ISLAND_X_PERCENT[index % ISLAND_X_PERCENT.length], y: TOP_PADDING_RPX + index * ISLAND_SPACING_RPX })

// Where a unit's buttons lead; units with their own pages (九九神功) only have the practice entry.
const unitRoutes = (unitId) => {
  const unit = unitOf(unitId)
  if (unit.entryUrl) return { practice: unit.entryUrl, exam: '', monsters: '' }
  return {
    practice: `/packageMath/pages/play/play?unitId=${unitId}`,
    exam: `/packageMath/pages/exam/exam?unitId=${unitId}`,
    monsters: `/packageMath/pages/play/play?unitId=${unitId}&mode=monsters`
  }
}

const kungfuSummary = () => {
  const progress = readProgress()
  return { masteredRows: masteredRowCount(progress), grandmaster: progress.exam.passed }
}

Page({
  data: {
    mascot: MASCOT,
    copy: { comingSoon: COPY.comingSoon, start: COPY.start, monsterHouse: COPY.monsterHouse, badges: COPY.badges, weekly: COPY.weekly },
    bubble: '',
    recommendation: null,
    islands: [],
    dots: [],
    // The light running along the route plays only while the page is on screen; re-adding the class restarts it
    // from the first dot.
    sailing: false,
    mapHeight: 0,
    sheet: null
  },

  onShow() {
    this.setData({ mascot: mascotView() })
    this.render({})
    this.setData({ sailing: true })
    this.loadStats()
  },

  onHide() {
    this.setData({ sailing: false })
  },

  onUnload() {
    this.setData({ sailing: false })
  },

  async loadStats() {
    try {
      await waitForPendingReport()
      const stats = await practice.stats(SUBJECT_ID)
      this.render(stats.units || {})
    } catch (error) {
      console.error('[map] stats unavailable, showing the map without progress', error)
    }
  },

  render(unitStats) {
    const { islands, recommendation } = buildIslandMap(SUBJECT_ID, unitStats, kungfuSummary())
    const placed = islands.map((island, index) => {
      const { x, y } = islandPosition(index)
      return {
        ...island,
        art: { ...island.art, image: imageOf(island.art.image) },
        side: index % 2 ? 'right' : 'left',
        style: `left: ${x}%; top: ${y}rpx`
      }
    })
    this.unitStats = unitStats
    this.setData({
      islands: placed,
      dots: routeDots(islands.map((_, index) => islandPosition(index)), { leaveBelow: ROUTE_LEAVE_BELOW_RPX, arriveAbove: ROUTE_ARRIVE_ABOVE_RPX }),
      mapHeight: TOP_PADDING_RPX + (islands.length - 1) * ISLAND_SPACING_RPX + BOTTOM_PADDING_RPX,
      bubble: recommendation ? COPY.recommend[recommendation.reason](recommendation) : COPY.allMastered,
      recommendation: recommendation ? { ...recommendation, goText: COPY.recommendGo[recommendation.reason] } : null,
      sheet: this.data.sheet ? placed.find((island) => island.id === this.data.sheet.id) : null
    })
  },

  // The boat's suggestion: monsters open 小怪兽藏身洞, everything else starts a round.
  openRecommendation() {
    const { unitId, reason } = this.data.recommendation
    wx.navigateTo({ url: unitRoutes(unitId)[reason === 'monsters' ? 'monsters' : 'practice'] })
  },

  openWeekly() {
    wx.navigateTo({ url: WEEKLY_URL })
  },

  openIsland(event) {
    const island = this.data.islands.find((candidate) => candidate.id === event.currentTarget.dataset.id)
    this.setData({ sheet: island })
  },

  closeSheet() {
    this.setData({ sheet: null })
  },

  noop() {},

  openUnit(event) {
    const { unitId, target } = event.currentTarget.dataset
    const unit = this.data.sheet.units.find((candidate) => candidate.id === unitId)
    if (unit.comingSoon) {
      wx.showToast({ title: COPY.comingSoon, icon: 'none' })
      return
    }
    wx.navigateTo({ url: unitRoutes(unitId)[target] })
  },

  onShareAppMessage() {
    return DEFAULT_SHARE
  }
})
