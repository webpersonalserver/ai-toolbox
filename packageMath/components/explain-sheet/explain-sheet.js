const { COPY, MASCOT, mascotView } = require('../../../utils/practice/copy')
const { fallBackFromCloudImage } = require('../../../utils/assets')

// 喵算算 explains a question one step at a time; each step's picture pops in fresh.
Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    visible: { type: Boolean, value: false },
    steps: { type: Array, value: [] }
  },

  data: {
    index: 0,
    shown: [],
    isLast: false,
    mascot: MASCOT,
    labels: { next: COPY.explainNext, done: COPY.explainDone }
  },

  observers: {
    'visible, steps'(visible, steps) {
      if (visible && steps.length) this.show(0)
    }
  },

  methods: {
    noop() {},

    // A cloud picture that will not load on this phone: draw the packaged copy instead (utils/assets.js).
    handleImageError(event) {
      if (fallBackFromCloudImage(event)) this.setData({ mascot: mascotView() })
    },

    show(index) {
      const { steps } = this.data
      // The cat picture is resolved on open (not on attach): setData while the component is still being created breaks the render layer.
      this.setData({ index, shown: [{ ...steps[index], id: `${index}-${Date.now()}` }], isLast: index === steps.length - 1, mascot: mascotView() })
    },

    next() {
      if (this.data.isLast) {
        this.triggerEvent('close')
        return
      }
      this.show(this.data.index + 1)
    }
  }
})
