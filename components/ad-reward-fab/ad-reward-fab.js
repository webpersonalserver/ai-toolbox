const { watchAdForItem } = require('../../utils/ad-reward')

// Floating "看视频领奖励" button. Renders nothing when there is no video left to watch today (offers is empty).
Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    offers: { type: Array, value: [] }
  },

  data: {
    sheetVisible: false,
    watchingType: ''
  },

  observers: {
    offers(offers) {
      if (!offers.length && this.data.sheetVisible) this.setData({ sheetVisible: false })
    }
  },

  methods: {
    noop() {},

    openSheet() {
      this.setData({ sheetVisible: true })
    },

    closeSheet() {
      this.setData({ sheetVisible: false })
    },

    async watch(event) {
      if (this.data.watchingType) return
      const { itemType } = event.currentTarget.dataset
      this.setData({ watchingType: itemType })
      const result = await watchAdForItem(itemType)
      this.setData({ watchingType: '', sheetVisible: false })
      if (result) this.triggerEvent('rewarded', { itemType, amount: result.rewardAmount })
    }
  }
})
