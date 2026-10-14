const { factsOfRow, techniqueOf } = require('../../../utils/practice/multiplication')
const { markStudied, markRecited } = require('../../../utils/practice/multiplication-records')
const { syncProgress } = require('../../../utils/practice/multiplication-rewards')
const { HIDDEN_FLOWER_TOAST, HIDDEN_MEDAL_POPUP, createHonorPresenter, medalShareOf } = require('../../../utils/practice/honors')
const { KUNGFU_SHARE } = require('../../../utils/share')

const dotRowsOf = (fact) =>
  Array.from({ length: fact.small }, (_, rowIndex) => ({ id: rowIndex, dots: Array.from({ length: fact.large }, (_, dotIndex) => dotIndex) }))

Page({
  data: {
    flowerToast: HIDDEN_FLOWER_TOAST,
    medalPopup: HIDDEN_MEDAL_POPUP,
    row: 1,
    technique: null,
    cards: [],
    readCount: 0
  },

  onLoad(query) {
    this.honorPresenter = createHonorPresenter(this)
    const row = Math.min(Math.max(Number(query.row) || 1, 1), 9)
    const technique = techniqueOf(row)
    wx.setNavigationBarTitle({ title: `背口诀 · ${technique.name}` })
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
    const readCount = this.data.readCount + 1
    this.setData({ [`cards[${index}].read`]: true, readCount })
    if (readCount === this.data.cards.length && markRecited(this.data.row)) {
      syncProgress({ practiced: true }).then((result) => result && this.honorPresenter.present(result.honors))
    }
  },

  onUnload() {
    this.honorPresenter.destroy()
  },

  handleMedalClose() {
    this.honorPresenter.closeMedal()
  },

  onShareAppMessage(event) {
    return medalShareOf(event, this.data.medalPopup) || KUNGFU_SHARE
  },

  startTraining() {
    wx.redirectTo({ url: `/pages/practice/multiplication/train?row=${this.data.row}` })
  }
})
