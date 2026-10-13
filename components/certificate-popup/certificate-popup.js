// A 奖状 for a full-score exam. The share button goes to the page's onShareAppMessage (purpose "certificate").
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

  methods: {
    noop() {},

    handleClose() {
      this.triggerEvent('close')
    }
  }
})
