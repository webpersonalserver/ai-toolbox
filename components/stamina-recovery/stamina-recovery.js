const { account, toastError } = require('../../utils/api')
const { getSession, setItems } = require('../../utils/session')

const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS

const pad = (value) => String(value).padStart(2, '0')

const formatCountdown = (remainingMs) => {
  const totalSeconds = Math.max(Math.ceil(remainingMs / SECOND_MS), 0)
  return `${pad(Math.floor(totalSeconds / 60))}:${pad(totalSeconds % 60)}`
}

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    items: { type: Object, value: null },
    showClaim: { type: Boolean, value: true }
  },

  data: {
    pending: 0,
    countdownText: '',
    isFull: false,
    claiming: false
  },

  observers: {
    items(items) {
      if (!items) return
      this.projection = { held: items.stamina, pending: items.staminaPending || 0, nextAt: items.nextStaminaAt, cap: items.staminaCap }
      this.refresh()
    }
  },

  lifetimes: {
    attached() {
      this.startTicking()
    },
    detached() {
      this.stopTicking()
    }
  },

  pageLifetimes: {
    show() {
      this.startTicking()
    },
    hide() {
      this.stopTicking()
    }
  },

  methods: {
    startTicking() {
      this.stopTicking()
      this.timer = setInterval(() => this.refresh(), SECOND_MS)
    },

    stopTicking() {
      clearInterval(this.timer)
      this.timer = null
    },

    intervalMs() {
      const session = getSession()
      return session ? session.rules.staminaRecovery.intervalMinutes * MINUTE_MS : 0
    },

    // The server only adds points when asked; between calls we project them locally so the countdown keeps moving.
    refresh() {
      const projection = this.projection
      if (!projection) return
      const intervalMs = this.intervalMs()
      while (projection.nextAt && intervalMs && projection.nextAt <= Date.now()) {
        projection.pending += 1
        projection.nextAt = projection.held + projection.pending >= projection.cap ? null : projection.nextAt + intervalMs
      }
      this.setData({
        pending: projection.pending,
        isFull: !projection.nextAt,
        countdownText: projection.nextAt ? formatCountdown(projection.nextAt - Date.now()) : ''
      })
    },

    async handleClaim() {
      if (this.data.claiming || !this.data.pending) return
      this.setData({ claiming: true })
      try {
        const result = await account.claimRecoveredStamina()
        setItems(result.items)
        wx.showToast({ title: `领取了 ${result.claimed} 点体力`, icon: 'none' })
        this.triggerEvent('claimed', result.items)
      } catch (error) {
        toastError(error)
      } finally {
        this.setData({ claiming: false })
      }
    }
  }
})
