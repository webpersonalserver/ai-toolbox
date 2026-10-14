const { isSoundEnabled } = require('./records')
const SPEECH_CLIPS = require('./speech-clips')
const { speech } = require('../api')
const { isSwitchOn } = require('../switches')

// Off unless the admin turns 夸奖语音朗读 on in 控制中心: the clips start noticeably after the cheer animation and
// the built-in voice sounds robotic, so it waits for better audio (and the clips uploaded to cloud storage).
const SECOND_MS = 1000
// Links are fetched again a little before they expire, so a cheer never starts on a dead link.
const LINK_REFRESH_MARGIN_MS = 10 * 60 * SECOND_MS
// Emoji are not part of the recorded phrases, so they are dropped before looking a phrase up.
const UNSPEAKABLE = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE0F}\u{200D}]/gu

const toSpeakableText = (text) => (text || '').replace(UNSPEAKABLE, '').replace(/\s+/g, ' ').trim()

// Clips sit in cloud storage (scripts/make_speech.py); one request fetches playable links for all of them,
// shared by every page for the life of the app.
let clipLinks = { urls: {}, expiresAt: 0 }
let pendingLinks = null
const clipLinksReady = () => {
  if (clipLinks.expiresAt - LINK_REFRESH_MARGIN_MS > Date.now()) return Promise.resolve(clipLinks.urls)
  if (!pendingLinks) {
    pendingLinks = speech
      .clipUrls(Object.values(SPEECH_CLIPS))
      .then(({ urls, expiresInSeconds }) => {
        clipLinks = { urls, expiresAt: Date.now() + expiresInSeconds * SECOND_MS }
        return urls
      })
    // A failed request is forgotten so the next cheer tries again.
    pendingLinks.then(
      () => (pendingLinks = null),
      () => (pendingLinks = null)
    )
  }
  return pendingLinks
}

// Reads praise aloud, phrase by phrase; a newer request cuts off the previous one. Call destroy() when the owner goes away.
const createSpeaker = () => {
  let audio = null
  let queue = []
  let requestId = 0

  const playNext = () => {
    const src = queue.shift()
    if (!src) return
    audio.src = src
    audio.play()
  }

  return {
    speak(...texts) {
      requestId += 1
      if (audio) audio.stop()
      if (!isSwitchOn('praiseSpeech') || !isSoundEnabled()) return
      const clipNames = texts.map((text) => SPEECH_CLIPS[toSpeakableText(text)]).filter(Boolean)
      if (!clipNames.length) return
      const currentRequest = requestId
      clipLinksReady()
        .then((urls) => {
          // The first request takes a moment: skip if something newer was asked for meanwhile.
          if (currentRequest !== requestId) return
          const sources = clipNames.map((clipName) => urls[clipName]).filter(Boolean)
          if (sources.length < clipNames.length) console.warn('[speech] clips missing from storage', clipNames.filter((clipName) => !urls[clipName]))
          if (!audio) {
            audio = wx.createInnerAudioContext()
            audio.onEnded(playNext)
          }
          queue = sources
          playNext()
        })
        .catch((error) => console.warn('[speech] clip links unavailable', error))
    },
    destroy() {
      requestId += 1
      if (audio) audio.destroy()
      audio = null
    }
  }
}

module.exports = { createSpeaker, toSpeakableText }
