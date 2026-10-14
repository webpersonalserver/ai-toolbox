const { practice } = require('../../utils/api')
const { HIDDEN_MEDAL_POPUP, toMedalPopup, medalShareOf } = require('../../utils/practice/honors')
const { buildHonorsShare } = require('../../utils/share')
const { isSwitchOn } = require('../../utils/switches')


Page({
  data: {
    sharing: true,
    loading: true,
    failed: false,
    honors: null,
    medalPopup: HIDDEN_MEDAL_POPUP
  },

  onShow() {
    this.setData({ sharing: isSwitchOn('sharing') })
    this.load()
  },

  // A failed load keeps the wall from an earlier visit; only an empty page shows the retry card.
  async load() {
    try {
      this.setData({ loading: false, failed: false, honors: await practice.honors() })
    } catch (error) {
      console.error('[honors] wall unavailable', error)
      this.setData({ loading: false, failed: !this.data.honors })
    }
  },

  retry() {
    this.setData({ loading: true, failed: false })
    this.load()
  },

  openMedal(event) {
    const { groupIndex, medalIndex } = event.currentTarget.dataset
    this.setData({ medalPopup: toMedalPopup(this.data.honors.groups[groupIndex].medals[medalIndex], false) })
  },

  handleMedalClose() {
    this.setData({ medalPopup: HIDDEN_MEDAL_POPUP })
  },

  onShareAppMessage(event) {
    const medalShare = medalShareOf(event, this.data.medalPopup)
    if (medalShare) return medalShare
    const flowers = this.data.honors ? this.data.honors.flowers : 0
    return buildHonorsShare(flowers)
  }
})
