const { game, toastError } = require('../../utils/api')
const { getSession, setSession } = require('../../utils/session')
const { checkinToday } = require('../../utils/checkin')
const { describeRewards } = require('../../utils/items')
const { DEFAULT_SHARE } = require('../../utils/share')
const { showRescueNotices } = require('../../utils/rescue-notice')
const { describeTitleProgress } = require('../../utils/milestone')
const { GAME_ORDER, gameConfigOf } = require('../../utils/games')
const { GUIDE_KEYS, hasSeenGuide, markGuideSeen } = require('../../utils/onboarding')
const { countUnclaimedWelfare } = require('../../utils/welfare')
const { adOffersOf } = require('../../utils/ad-reward')
const { HIDDEN_REWARD_POPUP } = require('../../utils/milestone')

const BEGINNER_GAME_TYPE = 'idiom'
const WELFARE_URL = '/pages/welfare/welfare'
const PRACTICE_TAB_URL = '/pages/practice/index'

// Most recently played first; untouched games keep the default order. A brand-new player gets one clear starting point.
const describeWelfare = (session, unclaimed) => {
  if (!session.today.checkedIn) return `今日打卡可领${describeRewards(session.rules.checkinRewards)}`
  return unclaimed ? '还有福利没领，点开看看' : '今天的福利都领完啦'
}

const orderGameCards = (cards) => {
  const isNewPlayer = cards.every((card) => !card.solvedCount)
  const ordered = [...cards].sort((left, right) => right.lastSolvedAt - left.lastSolvedAt)
  return ordered.map((card) => ({ ...card, recommended: isNewPlayer && card.gameType === BEGINNER_GAME_TYPE }))
}

const toGameCard = (summary) => ({
  ...gameConfigOf(summary.gameType),
  solvedCount: summary.solvedCount,
  total: summary.total,
  currentLevel: summary.currentLevel,
  titleName: summary.achievement.title.name,
  titleProgressText: describeTitleProgress(summary.achievement),
  pendingChests: summary.achievement.milestone.pendingChests,
  allCleared: summary.allCleared,
  lastSolvedAt: summary.lastSolvedAt || 0
})

Page({
  data: {
    loading: true,
    items: { hint: 0, stamina: 0 },
    checkedIn: false,
    checkinRewardText: '',
    unclaimedWelfare: 0,
    welfareDesc: '',
    adOffers: [],
    rewardPopup: HIDDEN_REWARD_POPUP,
    gameCards: GAME_ORDER.map((gameType) => gameConfigOf(gameType)),
    welcomeVisible: false,
    profileAvatarUrl: '',
    profileNickname: ''
  },

  onShow() {
    this.refresh()
  },

  async refresh() {
    try {
      const { session, games, rescueNotices, practices } = await game.overview()
      setSession(session)
      this.syncSession()
      const summaryByGame = Object.fromEntries(games.map((summary) => [summary.gameType, summary]))
      this.setData({
        loading: false,
        unclaimedWelfare: countUnclaimedWelfare(session, games, practices),
        welfareDesc: describeWelfare(session, countUnclaimedWelfare(session, games, practices)),
        gameCards: orderGameCards(GAME_ORDER.filter((gameType) => summaryByGame[gameType]).map((gameType) => toGameCard(summaryByGame[gameType])))
      })
      showRescueNotices(rescueNotices.map((notice) => ({ ...notice, gameName: gameConfigOf(notice.gameType).name })))
      this.offerProfileWelcome(session.profile)
    } catch (error) {
      this.setData({ loading: false })
      toastError(error)
    }
  },

  syncSession() {
    const session = getSession()
    if (!session) return
    this.setData({
      adOffers: adOffersOf(session),
      items: session.items,
      checkedIn: session.today.checkedIn,
      checkinRewardText: describeRewards(session.rules.checkinRewards)
    })
  },

  async handleCheckin() {
    const result = await checkinToday({ quiet: true })
    if (!result) return
    this.refresh()
    this.setData({
      rewardPopup: { visible: true, title: '打卡成功', subtitle: '明天记得再来哦', badge: '', rewards: result.rewards, doubleToken: result.doubleToken || '' }
    })
  },

  handleAdRewarded(event) {
    const { itemType, amount } = event.detail
    this.syncSession()
    this.setData({ rewardPopup: { visible: true, title: '视频奖励到账', subtitle: '想要更多，随时再来看', badge: '', rewards: [{ type: itemType, amount }], doubleToken: '' } })
  },

  closeRewardPopup() {
    this.setData({ rewardPopup: HIDDEN_REWARD_POPUP })
    this.syncSession()
  },

  openWelfare() {
    wx.navigateTo({ url: WELFARE_URL })
  },

  openPracticeTab() {
    wx.switchTab({ url: PRACTICE_TAB_URL })
  },

  offerProfileWelcome(profile) {
    if (profile.customized || hasSeenGuide(GUIDE_KEYS.PROFILE_WELCOME)) return
    this.setData({ welcomeVisible: true, profileAvatarUrl: profile.avatarUrl, profileNickname: profile.nickname })
  },

  handleWelcomeSaved() {
    markGuideSeen(GUIDE_KEYS.PROFILE_WELCOME)
    this.setData({ welcomeVisible: false })
  },

  handleWelcomeSkipped() {
    markGuideSeen(GUIDE_KEYS.PROFILE_WELCOME)
    this.setData({ welcomeVisible: false })
    wx.showToast({ title: `已为你取名「${this.data.profileNickname}」，可在「我的」页修改`, icon: 'none', duration: 2500 })
  },

  continueGame(event) {
    const { gameType, levelNo } = event.currentTarget.dataset
    wx.navigateTo({ url: `/pages/game/play/play?gameType=${gameType}&levelNo=${levelNo}&autoStart=1` })
  },

  openGame(event) {
    wx.navigateTo({ url: `/pages/game/levels/levels?gameType=${event.currentTarget.dataset.gameType}` })
  },

  onShareAppMessage() {
    return DEFAULT_SHARE
  }
})
