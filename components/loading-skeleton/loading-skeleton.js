const DEFAULT_ROWS = 3

Component({
  properties: {
    rows: { type: Number, value: DEFAULT_ROWS }
  },

  data: {
    rowList: []
  },

  observers: {
    rows(rows) {
      this.setData({ rowList: Array.from({ length: Math.max(rows, 1) }, (_, index) => index) })
    }
  }
})
