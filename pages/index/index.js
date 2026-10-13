const { game, toastError } = require('../../utils/api')
const { getSession, setSession } = require('../../utils/session')
const { checkinToday } = require('../../utils/checkin')
const { describeRewards } = require('../../utils/items')
const { DEFAULT_SHARE } = require('../../utils/share')
const { showRescueNotices } = require('../../utils/rescue-notice')
const { describeTitleProgress } = require('../../utils/milestone')
const { GAME_ORDER, gameConfigOf } = require('../../utils/games')
const { GUIDE_KEYS, hasSeenGuide, markGuideSeen } = require('../../utils/onboarding')

const toGameCard = (summary) => ({
  ...gameConfigOf(summary.gameType),
  solvedCount: summary.solvedCount,
  total: summary.total,
  currentLevel: summary.currentLevel,
  titleName: summary.achievement.title.name,
  titleProgressText: describeTitleProgress(summary.achievement),
  pendingChests: summary.achievement.milestone.pendingChests,
  allCleared: summary.allCleared
})

Page({
  data: {
    loading: true,
    items: { hint: 0, stamina: 0 },
    checkedIn: false,
    checkinRewardText: '',
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
      const { session, games, rescueNotices } = await game.overview()
      setSession(session)
      this.syncSession()
      const summaryByGame = Object.fromEntries(games.map((summary) => [summary.gameType, summary]))
      this.setData({
        loading: false,
        gameCards: GAME_ORDER.filter((gameType) => summaryByGame[gameType]).map((gameType) => toGameCard(summaryByGame[gameType]))
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
      items: session.items,
      checkedIn: session.today.checkedIn,
      checkinRewardText: describeRewards(session.rules.checkinRewards)
    })
  },

  async handleCheckin() {
    if (await checkinToday()) this.syncSession()
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
