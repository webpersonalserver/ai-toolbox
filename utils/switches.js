// Feature switches the admin flips in 控制中心; they arrive with the session (account.login / game.overview).
// The defaults match the cloud's (cloudfunctions/api/lib/switches.js) and apply until a session is loaded.
const { getSession } = require('./session')

const DEFAULT_SWITCHES = { pinyinAid: false, sharing: true, praiseSpeech: false, typoMarkWrong: true, hintKeepLastStep: false, sprintWeeklyReset: true, sprintStaminaCost: 5 }

const switchValue = (key) => {
  const session = getSession()
  const switches = (session && session.switches) || {}
  return typeof switches[key] === typeof DEFAULT_SWITCHES[key] ? switches[key] : DEFAULT_SWITCHES[key]
}

const isSwitchOn = (key) => switchValue(key) === true

module.exports = { DEFAULT_SWITCHES, isSwitchOn, switchValue }
