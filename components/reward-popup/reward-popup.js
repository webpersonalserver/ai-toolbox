const { ITEM_META } = require('../../utils/items')

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
    confirmText: { type: String, value: '收下' }
  },

  data: {
    rays: Array.from({ length: RAY_COUNT }, (_, index) => index),
    rewardCards: []
  },

  observers: {
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

  methods: {
    noop() {},

    handleConfirm() {
      this.triggerEvent('close')
    }
  }
})
