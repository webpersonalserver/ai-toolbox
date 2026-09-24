// pages/ledger/ledger.js — 牌局记账入口
const ledgerApi = require('../../utils/ledger')

Page({
  data: {
    recent: [],
    code: ''
  },

  onShow() {
    this.setData({ recent: ledgerApi.getRecent() })
  },

  onCodeInput(e) {
    this.setData({ code: e.detail.value.replace(/\D/g, '').slice(0, 8) })
  },

  goCreate() {
    wx.navigateTo({ url: '/pages/ledger/create' })
  },

  /** 用房号进别人的房间 */
  join() {
    const code = this.data.code.trim()
    if (!code) {
      wx.showToast({ title: '请输入房号', icon: 'none' })
      return
    }
    wx.showLoading({ title: '进入房间', mask: true })
    ledgerApi.joinRoom(code).then((room) => {
      wx.hideLoading()
      ledgerApi.saveRecent(room)
      wx.navigateTo({ url: '/pages/ledger/room?roomId=' + room.roomId })
    }).catch((e) => {
      wx.hideLoading()
      wx.showModal({ title: '进不去', content: e.message || String(e), showCancel: false })
    })
  },

  openRoom(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/ledger/room?roomId=' + id })
  },

  removeRecent(e) {
    const id = e.currentTarget.dataset.id
    const list = ledgerApi.getRecent().filter((x) => x.roomId !== id)
    wx.setStorageSync('ledger_recent_rooms', list)
    this.setData({ recent: list })
  },

  onShareAppMessage() {
    return { title: '打牌不用带现金，扫码进房间记账', path: '/pages/ledger/ledger' }
  }
})
