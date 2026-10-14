// Full-screen medal: a fresh unlock (isNew) or a medal opened from the honor wall. Share goes to the page's onShareAppMessage.
const { isSwitchOn } = require('../../utils/switches')

// The share button only shows while 好友求助 / 分享 is on (控制中心).
Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    visible: { type: Boolean, value: false },
    isNew: { type: Boolean, value: false },
    medal: { type: Object, value: null }
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
