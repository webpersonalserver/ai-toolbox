// A red flower that blooms near the top of the screen with a line of praise; it never blocks taps.
Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    visible: { type: Boolean, value: false },
    count: { type: Number, value: 1 },
    text: { type: String, value: '' }
  }
})
