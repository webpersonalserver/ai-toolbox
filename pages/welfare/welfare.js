const { account, game, toastError } = require('../../utils/api')
const { setSession, updateSession } = require('../../utils/session')
const { HIDDEN_REWARD_POPUP, CHEST_SOUND, CHEST_ROOM_URL } = require('../../utils/milestone')
const { TASK_ACTIONS, countPendingChests, countUnclaimedWelfare, buildTaskRows, countOpenTasks } = require('../../utils/welfare')
const { watchAdForItem } = require('../../utils/ad-reward')
const { openPage } = require('../../utils/navigation')

const PRACTICE_TAB_URL = '/pages/practice/index'
const DAILY_URL = '/pages/daily/daily'
const LOBBY_TAB_URL = '/pages/index/index'
const KUNGFU_URL = '/pages/practice/multiplication/index'

Page({
  data: {
    loading: true,
    // Set when the overview could not be fetched, so the page never claims "all done" without knowing.
    loadFailed: false,
    busyKey: '',
    taskRows: [],
    openTaskCount: 0,
    pendingChestCount: 0,
    unclaimedCount: 0,
    rewardPopup: HIDDEN_REWARD_POPUP
  },

  onShow() {
    this.loadWelfare()
  },

  async loadWelfare() {
    try {
      const { session, games, practices, practiceEarnedToday } = await game.overview()
      setSession(session)
      const taskRows = buildTaskRows({ session, games, practices, practiceEarnedToday })
      this.setData({
        loading: false,
        loadFailed: false,
        taskRows,
        openTaskCount: countOpenTasks(taskRows),
        pendingChestCount: countPendingChests(games, practices),
        unclaimedCount: countUnclaimedWelfare(session, games, practices)
      })
    } catch (error) {
      console.error('[welfare] load failed', error)
      this.setData({ loading: false, loadFailed: true })
    }
  },

  // The skeleton shows again while retrying so the tap visibly does something.
  retryLoad() {
    this.setData({ loading: true })
    this.loadWelfare()
  },

  async runClaim(busyKey, claim) {
    if (this.data.busyKey) return
    this.setData({ busyKey })
    try {
      const popup = await claim()
      if (popup) this.setData({ rewardPopup: popup })
    } catch (error) {
      toastError(error)
    } finally {
      this.setData({ busyKey: '' })
    }
  },

  claimCheckin() {
    return this.runClaim('checkin', async () => {
      const result = await account.checkin()
      updateSession({ items: result.items, today: { checkedIn: true } })
      return { visible: true, title: '打卡成功，真棒！', subtitle: '明天记得再来哦', badge: '', rewards: result.rewards, doubleToken: result.doubleToken || '', sound: CHEST_SOUND }
    })
  },

  // Chests are opened in 我的宝箱, where each one shows what it is and can be opened alone or with the rest.
  openChestRoom() {
    openPage(CHEST_ROOM_URL)
  },

  handleTask(event) {
    const { key, done } = event.currentTarget.dataset
    if (done) return
    const handlers = {
      [TASK_ACTIONS.CHECKIN]: () => this.claimCheckin(),
      [TASK_ACTIONS.AD_STAMINA]: () => this.watchAd('stamina'),
      [TASK_ACTIONS.AD_HINT]: () => this.watchAd('hint'),
      [TASK_ACTIONS.DAILY]: () => openPage(DAILY_URL),
      [TASK_ACTIONS.PRACTICE]: () => wx.switchTab({ url: PRACTICE_TAB_URL }),
      [TASK_ACTIONS.KUNGFU]: () => openPage(KUNGFU_URL),
      [TASK_ACTIONS.LEVELS]: () => wx.switchTab({ url: LOBBY_TAB_URL })
    }
    handlers[key]()
  },

  watchAd(itemType) {
    return this.runClaim(`ad-${itemType}`, async () => {
      const result = await watchAdForItem(itemType)
      if (!result) return null
      return { visible: true, title: '看完啦，奖励送给你！', subtitle: '', badge: '', rewards: [{ type: itemType, amount: result.rewardAmount }], doubleToken: '', sound: CHEST_SOUND }
    })
  },

  closeRewardPopup() {
    this.setData({ rewardPopup: HIDDEN_REWARD_POPUP })
    this.loadWelfare()
  }
})
