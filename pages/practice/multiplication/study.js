const { factsOfRow, techniqueOf } = require('../../../utils/practice/multiplication')
const { markStudied } = require('../../../utils/practice/multiplication-records')

const dotRowsOf = (fact) =>
  Array.from({ length: fact.small }, (_, rowIndex) => ({ id: rowIndex, dots: Array.from({ length: fact.large }, (_, dotIndex) => dotIndex) }))

Page({
  data: {
    row: 1,
    technique: null,
    cards: [],
    readCount: 0
  },

  onLoad(query) {
    const row = Math.min(Math.max(Number(query.row) || 1, 1), 9)
    const technique = techniqueOf(row)
    wx.setNavigationBarTitle({ title: `研读 · ${technique.name}` })
    markStudied(row)
    this.setData({
      row,
      technique,
      cards: factsOfRow(row).map((fact) => ({ ...fact, dotRows: dotRowsOf(fact), read: false }))
    })
  },

  readCard(event) {
    const { index } = event.currentTarget.dataset
    if (this.data.cards[index].read) return
    wx.vibrateShort({ type: 'light' })
    this.setData({ [`cards[${index}].read`]: true, readCount: this.data.readCount + 1 })
  },

  startTraining() {
    wx.redirectTo({ url: `/pages/practice/multiplication/train?row=${this.data.row}` })
  }
})
