const { createSpeaker } = require('../../utils/practice/speech')

const CONFETTI_COUNT = { normal: 28, big: 64 }
const SPARK_COUNT = { normal: 14, big: 22 }
const SUN_RAYS = Array.from({ length: 12 }, (_, index) => ({ id: index, style: `transform: rotate(${index * 30}deg)` }))
const CELEBRATION_COLORS = ['var(--color-primary)', 'var(--color-gold)', 'var(--color-success)', 'var(--color-primary-deep)', 'var(--color-success-deep)']

const pick = (list) => list[Math.floor(Math.random() * list.length)]
const randomBetween = (min, max) => min + Math.random() * (max - min)

const buildConfetti = (count) =>
  Array.from({ length: count }, (_, index) => ({
    id: index,
    style: [
      `left: ${randomBetween(0, 100).toFixed(1)}%`,
      `background: ${pick(CELEBRATION_COLORS)}`,
      `border-radius: ${Math.random() < 0.4 ? '50%' : '6rpx'}`,
      `animation-delay: ${randomBetween(0, 0.4).toFixed(2)}s`,
      `animation-duration: ${randomBetween(1.1, 1.9).toFixed(2)}s`
    ].join('; ')
  }))

const buildSparks = (count) =>
  Array.from({ length: count }, (_, index) => ({
    id: index,
    style: `transform: rotate(${((360 / count) * index + randomBetween(-10, 10)).toFixed(0)}deg)`,
    innerStyle: `background: ${pick(CELEBRATION_COLORS)}; animation-duration: ${randomBetween(0.6, 1).toFixed(2)}s`
  }))

// Full-screen burst shown over practice screens; it never blocks taps. The praise text is also read aloud.
Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: '' },
    subtitle: { type: String, value: '' },
    mascot: { type: String, value: '' },
    big: { type: Boolean, value: false },
    flyingStar: { type: Boolean, value: true }
  },

  data: {
    sunRays: SUN_RAYS,
    confettiPieces: [],
    sparks: []
  },

  observers: {
    visible(visible) {
      if (!visible) return
      const size = this.data.big ? 'big' : 'normal'
      this.setData({ confettiPieces: buildConfetti(CONFETTI_COUNT[size]), sparks: buildSparks(SPARK_COUNT[size]) })
      this.speaker.speak(this.data.title, this.data.subtitle)
    }
  },

  lifetimes: {
    attached() {
      this.speaker = createSpeaker()
    },
    detached() {
      this.speaker.destroy()
    }
  }
})
