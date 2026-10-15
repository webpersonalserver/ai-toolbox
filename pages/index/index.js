const { game, toastError } = require('../../utils/api')
const { getSession, setSession } = require('../../utils/session')
const { describeRewards } = require('../../utils/items')
const { DEFAULT_SHARE } = require('../../utils/share')
const { showRescueNotices } = require('../../utils/rescue-notice')
const { describeTitleProgress } = require('../../utils/milestone')
const { GAME_ORDER, gameConfigOf, playUrlOf } = require('../../utils/games')
const { GUIDE_KEYS, hasSeenGuide, markGuideSeen } = require('../../utils/onboarding')
const { countUnclaimedWelfare, buildTaskRows, countOpenTasks } = require('../../utils/welfare')
const { adOffersOf } = require('../../utils/ad-reward')
const { HIDDEN_REWARD_POPUP, CHEST_SOUND } = require('../../utils/milestone')
const { SUBJECTS, recommendationsOf, initialSubjectOf, cardsOfSubject } = require('../../utils/lobby')
const { sprintSubjectOf, sprintUrlOf } = require('../../utils/sprint')
const { openPage } = require('../../utils/navigation')

const WELFARE_URL = '/pages/welfare/welfare'
const DAILY_URL = '/pages/daily/daily'
// The tab the child picked last time (a per-phone convenience; the lobby works without it).
const SUBJECT_STORAGE_KEY = 'lobby.subject.v1'

const readSavedSubject = () => {
  try {
    return wx.getStorageSync(SUBJECT_STORAGE_KEY) || ''
  } catch (error) {
    return ''
  }
}

const saveSubject = (subjectId) => {
  try {
    wx.setStorageSync(SUBJECT_STORAGE_KEY, subjectId)
  } catch (error) {
    console.warn('[lobby] tab not remembered', error)
  }
}

const subjectTabs = (activeId) => SUBJECTS.map((subject) => ({ id: subject.id, name: subject.name, icon: subject.icon, active: subject.id === activeId }))

const describeDaily = (result) =>
  result ? `今天已完成：答对 ${result.correct} / ${result.total} 题，明天再来` : '10 道题，汉字和算术轮流来，完成就有奖励'

// Most recently played first; untouched games keep the default order. A brand-new player gets one clear starting point.
const describeWelfare = (session, unclaimed, openTasks) => {
  if (!session.today.checkedIn) return `今日打卡可领${describeRewards(session.rules.checkinRewards)}`
  if (unclaimed) return '还有福利没领，点开看看'
  return openTasks ? `还有 ${openTasks} 个任务能赚体力和提示` : '今天的福利都领完啦'
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
    items: { hint: 0, stamina: 0 },
    checkedIn: false,
    unclaimedWelfare: 0,
    welfareDesc: '',
    adOffers: [],
    rewardPopup: HIDDEN_REWARD_POPUP,
    gameCards: [],
    recommendations: [],
    subjectTabs: subjectTabs('chinese'),
    subjectId: 'chinese',
    subjectCards: [],
    showSprint: false,
    sprintCard: null,
    comingSoon: false,
    welcomeVisible: false,
    dailyDone: false,
    dailyDesc: describeDaily(null),
    profileAvatarUrl: '',
    profileNickname: ''
  },

  onShow() {
    this.refresh()
  },

  async refresh() {
    try {
      const { session, games, rescueNotices, practices, practiceEarnedToday } = await game.overview()
      setSession(session)
      this.syncSession()
      const summaryByGame = Object.fromEntries(games.map((summary) => [summary.gameType, summary]))
      this.setData({
        unclaimedWelfare: countUnclaimedWelfare(session, games, practices),
        dailyDone: Boolean(session.today.dailyChallenge),
        dailyDesc: describeDaily(session.today.dailyChallenge),
        welfareDesc: describeWelfare(
          session,
          countUnclaimedWelfare(session, games, practices),
          countOpenTasks(buildTaskRows({ session, games, practices, practiceEarnedToday }))
        ),
        gameCards: GAME_ORDER.filter((gameType) => summaryByGame[gameType]).map((gameType) => toGameCard(summaryByGame[gameType]))
      })
      this.setData({ recommendations: recommendationsOf(this.data.gameCards) })
      this.showSubject(this.subjectChosen ? this.data.subjectId : initialSubjectOf(this.data.gameCards, readSavedSubject()))
      showRescueNotices(rescueNotices.map((notice) => ({ ...notice, gameName: gameConfigOf(notice.gameType).name })))
      this.offerProfileWelcome(session.profile, this.data.gameCards)
    } catch (error) {
      toastError(error)
    }
  },

  syncSession() {
    const session = getSession()
    if (!session) return
    this.setData({
      adOffers: adOffersOf(session),
      items: session.items,
      checkedIn: session.today.checkedIn
    })
  },

  handleAdRewarded(event) {
    const { itemType, amount } = event.detail
    this.syncSession()
    this.setData({ rewardPopup: { visible: true, title: '看完啦，奖励送给你！', subtitle: '想要更多，随时再来看', badge: '', rewards: [{ type: itemType, amount }], doubleToken: '', sound: CHEST_SOUND } })
  },

  closeRewardPopup() {
    this.setData({ rewardPopup: HIDDEN_REWARD_POPUP })
    this.syncSession()
  },

  openWelfare() {
    openPage(WELFARE_URL)
  },

  openSprint() {
    openPage(sprintUrlOf(this.data.subjectId))
  },

  openDaily() {
    openPage(DAILY_URL)
  },

  // Asked after the first level is passed, not on the very first screen: a new child should start playing first.
  offerProfileWelcome(profile, gameCards) {
    if (profile.customized || hasSeenGuide(GUIDE_KEYS.PROFILE_WELCOME)) return
    if (!gameCards.some((card) => card.solvedCount > 0)) return
    this.setData({ welcomeVisible: true, profileAvatarUrl: profile.avatarUrl, profileNickname: profile.nickname })
  },

  handleWelcomeSaved() {
    markGuideSeen(GUIDE_KEYS.PROFILE_WELCOME)
    this.setData({ welcomeVisible: false })
  },

  handleWelcomeSkipped() {
    markGuideSeen(GUIDE_KEYS.PROFILE_WELCOME)
    this.setData({ welcomeVisible: false })
    wx.showToast({ title: `你叫「${this.data.profileNickname}」啦，随时可在「我的」里改`, icon: 'none', duration: 2500 })
  },

  showSubject(subjectId) {
    const subject = SUBJECTS.find((candidate) => candidate.id === subjectId)
    this.setData({
      subjectId,
      subjectTabs: subjectTabs(subjectId),
      subjectCards: cardsOfSubject(subjectId, this.data.gameCards),
      showSprint: Boolean(subject.hasSprint),
      sprintCard: subject.hasSprint ? sprintSubjectOf(subjectId) : null,
      comingSoon: Boolean(subject.comingSoon)
    })
  },

  chooseSubject(event) {
    const { id } = event.currentTarget.dataset
    this.subjectChosen = true
    saveSubject(id)
    this.showSubject(id)
  },

  openRecommendation(event) {
    const { gameType, levelNo } = event.currentTarget.dataset
    openPage(playUrlOf(gameType, levelNo))
  },

  continueGame(event) {
    const { gameType, levelNo } = event.currentTarget.dataset
    openPage(playUrlOf(gameType, levelNo))
  },

  openGame(event) {
    openPage(`/pages/game/levels/levels?gameType=${event.currentTarget.dataset.gameType}`)
  },

  onShareAppMessage() {
    return DEFAULT_SHARE
  }
})
