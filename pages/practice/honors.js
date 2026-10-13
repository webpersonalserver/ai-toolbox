const { practice, toastError } = require('../../utils/api')
const { HIDDEN_MEDAL_POPUP, toMedalPopup, medalShareOf } = require('../../utils/practice/honors')
const { buildHonorsShare } = require('../../utils/share')


Page({
  data: {
    loading: true,
    honors: null,
    medalPopup: HIDDEN_MEDAL_POPUP
  },

  async onShow() {
    try {
      this.setData({ loading: false, honors: await practice.honors() })
    } catch (error) {
      this.setData({ loading: false })
      toastError(error)
    }
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
