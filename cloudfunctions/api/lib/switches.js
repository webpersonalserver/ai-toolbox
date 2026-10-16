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
  typoMarkWrong: true,
  // 提示不能直接给出答案: on, hints stop before the last character / the last two choices. Off (default): hints are
  // the player's own items, so they may reveal the whole answer (the level is then handed in for them).
  hintKeepLastStep: false,
  // 猜谜语：用键盘输入. On: no board of characters to pick from; the player types the answer with the phone's
  // keyboard into the same number of cells (the board is then not sent at all). Off (default): pick from the board.
  miyuKeyboard: false,
  // 口算竞速: rankings start again every Monday (Beijing). Off: one ranking for all time.
  sprintWeeklyReset: true,
  // 口算竞速: stamina one run costs. A number, not a switch (see NUMBER_RANGES).
  sprintStaminaCost: 5
}
const SWITCH_KEYS = Object.keys(DEFAULT_SWITCHES)
// Settings that are numbers, with the range the admin may set them to in 控制中心.
const NUMBER_RANGES = { sprintStaminaCost: { min: 0, max: 30 } }

const isValidValue = (key, value) => {
  if (typeof DEFAULT_SWITCHES[key] === 'boolean') return typeof value === 'boolean'
  const range = NUMBER_RANGES[key]
  return Number.isInteger(value) && value >= range.min && value <= range.max
}

const loadSwitches = async () => {
  try {
    const { data } = await db.collection('app_config').doc(SWITCHES_DOC_ID).get()
    return Object.fromEntries(SWITCH_KEYS.map((key) => [key, isValidValue(key, data[key]) ? data[key] : DEFAULT_SWITCHES[key]]))
  } catch (error) {
    return { ...DEFAULT_SWITCHES }
  }
}

// patch: { key: value } for known keys only (true / false, or a whole number in range); null when anything else is in it.
const parseSwitchPatch = (patch) => {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return null
  const entries = Object.entries(patch)
  const isValid = entries.length > 0 && entries.every(([key, value]) => SWITCH_KEYS.includes(key) && isValidValue(key, value))
  return isValid ? Object.fromEntries(entries) : null
}

const saveSwitches = async (patch) => {
  const next = { ...(await loadSwitches()), ...patch }
  await db.collection('app_config').doc(SWITCHES_DOC_ID).set({ data: { ...next, updatedAt: db.serverDate() } })
  return next
}

module.exports = { DEFAULT_SWITCHES, NUMBER_RANGES, loadSwitches, parseSwitchPatch, saveSwitches }
