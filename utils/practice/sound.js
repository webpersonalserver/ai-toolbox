const { isSoundEnabled } = require('./records')

const SOUND_FILES = {
  correct: '/assets/sounds/correct.wav',
  milestone: '/assets/sounds/milestone.wav',
  wrong: '/assets/sounds/wrong.wav',
  gong: '/assets/sounds/gong.wav',
  chest: '/assets/sounds/chest.wav'
}

// One audio context per sound, created on first use; call destroy() when the page unloads.
const createSoundPlayer = () => {
  const sounds = {}
  return {
    play(name) {
      if (!isSoundEnabled()) return
      if (!sounds[name]) {
        sounds[name] = wx.createInnerAudioContext()
        sounds[name].src = SOUND_FILES[name]
      }
      sounds[name].stop()
      sounds[name].play()
    },
    destroy() {
      Object.values(sounds).forEach((sound) => sound.destroy())
    }
  }
}

module.exports = { createSoundPlayer }
