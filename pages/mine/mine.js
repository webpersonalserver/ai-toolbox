const { game, toastError } = require('../../utils/api')
const { getSession, setSession } = require('../../utils/session')
const { buildRuleSections } = require('../../utils/rule-text')
const { DEFAULT_SHARE, buildRankShare } = require('../../utils/share')
const { describeTitleProgress } = require('../../utils/milestone')
const { GAME_ORDER, gameConfigOf } = require('../../utils/games')
const { countUnclaimedWelfare } = require('../../utils/welfare')
const { isSwitchOn } = require('../../utils/switches')
const { openPage } = require('../../utils/navigation')


const DEFAULT_AVATAR = '/assets/icons/default-avatar.png'
const EMPTY_NICKNAME_TEXT = '点击设置昵称'

const displayAvatarOf = (avatarUrl) => avatarUrl || DEFAULT_AVATAR

const isReleaseBuild = () => {
  try {
    return wx.getAccountInfoSync().miniProgram.envVersion === 'release'
  } catch (error) {
    return true
  }
}

Page({
  data: {
    sharing: true,
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
    this.setData({ sharing: isSwitchOn('sharing') })
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

  // Switching tabs keeps this page alive, so overlays would still be open when the player comes back.
  onHide() {
    this.setData({ editorVisible: false, rulesVisible: false })
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
    openPage('/pages/admin/stats')
  },

  openAdminControl() {
    openPage('/pages/admin/control')
  },

  // Players (children) must not stumble into copying an id they cannot understand, so the long-press only works for
  // admins, or in the 开发版/体验版 where the owner copies their own id before adding it to admin.openids.
  copyOpenid() {
    if (!this.data.isAdmin && isReleaseBuild()) return
    wx.setClipboardData({ data: this.data.openid })
  },

  openWelfare() {
    openPage('/pages/welfare/welfare')
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
    openPage(`/pages/game/book/book?gameType=${event.currentTarget.dataset.gameType}`)
  },

  onShareAppMessage() {
    const best = [...this.data.gameTitles].sort((left, right) => right.solvedCount - left.solvedCount)[0]
    if (!best || !best.solvedCount) return DEFAULT_SHARE
    return buildRankShare(`我在${best.name}闯过了 ${best.solvedCount} 关，晋升「${best.titleName}」，你能到第几关？`)
  }
})
