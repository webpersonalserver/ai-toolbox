const { practice } = require('../../../utils/api')
const { unitOf } = require('../../../utils/practice/catalog')
const { COPY, MASCOT, mascotView } = require('../../../utils/practice/copy')
const { waitForPendingReport } = require('../../../utils/practice/pending-report')
const { buildWeeklyShare, DEFAULT_SHARE } = require('../../../utils/share')
const { isSwitchOn } = require('../../../utils/switches')

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
const KUNGFU_ROWS = 9

const monthDayOf = (dateKey) => `${Number(dateKey.slice(4, 6))} 月 ${Number(dateKey.slice(6, 8))} 日`

const compareText = (solved, lastWeekSolved) => {
  if (!lastWeekSolved) return solved ? '上周还没开始，这周起步啦' : ''
  if (solved > lastWeekSolved) return `比上周多 ${solved - lastWeekSolved} 题 📈`
  // Never tell a child they did worse: point at how close beating last week is.
  if (solved < lastWeekSolved) return `这周答对 ${solved} 题，下周多练一点点就能超过上周啦！`
  return '和上周一样多'
}

const commentOf = (practicedDays) => COPY.weeklyComments.find((comment) => practicedDays >= comment.minDays).line

// The cloud's numbers turned into what the page shows.
const toView = (week) => ({
  rangeText: `${monthDayOf(week.days[0].dateKey)} – ${monthDayOf(week.days[week.days.length - 1].dateKey)}`,
  days: week.days.map((day, index) => ({ ...day, weekday: WEEKDAYS[index] })),
  practicedDays: week.practicedDays,
  solved: week.solved,
  compareText: compareText(week.solved, week.lastWeekSolved),
  stars: week.stars,
  caught: week.caught,
  medals: week.medals,
  monsters: week.monsters.map((monster) => ({ ...monster, unitName: (unitOf(monster.unitId) || { name: monster.unitId }).name })),
  kungfuText: `${week.kungfuRows} / ${KUNGFU_ROWS} 重`,
  comment: commentOf(week.practicedDays)
})

Page({
  data: {
    sharing: true,
    mascot: MASCOT,
    loading: true,
    failed: false,
    week: null
  },

  onShow() {
    this.setData({ sharing: isSwitchOn('sharing'), mascot: mascotView() })
    this.load()
  },

  async load() {
    try {
      await waitForPendingReport()
      const week = await practice.weekly()
      this.setData({ loading: false, failed: false, week: toView(week) })
    } catch (error) {
      console.error('[weekly] report unavailable', error)
      this.setData({ loading: false, failed: true })
    }
  },

  retry() {
    this.setData({ loading: true, failed: false })
    this.load()
  },

  catchMonsters(event) {
    wx.navigateTo({ url: `/packageMath/pages/play/play?unitId=${event.currentTarget.dataset.unitId}&mode=monsters` })
  },

  onShareAppMessage() {
    return this.data.week ? buildWeeklyShare(this.data.week) : DEFAULT_SHARE
  }
})
