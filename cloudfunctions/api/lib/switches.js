const { db } = require('./cloud')

// Feature switches the admin flips in 控制中心 (pages/admin/control). Kept in their own app_config document, so
// re-importing app_config.json (game_rules) never resets them. Read on every request: a flip applies at once.
const SWITCHES_DOC_ID = 'switches'
const DEFAULT_SWITCHES = {
  // 拼音辅助: pinyin over the answer cells of 猜成语 / 诗词填空 / 歇后语. Off by default: it makes levels much easier.
  pinyinAid: false,
  // 好友求助和分享按钮. Sharing needs 微信认证, so it can be hidden until the account is verified.
  sharing: true,
  // 夸奖语音朗读 on the practice pages; the clips must be uploaded to cloud storage first (scripts/make_speech.py).
  praiseSpeech: false,
  // 成语找错字: the wrong character is marked red. Off: children have to spot it themselves (harder).
  typoMarkWrong: true
}
const SWITCH_KEYS = Object.keys(DEFAULT_SWITCHES)

const loadSwitches = async () => {
  try {
    const { data } = await db.collection('app_config').doc(SWITCHES_DOC_ID).get()
    return Object.fromEntries(SWITCH_KEYS.map((key) => [key, typeof data[key] === 'boolean' ? data[key] : DEFAULT_SWITCHES[key]]))
  } catch (error) {
    return { ...DEFAULT_SWITCHES }
  }
}

// patch: { key: boolean } for known keys only; returns null when anything else is in it.
const parseSwitchPatch = (patch) => {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return null
  const entries = Object.entries(patch)
  const isValid = entries.length > 0 && entries.every(([key, value]) => SWITCH_KEYS.includes(key) && typeof value === 'boolean')
  return isValid ? Object.fromEntries(entries) : null
}

const saveSwitches = async (patch) => {
  const next = { ...(await loadSwitches()), ...patch }
  await db.collection('app_config').doc(SWITCHES_DOC_ID).set({ data: { ...next, updatedAt: db.serverDate() } })
  return next
}

module.exports = { DEFAULT_SWITCHES, loadSwitches, parseSwitchPatch, saveSwitches }
