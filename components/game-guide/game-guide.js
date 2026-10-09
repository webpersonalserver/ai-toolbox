Component({
  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: '玩法说明' },
    sections: { type: Array, value: [] },
    confirmText: { type: String, value: '知道了' }
  },

  methods: {
    handleConfirm() {
      this.triggerEvent('confirm')
    },

    handleClose() {
      this.triggerEvent('close')
    },

    noop() {}
  }
})
