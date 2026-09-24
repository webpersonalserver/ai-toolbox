// pages/ledger/room.js — 房间：余额、记账、撤销、流水、结算
const ledgerApi = require('../../utils/ledger')
const settleUtils = require('../../utils/settle')

const MODES = [
  { id: 'single',  name: '单笔' },
  { id: 'zimo',    name: '自摸' },
  { id: 'dianpao', name: '点炮' },
  { id: 'split',   name: '一人收全场' }
]

const MODE_TIP = {
  single:  '选一个人，点「收」或「付」，填金额',
  zimo:    '选赢的人，填「每家付多少」，其余人自动扣',
  dianpao: '先点赢的人，再点放炮的人，填金额',
  split:   '选收钱的人，填总金额，其余人自动平摊'
}

function moneyText(v) {
  const n = Number(v) || 0
  if (n === 0) return '0'
  return n > 0 ? '+' + n : String(n)
}

Page({
  data: {
    roomId: '',
    room: null,
    modes: MODES,
    mode: 'single',
    modeTip: MODE_TIP.single,
    pickA: '',        // 单笔/自摸/收钱的人；点炮时为赢家
    pickB: '',        // 点炮：放炮的人
    direction: 1,     // 单笔：1 收 / -1 付
    amount: '',
    quick: [5, 10, 20, 50, 100],
    total: 0,
    records: [],
    showRecords: false,
    showSettle: false,
    plan: []
  },

  onLoad(query) {
    const roomId = query.roomId || ''
    const code = query.code || ''
    this.setData({ roomId })
    if (roomId) {
      this.load()
    } else if (code) {
      ledgerApi.joinRoom(code).then((room) => {
        this.setData({ roomId: room.roomId })
        ledgerApi.saveRecent(room)
        this.applyRoom(room)
        this.startWatch()
      }).catch((e) => {
        wx.showModal({ title: '进不去', content: e.message, showCancel: false })
      })
    } else {
      wx.showModal({ title: '缺少房间信息', content: '请从入口页进入房间', showCancel: false })
    }
  },

  onUnload() {
    if (this.watcher) {
      try { this.watcher.close() } catch (e) { /* ignore */ }
      this.watcher = null
    }
  },

  load() {
    ledgerApi.getRoom(this.data.roomId).then((room) => {
      this.applyRoom(room)
      this.startWatch()
    }).catch((e) => {
      wx.showModal({ title: '加载失败', content: e.message, showCancel: false })
    })
  },

  /** watch 会实时把房间推送过来；失败也不影响，手动记账后会再拉一次 */
  startWatch() {
    if (this.watcher) return
    this.watcher = ledgerApi.watchRoom(this.data.roomId, (snap) => {
      const doc = snap && snap.doc
      if (doc && doc._id) {
        const balances = doc.balances || {}
        const members = (doc.members || []).map((m) => ({
          id: m.id,
          name: m.name,
          balance: Number(balances[m.id] || 0)
        }))
        this.setData({ room: this.decorate({ members, status: doc.status }) })
      }
    })
  },

  decorate(partial) {
    const base = this.data.room || {}
    const room = Object.assign({}, base, partial)
    room.members = (room.members || []).map((m) => ({
      id: m.id,
      name: m.name,
      balance: Number(m.balance) || 0,
      balText: moneyText(m.balance),
      cls: m.balance > 0 ? 'pos' : (m.balance < 0 ? 'neg' : 'zero')
    }))
    room.total = settleUtils.sumBalance(room.members)
    return room
  },

  applyRoom(room) {
    this.setData({ room: this.decorate(room) })
  },

  // ---------- 模式与选人 ----------

  switchMode(e) {
    const mode = e.currentTarget.dataset.mode
    this.setData({ mode, modeTip: MODE_TIP[mode], pickA: '', pickB: '' })
  },

  pickMember(e) {
    const id = e.currentTarget.dataset.id
    const { mode, pickA, pickB } = this.data
    if (this.data.room && this.data.room.status === 'closed') {
      wx.showToast({ title: '已结算，请先重开房间', icon: 'none' })
      return
    }
    if (mode === 'dianpao') {
      // 两个人：先点赢家，再点放炮的人；再点已选中的可以取消
      const { pickA, pickB } = this.data
      if (pickA === id) { this.setData({ pickA: pickB, pickB: '' }); return }
      if (pickB === id) { this.setData({ pickB: '' }); return }
      if (!pickA) { this.setData({ pickA: id }); return }
      if (!pickB) { this.setData({ pickB: id }); return }
      this.setData({ pickA: id, pickB: '' })
      return
    }
    this.setData({ pickA: pickA === id ? '' : id, pickB: '' })
  },

  toggleDirection(e) {
    this.setData({ direction: Number(e.currentTarget.dataset.dir) })
  },

  setAmount(e) {
    this.setData({ amount: String(Number(e.currentTarget.dataset.v)) })
  },

  onAmountInput(e) {
    const v = e.detail.value.replace(/[^\d]/g, '').slice(0, 6)
    this.setData({ amount: v })
  },

  // ---------- 记账 ----------

  buildEntries() {
    const { room, mode, pickA, pickB, direction, amount } = this.data
    const ids = (room.members || []).map((m) => m.id)
    const n = Number(amount)
    if (!n || n <= 0) return null

    switch (mode) {
      case 'zimo':    return settleUtils.buildZimo(ids, pickA, n)
      case 'dianpao': return settleUtils.buildDianpao(pickA, pickB, n)
      case 'split':   return settleUtils.buildSplit(ids, pickA, n)
      default:        return settleUtils.buildSingle(pickA, n * direction)
    }
  },

  validate() {
    const { mode, pickA, pickB } = this.data
    if (!pickA) return '先选一个人'
    if (mode === 'dianpao' && !pickB) return '还要选一个放炮的人'
    if (!this.data.amount || Number(this.data.amount) <= 0) return '填个金额'
    return ''
  },

  confirm() {
    const err = this.validate()
    if (err) {
      wx.showToast({ title: err, icon: 'none' })
      return
    }
    const entries = this.buildEntries()
    if (!entries || !entries.length) {
      wx.showToast({ title: '金额不对', icon: 'none' })
      return
    }
    wx.showLoading({ title: '记账中', mask: true })
    ledgerApi.addEntries(this.data.roomId, entries, this.data.mode).then((room) => {
      wx.hideLoading()
      this.applyRoom(room)
      this.setData({ amount: '' })
      if (this.data.showRecords) this.loadRecords()
    }).catch((e) => {
      wx.hideLoading()
      wx.showModal({ title: '没记上', content: e.message, showCancel: false })
    })
  },

  undo() {
    wx.showModal({
      title: '撤销上一笔',
      content: '会把最后一次记账退回去',
      success: (r) => {
        if (!r.confirm) return
        wx.showLoading({ title: '撤销中', mask: true })
        ledgerApi.undo(this.data.roomId).then((room) => {
          wx.hideLoading()
          this.applyRoom(room)
          if (this.data.showRecords) this.loadRecords()
        }).catch((e) => {
          wx.hideLoading()
          wx.showToast({ title: e.message, icon: 'none' })
        })
      }
    })
  },

  // ---------- 成员维护 ----------

  renameMember(e) {
    const member = this.data.room.members.filter((m) => m.id === e.currentTarget.dataset.id)[0]
    if (!member) return
    wx.showModal({
      title: '改名字',
      editable: true,
      placeholderText: member.name,
      success: (r) => {
        if (!r.confirm || !r.content) return
        ledgerApi.renameMember(this.data.roomId, member.id, r.content).then((room) => {
          this.applyRoom(room)
        }).catch((err) => wx.showToast({ title: err.message, icon: 'none' }))
      }
    })
  },

  addMember() {
    wx.showModal({
      title: '加一个人',
      editable: true,
      placeholderText: '名字（可留空）',
      success: (r) => {
        if (!r.confirm) return
        ledgerApi.addMember(this.data.roomId, r.content).then((room) => {
          this.applyRoom(room)
        }).catch((err) => wx.showToast({ title: err.message, icon: 'none' }))
      }
    })
  },

  // ---------- 流水 ----------

  toggleRecords() {
    const next = !this.data.showRecords
    this.setData({ showRecords: next })
    if (next) this.loadRecords()
  },

  loadRecords() {
    ledgerApi.listRecords(this.data.roomId, 30).then((records) => {
      this.setData({
        records: records.map((r) => ({
          id: r.id,
          type: r.type,
          time: this.fmtTime(r.createdAt),
          undone: r.undone,
          items: (r.entries || []).map((e) => ({
            name: e.name,
            text: moneyText(r.undone ? 0 : e.delta)
          }))
        }))
      })
    }).catch(() => { /* 流水加载失败不影响主流程 */ })
  },

  fmtTime(ts) {
    const d = new Date(ts)
    const p = (x) => (x < 10 ? '0' + x : x)
    return p(d.getHours()) + ':' + p(d.getMinutes())
  },

  // ---------- 结算 ----------

  openSettle() {
    const members = this.data.room.members || []
    const plan = settleUtils.settlePlan(members)
    this.setData({ plan, showSettle: true })
    if (plan.length) this.loadRecords()
  },

  noop() {},

  closeSettle() {
    this.setData({ showSettle: false })
  },

  finishSettle() {
    wx.showModal({
      title: '完成结算',
      content: '钱都清完了？房间会标记为已结算',
      success: (r) => {
        if (!r.confirm) return
        ledgerApi.closeRoom(this.data.roomId).then((room) => {
          this.applyRoom(room)
          this.setData({ showSettle: false })
        }).catch((e) => wx.showToast({ title: e.message, icon: 'none' }))
      }
    })
  },

  reopen() {
    ledgerApi.reopenRoom(this.data.roomId).then((room) => {
      this.applyRoom(room)
      wx.showToast({ title: '房间已重开', icon: 'none' })
    }).catch((e) => wx.showToast({ title: e.message, icon: 'none' }))
  },

  // ---------- 分享 ----------

  copyCode() {
    wx.setClipboardData({ data: this.data.room.code })
  },

  onShareAppMessage() {
    const room = this.data.room || {}
    return {
      title: '「' + (room.name || '牌局') + '」房号 ' + room.code + '，进来一起记账',
      path: '/pages/ledger/room?roomId=' + this.data.roomId
    }
  }
})
