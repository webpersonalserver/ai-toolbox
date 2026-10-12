const ITEM_LABELS = {
  stamina: '体力',
  hint: '提示'
}

Component({
  properties: {
    itemType: { type: String, value: 'stamina' },
    value: { type: Number, value: 0 },
    large: { type: Boolean, value: false }
  },

  data: {
    label: ''
  },

  observers: {
    itemType(itemType) {
      this.setData({ label: ITEM_LABELS[itemType] || '' })
    }
  }
})
