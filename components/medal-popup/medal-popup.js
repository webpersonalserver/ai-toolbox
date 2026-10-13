// Full-screen medal: a fresh unlock (isNew) or a medal opened from the honor wall. Share goes to the page's onShareAppMessage.
Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    visible: { type: Boolean, value: false },
    isNew: { type: Boolean, value: false },
    medal: { type: Object, value: null }
  },

  methods: {
    noop() {},

    handleClose() {
      this.triggerEvent('close')
    }
  }
})
