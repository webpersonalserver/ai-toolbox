// Feature switches the admin flips in 控制中心; they arrive with the session (account.login / game.overview).
// The defaults match the cloud's (cloudfunctions/api/lib/switches.js) and apply until a session is loaded.
const { getSession } = require('./session')

const DEFAULT_SWITCHES = { pinyinAid: false, sharing: true, praiseSpeech: false, typoMarkWrong: true }

const isSwitchOn = (key) => {
  const session = getSession()
  const switches = (session && session.switches) || {}
  return typeof switches[key] === 'boolean' ? switches[key] : DEFAULT_SWITCHES[key]
}

module.exports = { DEFAULT_SWITCHES, isSwitchOn }
