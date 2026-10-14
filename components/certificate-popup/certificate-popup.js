// A 奖状 for a full-score exam. The share button goes to the page's onShareAppMessage (purpose "certificate").
const { isSwitchOn } = require('../../utils/switches')

// The share button only shows while 好友求助 / 分享 is on (控制中心).
Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    visible: { type: Boolean, value: false },
    nickname: { type: String, value: '' },
    achievement: { type: String, value: '' },
    score: { type: Number, value: 100 },
    dateText: { type: String, value: '' }
  },

  data: {
    sharing: true
  },

  observers: {
    visible(visible) {
      if (visible) this.setData({ sharing: isSwitchOn('sharing') })
    }
  },

  methods: {
    noop() {},

    handleClose() {
      this.triggerEvent('close')
    }
  }
})
