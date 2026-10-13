const BEST_STREAK_KEY = 'practice.arithmetic.bestStreak.v1'
const SOUND_ENABLED_KEY = 'practice.soundEnabled.v1'
const UNREPORTED_SOLVED_KEY = 'practice.arithmetic.unreportedSolved.v1'

// Records live on this device only; storage may be unavailable (privacy mode), so every access is guarded.
const readJson = (key, fallback) => {
  try {
    const value = wx.getStorageSync(key)
    return value === '' || value === undefined ? fallback : value
  } catch (error) {
    return fallback
  }
}

const writeJson = (key, value) => {
  try {
    wx.setStorageSync(key, value)
  } catch (error) {
    console.error('[practice] save failed', key, error)
  }
}

const bestStreakOf = (tier) => (readJson(BEST_STREAK_KEY, {})[tier] || 0)

const saveBestStreak = (tier, streak) => {
  const records = readJson(BEST_STREAK_KEY, {})
  if (streak <= (records[tier] || 0)) return
  writeJson(BEST_STREAK_KEY, { ...records, [tier]: streak })
}

const isSoundEnabled = () => readJson(SOUND_ENABLED_KEY, true) !== false

const setSoundEnabled = (enabled) => writeJson(SOUND_ENABLED_KEY, enabled)

// Answers the cloud has not counted yet (report failed or the page closed mid-request); sent with the next report.
const saveUnreportedSolved = (tier, count) => writeJson(UNREPORTED_SOLVED_KEY, { ...readJson(UNREPORTED_SOLVED_KEY, {}), [tier]: count })

const takeUnreportedSolved = (tier) => {
  const records = readJson(UNREPORTED_SOLVED_KEY, {})
  const count = records[tier] || 0
  if (count) writeJson(UNREPORTED_SOLVED_KEY, { ...records, [tier]: 0 })
  return count
}

module.exports = { readJson, writeJson, bestStreakOf, saveBestStreak, isSoundEnabled, setSoundEnabled, saveUnreportedSolved, takeUnreportedSolved }
