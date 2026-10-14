const { ITEM_META } = require('../../utils/items')
const { watchAdForDouble } = require('../../utils/ad-reward')
const { createSoundPlayer } = require('../../utils/practice/sound')

const DOUBLED_MULTIPLIER = 2

const RAY_COUNT = 12
const ITEM_ICONS = {
  stamina: '/assets/icons/stamina.png',
  hint: '/assets/icons/hint.png'
}

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: '宝箱打开啦' },
    subtitle: { type: String, value: '' },
    badge: { type: String, value: '' },
    rewards: { type: Array, value: [] },
    confirmText: { type: String, value: '收下' },
    doubleToken: { type: String, value: '' },
    // A sound from utils/practice/sound.js played as the popup appears ('chest' when chests are opened); '' is silent.
    sound: { type: String, value: '' }
  },

  data: {
    rays: Array.from({ length: RAY_COUNT }, (_, index) => index),
    rewardCards: [],
    doubling: false,
    doubled: false
  },

  observers: {
    'visible, doubleToken'(visible) {
      if (visible) this.setData({ doubled: false, doubling: false })
    },
    visible(visible) {
      if (visible && this.data.sound) this.soundPlayer.play(this.data.sound)
    },
    rewards(rewards) {
      this.setData({
        rewardCards: rewards.map((reward) => ({
          ...reward,
          icon: ITEM_ICONS[reward.type],
          label: (ITEM_META[reward.type] || {}).label || ''
        }))
      })
    }
  },

  lifetimes: {
    attached() {
      this.soundPlayer = createSoundPlayer()
    },
    detached() {
      this.soundPlayer.destroy()
    }
  },

  methods: {
    noop() {},

    async handleDouble() {
      if (this.data.doubling || this.data.doubled) return
      this.setData({ doubling: true })
      const result = await watchAdForDouble(this.data.doubleToken)
      if (!result) {
        this.setData({ doubling: false })
        return
      }
      this.setData({
        doubling: false,
        doubled: true,
        rewardCards: this.data.rewardCards.map((card) => ({ ...card, amount: card.amount * DOUBLED_MULTIPLIER }))
      })
      this.triggerEvent('doubled', result)
    },

    handleConfirm() {
      this.triggerEvent('close')
    }
  }
})
