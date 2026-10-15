const { getSession } = require('../../utils/session')

const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS

const pad = (value) => String(value).padStart(2, '0')

const formatCountdown = (remainingMs) => {
  const totalSeconds = Math.max(Math.ceil(remainingMs / SECOND_MS), 0)
  return `${pad(Math.floor(totalSeconds / 60))}:${pad(totalSeconds % 60)}`
}

// When the next free stamina point arrives. Recovered points go straight into stamina (the cloud settles them on
// every call), so there is nothing to claim; between calls the countdown is projected here so it keeps moving.
Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    items: { type: Object, value: null }
  },

  data: {
    countdownText: '',
    isFull: false
  },

  observers: {
    items(items) {
      if (!items) return
      this.projection = { nextAt: items.nextStaminaAt, leftToday: items.recoveryLeftToday || 0 }
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

    refresh() {
      const projection = this.projection
      if (!projection) return
      const intervalMs = this.intervalMs()
      while (projection.nextAt && intervalMs && projection.nextAt <= Date.now()) {
        projection.leftToday -= 1
        projection.nextAt = projection.leftToday > 0 ? projection.nextAt + intervalMs : null
      }
      this.setData({
        isFull: !projection.nextAt,
        countdownText: projection.nextAt ? formatCountdown(projection.nextAt - Date.now()) : ''
      })
    }
  }
})
