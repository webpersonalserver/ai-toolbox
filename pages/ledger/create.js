// pages/ledger/create.js — 创建房间：起个名字、把人加上
const ledgerApi = require('../../utils/ledger')

Page({
  data: {
    roomName: '',
    members: ['', '', '', '']     // 空 = 用默认名「玩家N」
  },

  onNameInput(e) {
    this.setData({ roomName: e.detail.value.slice(0, 20) })
  },

  onMemberInput(e) {
    const i = Number(e.currentTarget.dataset.index)
    const members = this.data.members.slice()
    members[i] = e.detail.value.slice(0, 8)
    this.setData({ members })
  },

  /** 一键调整人数，少一个填上默认位、多一个加空位 */
  setCount(e) {
    const n = Number(e.currentTarget.dataset.n)
    const members = this.data.members.slice()
    while (members.length < n) members.push('')
    members.length = n
    this.setData({ members })
  },

  addMember() {
    if (this.data.members.length >= 12) {
      wx.showToast({ title: '最多 12 个人', icon: 'none' })
      return
    }
    const members = this.data.members.concat([''])
    this.setData({ members })
  },

  removeMember(e) {
    const i = Number(e.currentTarget.dataset.index)
    if (this.data.members.length <= 2) {
      wx.showToast({ title: '至少 2 个人', icon: 'none' })
      return
    }
    const members = this.data.members.slice()
    members.splice(i, 1)
    this.setData({ members })
  },

  submit() {
    wx.showLoading({ title: '创建中', mask: true })
    ledgerApi.createRoom(this.data.roomName, this.data.members).then((d) => {
      wx.hideLoading()
      ledgerApi.saveRecent(d.room)
      wx.redirectTo({ url: '/pages/ledger/room?roomId=' + d.room.roomId })
    }).catch((e) => {
      wx.hideLoading()
      wx.showModal({ title: '创建失败', content: e.message || String(e), showCancel: false })
    })
  }
})
