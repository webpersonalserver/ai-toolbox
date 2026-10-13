const { account, game, practice, toastError } = require('../../utils/api')
const { setSession, updateSession, setItems } = require('../../utils/session')
const { describeRewards } = require('../../utils/items')
const { HIDDEN_REWARD_POPUP, openMilestoneChests } = require('../../utils/milestone')
const { countUnclaimedWelfare, buildChestRows, buildPracticeChestRows } = require('../../utils/welfare')

Page({
  data: {
    loading: true,
    busyKey: '',
    checkedIn: false,
    checkinRewardText: '',
    checkinRewards: [],
    items: null,
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
      const { session, games, practices } = await game.overview()
      setSession(session)
      this.setData({
        loading: false,
        checkedIn: session.today.checkedIn,
        checkinRewards: session.rules.checkinRewards,
        checkinRewardText: describeRewards(session.rules.checkinRewards),
        items: session.items,
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
      return { visible: true, title: '打卡成功', subtitle: '明天记得再来哦', badge: '', rewards: result.rewards }
    })
  },

  claimRecovery() {
    return this.runClaim('recovery', async () => {
      const result = await account.claimRecoveredStamina()
      setItems(result.items)
      return { visible: true, title: '体力恢复好啦', subtitle: '', badge: '', rewards: [{ type: 'stamina', amount: result.claimed }] }
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
        rewards: result.rewards
      }
    })
  },

  closeRewardPopup() {
    this.setData({ rewardPopup: HIDDEN_REWARD_POPUP })
    this.loadWelfare()
  }
})
