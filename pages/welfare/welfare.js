const { account, game, practice, toastError } = require('../../utils/api')
const { setSession, updateSession, setItems } = require('../../utils/session')
const { HIDDEN_REWARD_POPUP, openMilestoneChests } = require('../../utils/milestone')
const { TASK_ACTIONS, countUnclaimedWelfare, buildChestRows, buildPracticeChestRows, buildTaskRows, countOpenTasks } = require('../../utils/welfare')
const { watchAdForItem } = require('../../utils/ad-reward')

const PRACTICE_TAB_URL = '/pages/practice/index'
const LOBBY_TAB_URL = '/pages/index/index'
const KUNGFU_URL = '/pages/practice/multiplication/index'

Page({
  data: {
    loading: true,
    busyKey: '',
    taskRows: [],
    openTaskCount: 0,
    chestRows: [],
    practiceChestRows: [],
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
        taskRows,
        openTaskCount: countOpenTasks(taskRows),
        chestRows: buildChestRows(games),
        practiceChestRows: buildPracticeChestRows(practices),
        unclaimedCount: countUnclaimedWelfare(session, games, practices)
      })
    } catch (error) {
      this.setData({ loading: false })
      toastError(error)
    }
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
      return { visible: true, title: '打卡成功', subtitle: '明天记得再来哦', badge: '', rewards: result.rewards, doubleToken: result.doubleToken || '' }
    })
  },

  claimRecovery() {
    return this.runClaim('recovery', async () => {
      const result = await account.claimRecoveredStamina()
      setItems(result.items)
      return { visible: true, title: '体力恢复好啦', subtitle: '', badge: '', rewards: [{ type: 'stamina', amount: result.claimed }], doubleToken: result.doubleToken || '' }
    })
  },

  openChests(event) {
    const { gameType } = event.currentTarget.dataset
    return this.runClaim(`chest-${gameType}`, () => openMilestoneChests(gameType))
  },

  openPracticeChests(event) {
    const { practiceId } = event.currentTarget.dataset
    return this.runClaim(`practice-${practiceId}`, async () => {
      const result = await practice.claimChests(practiceId)
      setItems(result.items)
      return {
        visible: true,
        title: result.chestCount > 1 ? `打开了 ${result.chestCount} 个练习宝箱` : '练习宝箱打开啦',
        subtitle: '认真练习的奖励，拿去闯关吧',
        badge: '',
        rewards: result.rewards,
        doubleToken: result.doubleToken || ''
      }
    })
  },

  handleTask(event) {
    const { key, done } = event.currentTarget.dataset
    if (done) return
    const handlers = {
      [TASK_ACTIONS.CHECKIN]: () => this.claimCheckin(),
      [TASK_ACTIONS.RECOVERY]: () => this.claimRecovery(),
      [TASK_ACTIONS.AD_STAMINA]: () => this.watchAd('stamina'),
      [TASK_ACTIONS.AD_HINT]: () => this.watchAd('hint'),
      [TASK_ACTIONS.PRACTICE]: () => wx.switchTab({ url: PRACTICE_TAB_URL }),
      [TASK_ACTIONS.KUNGFU]: () => wx.navigateTo({ url: KUNGFU_URL }),
      [TASK_ACTIONS.LEVELS]: () => wx.switchTab({ url: LOBBY_TAB_URL })
    }
    handlers[key]()
  },

  watchAd(itemType) {
    return this.runClaim(`ad-${itemType}`, async () => {
      const result = await watchAdForItem(itemType)
      if (!result) return null
      return { visible: true, title: '视频奖励到账', subtitle: '', badge: '', rewards: [{ type: itemType, amount: result.rewardAmount }], doubleToken: '' }
    })
  },

  closeRewardPopup() {
    this.setData({ rewardPopup: HIDDEN_REWARD_POPUP })
    this.loadWelfare()
  }
})
