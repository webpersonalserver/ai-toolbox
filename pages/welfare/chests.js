const { chests, toastError } = require('../../utils/api')
const { setItems } = require('../../utils/session')
const { HIDDEN_REWARD_POPUP, CHEST_SOUND } = require('../../utils/milestone')
const { groupChestCards, openedPopupOf } = require('../../utils/chests')

const OPEN_ALL_ID = 'all'
const LOBBY_TAB_URL = '/pages/index/index'
const PRACTICE_TAB_URL = '/pages/practice/index'

// 我的宝箱: every unopened chest with what it is and what is inside; open one by tapping it, or all at once.
Page({
  data: {
    loading: true,
    // Set when the list could not be fetched, so an empty list is never shown as "all opened".
    loadFailed: false,
    busyId: '',
    groups: [],
    chestCount: 0,
    rewardPopup: HIDDEN_REWARD_POPUP
  },

  onShow() {
    this.loadChests()
  },

  async loadChests() {
    try {
      const result = await chests.list()
      this.setData({
        loading: false,
        loadFailed: false,
        groups: groupChestCards(result.chests),
        chestCount: result.chests.reduce((total, chest) => total + (chest.count || 1), 0)
      })
    } catch (error) {
      console.error('[chests] load failed', error)
      this.setData({ loading: false, loadFailed: true })
    }
  },

  // The skeleton shows again while retrying so the tap visibly does something.
  retryLoad() {
    this.setData({ loading: true })
    this.loadChests()
  },

  goLevels() {
    wx.switchTab({ url: LOBBY_TAB_URL })
  },

  goPractice() {
    wx.switchTab({ url: PRACTICE_TAB_URL })
  },

  async runOpen(busyId, open) {
    if (this.data.busyId) return
    this.setData({ busyId })
    try {
      const result = await open()
      setItems(result.items)
      this.setData({ rewardPopup: openedPopupOf(result, CHEST_SOUND) })
    } catch (error) {
      toastError(error)
      this.loadChests()
    } finally {
      this.setData({ busyId: '' })
    }
  },

  openOne(event) {
    const { chestId } = event.currentTarget.dataset
    return this.runOpen(chestId, () => chests.open([chestId]))
  },

  openAll() {
    return this.runOpen(OPEN_ALL_ID, () => chests.openAll())
  },

  closeRewardPopup() {
    this.setData({ rewardPopup: HIDDEN_REWARD_POPUP })
    this.loadChests()
  }
})
