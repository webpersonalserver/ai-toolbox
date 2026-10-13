const { account, toastError } = require('../../utils/api')
const { getSession, updateSession } = require('../../utils/session')
const { isUploadedFile, uploadFile } = require('../../utils/upload')

const DEFAULT_AVATAR = '/assets/icons/default-avatar.png'
const NICKNAME_MAX_LENGTH = 20

const displayAvatarOf = (avatarUrl) => avatarUrl || DEFAULT_AVATAR

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: '编辑资料' },
    intro: { type: String, value: '' },
    cancelText: { type: String, value: '取消' },
    avatarUrl: { type: String, value: '' },
    nickname: { type: String, value: '' },
    allowUnchanged: { type: Boolean, value: false }
  },

  data: {
    nicknameMaxLength: NICKNAME_MAX_LENGTH,
    draftAvatarUrl: '',
    draftAvatarDisplay: DEFAULT_AVATAR,
    draftNickname: '',
    draftNicknameLength: 0,
    canSave: false,
    saving: false
  },

  observers: {
    visible(visible) {
      if (visible) this.updateDraft({ avatarUrl: this.data.avatarUrl, nickname: this.data.nickname })
    }
  },

  methods: {
    noop() {},

    updateDraft({ avatarUrl = this.data.draftAvatarUrl, nickname = this.data.draftNickname }) {
      const trimmedLength = nickname.trim().length
      const changed = avatarUrl !== this.data.avatarUrl || nickname.trim() !== this.data.nickname
      this.setData({
        draftAvatarUrl: avatarUrl,
        draftAvatarDisplay: displayAvatarOf(avatarUrl),
        draftNickname: nickname,
        draftNicknameLength: nickname.length,
        canSave: (changed || this.data.allowUnchanged) && trimmedLength > 0 && trimmedLength <= NICKNAME_MAX_LENGTH
      })
    },

    handleChooseAvatar(event) {
      this.updateDraft({ avatarUrl: event.detail.avatarUrl })
    },

    handleNicknameInput(event) {
      this.updateDraft({ nickname: event.detail.value })
    },

    handleNicknameReview(event) {
      if (event.detail.pass) return
      wx.showToast({ title: '昵称未通过微信安全检测，请换一个', icon: 'none' })
      this.updateDraft({ nickname: '' })
    },

    handleCancel() {
      if (this.data.saving) return
      this.triggerEvent('cancel')
    },

    async uploadAvatarIfLocal(avatarUrl) {
      if (!avatarUrl || isUploadedFile(avatarUrl)) return avatarUrl
      return uploadFile(avatarUrl, getSession().profile.avatarUploadDir)
    },

    async handleSave() {
      if (this.data.saving || !this.data.canSave) return
      this.setData({ saving: true })
      try {
        const avatarUrl = await this.uploadAvatarIfLocal(this.data.draftAvatarUrl)
        const profile = await account.updateProfile({ nickname: this.data.draftNickname.trim(), avatarUrl })
        updateSession({ profile })
        wx.showToast({ title: '已保存', icon: 'success' })
        this.triggerEvent('saved', profile)
      } catch (error) {
        toastError(error)
      } finally {
        this.setData({ saving: false })
      }
    }
  }
})
