const { account, game, toastError } = require('../../utils/api')
const { ensureLogin, getSession, updateSession } = require('../../utils/session')
const { checkinToday } = require('../../utils/checkin')
const { describeStaminaRecovery } = require('../../utils/items')
const { buildRuleLines } = require('../../utils/rule-text')
const { DEFAULT_SHARE } = require('../../utils/share')
const { describeTitleProgress } = require('../../utils/milestone')
const { GAME_ORDER, gameConfigOf } = require('../../utils/games')


Page({
  data: {
    nickname: '',
    avatarUrl: '',
    items: { hint: 0, stamina: 0 },
    staminaRecoveryText: '',
    checkedIn: false,
    ruleLines: [],
    gameTitles: [],
    isAdmin: false,
    openid: '',

    profileDirty: false,
    saving: false
  },

  async onShow() {
    try {
      const [, ...summaries] = await Promise.all([
        ensureLogin({ force: true }),
        ...GAME_ORDER.map((gameType) => game.summary(gameType))
      ])
      this.syncSession()
      this.setData({
        gameTitles: GAME_ORDER.map((gameType, index) => ({
          ...gameConfigOf(gameType),
          titleName: summaries[index].achievement.title.name,
          titleProgressText: describeTitleProgress(summaries[index].achievement),
          solvedCount: summaries[index].achievement.solvedCount
        }))
      })
    } catch (error) {
      toastError(error)
    }
  },

  syncSession() {
    const { profile, items, today, rules, isAdmin, openid } = getSession()
    this.setData({
      isAdmin,
      openid,
      nickname: profile.nickname,
      avatarUrl: profile.avatarUrl,
      items,
      staminaRecoveryText: describeStaminaRecovery(items),
      checkedIn: today.checkedIn,
      ruleLines: buildRuleLines(rules),
      profileDirty: false
    })
  },

  handleChooseAvatar(event) {
    this.setData({ avatarUrl: event.detail.avatarUrl, profileDirty: true })
  },

  handleNicknameInput(event) {
    this.setData({ nickname: event.detail.value, profileDirty: true })
  },

  async uploadAvatarIfLocal(avatarUrl) {
    const isCloudFile = avatarUrl.startsWith('cloud://')
    if (!avatarUrl || isCloudFile) return avatarUrl
    const extension = avatarUrl.split('.').pop() || 'png'
    const { avatarUploadDir } = getSession().profile
    const cloudPath = `${avatarUploadDir}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`
    const { fileID } = await wx.cloud.uploadFile({ cloudPath, filePath: avatarUrl })
    return fileID
  },

  async saveProfile() {
    if (this.data.saving) return
    this.setData({ saving: true })
    try {
      const avatarUrl = await this.uploadAvatarIfLocal(this.data.avatarUrl)
      const profile = await account.updateProfile({ nickname: this.data.nickname, avatarUrl })
      updateSession({ profile })
      this.setData({ avatarUrl: profile.avatarUrl, nickname: profile.nickname, profileDirty: false })
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (error) {
      toastError(error)
    } finally {
      this.setData({ saving: false })
    }
  },

  async handleCheckin() {
    if (await checkinToday()) this.syncSession()
  },

  openAdminStats() {
    wx.navigateTo({ url: '/pages/admin/stats' })
  },

  copyOpenid() {
    wx.setClipboardData({ data: this.data.openid })
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
