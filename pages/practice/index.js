const { SUBJECTS } = require('../../utils/practice/catalog')
const { COPY, MASCOT, mascotView, pick } = require('../../utils/practice/copy')
const { fallBackFromCloudImage } = require('../../utils/assets')
const { DEFAULT_SHARE } = require('../../utils/share')
const { practice } = require('../../utils/api')
const { waitForPendingReport } = require('../../utils/practice/pending-report')
const { openPage } = require('../../utils/navigation')

const HONORS_URL = '/pages/practice/honors'
const WEEKLY_URL = '/packageMath/pages/weekly/weekly'
// Shown until the cloud answers, so the card keeps its place and the list below does not jump.
const PLACEHOLDER_HONORS = { flowers: '—', todayFlowers: 0, unlockedCount: '—', dayStreak: '—' }

Page({
  data: {
    subjects: SUBJECTS.map((subject) => ({ ...subject, intro: subject.open ? subject.intro : COPY.comingSoon })),
    honors: PLACEHOLDER_HONORS,
    mascot: MASCOT,
    greeting: COPY.parkGreetings[0],
    tags: { open: COPY.openTag, building: COPY.buildingTag },
    weeklyLabel: COPY.weekly
  },

  // A cloud picture that will not load on this phone: draw the packaged copies instead (utils/assets.js).
  handleImageError(event) {
    if (fallBackFromCloudImage(event)) this.setData({ mascot: mascotView() })
  },

  async onShow() {
    this.setData({ greeting: pick(COPY.parkGreetings), mascot: mascotView() })
    try {
      await waitForPendingReport()
      this.setData({ honors: await practice.honors() })
    } catch (error) {
      console.error('[practice] honors unavailable', error)
    }
  },

  openHonors() {
    openPage(HONORS_URL)
  },

  openWeekly() {
    openPage(WEEKLY_URL)
  },

  openSubject(event) {
    const subject = this.data.subjects.find((candidate) => candidate.id === event.currentTarget.dataset.id)
    if (!subject.open) {
      wx.showToast({ title: COPY.comingSoon, icon: 'none' })
      return
    }
    openPage(subject.entryUrl)
  },

  onShareAppMessage() {
    return DEFAULT_SHARE
  }
})
