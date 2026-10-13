const { game, toastError } = require('../../utils/api')
const { getSession, setSession } = require('../../utils/session')
const { buildRuleSections } = require('../../utils/rule-text')
const { DEFAULT_SHARE } = require('../../utils/share')
const { describeTitleProgress } = require('../../utils/milestone')
const { GAME_ORDER, gameConfigOf } = require('../../utils/games')
const { countUnclaimedWelfare } = require('../../utils/welfare')


const DEFAULT_AVATAR = '/assets/icons/default-avatar.png'
const EMPTY_NICKNAME_TEXT = '点击设置昵称'

const displayAvatarOf = (avatarUrl) => avatarUrl || DEFAULT_AVATAR

Page({
  data: {
    nickname: '',
    avatarUrl: '',
    items: { hint: 0, stamina: 0 },
    rulesVisible: false,
    ruleSections: [],
    gameTitles: [],
    unclaimedWelfare: 0,
    titlesExpanded: false,
    isAdmin: false,
    openid: '',

    avatarDisplay: DEFAULT_AVATAR,
    nicknameDisplay: EMPTY_NICKNAME_TEXT,
    editorVisible: false
  },

  async onShow() {
    try {
      const { session, games, practices } = await game.overview()
      setSession(session)
      this.syncSession()
      const summaryByGame = Object.fromEntries(games.map((summary) => [summary.gameType, summary]))
      this.setData({
        unclaimedWelfare: countUnclaimedWelfare(session, games, practices),
        gameTitles: GAME_ORDER.filter((gameType) => summaryByGame[gameType]).map((gameType) => ({
          ...gameConfigOf(gameType),
          titleName: summaryByGame[gameType].achievement.title.name,
          titleProgressText: describeTitleProgress(summaryByGame[gameType].achievement),
          solvedCount: summaryByGame[gameType].solvedCount
        }))
      })
    } catch (error) {
      toastError(error)
    }
  },

  syncSession() {
    const { profile, items, rules, isAdmin, openid } = getSession()
    this.setData({
      isAdmin,
      openid,
      nickname: profile.nickname,
      avatarUrl: profile.avatarUrl,
      nicknameDisplay: profile.nickname || EMPTY_NICKNAME_TEXT,
      avatarDisplay: displayAvatarOf(profile.avatarUrl),
      items,
      ruleSections: buildRuleSections(rules)
    })
  },

  openProfileEditor() {
    this.setData({ editorVisible: true })
  },

  closeProfileEditor() {
    this.setData({ editorVisible: false })
  },

  handleProfileSaved(event) {
    const profile = event.detail
    this.setData({
      avatarUrl: profile.avatarUrl,
      nickname: profile.nickname,
      avatarDisplay: displayAvatarOf(profile.avatarUrl),
      nicknameDisplay: profile.nickname || EMPTY_NICKNAME_TEXT,
      editorVisible: false
    })
  },

  openAdminStats() {
    wx.navigateTo({ url: '/pages/admin/stats' })
  },

  // Shown only to admins; anyone can still long-press their name to copy it (needed to be added to admin.openids).
  copyOpenid() {
    wx.setClipboardData({ data: this.data.openid })
  },

  openWelfare() {
    wx.navigateTo({ url: '/pages/welfare/welfare' })
  },

  openRules() {
    this.setData({ rulesVisible: true })
  },

  closeRules() {
    this.setData({ rulesVisible: false })
  },

  toggleTitles() {
    this.setData({ titlesExpanded: !this.data.titlesExpanded })
  },

  openBook(event) {
    wx.navigateTo({ url: `/pages/game/book/book?gameType=${event.currentTarget.dataset.gameType}` })
  },

  onShareAppMessage() {
    const best = [...this.data.gameTitles].sort((left, right) => right.solvedCount - left.solvedCount)[0]
    if (!best || !best.solvedCount) return DEFAULT_SHARE
    return {
      ...DEFAULT_SHARE,
      title: `我在${best.name}闯过了 ${best.solvedCount} 关，晋升「${best.titleName}」，你能到第几关？`
    }
  }
})
