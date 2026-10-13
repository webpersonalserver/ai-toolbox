const BEST_STREAK_KEY = 'practice.arithmetic.bestStreak.v1'
const SOUND_ENABLED_KEY = 'practice.soundEnabled.v1'
const UNREPORTED_SOLVED_KEY = 'practice.arithmetic.unreportedSolved.v1'
const UNSENT_REPORTS_KEY = 'practice.arithmetic.unsentReports.v1'
const LEGACY_RUN_ID = 'legacy'

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

// Reports the cloud has not confirmed yet (request failed or the page closed mid-request). They are resent unchanged,
// with the same reportId, so the cloud can tell a resend from a new report and never counts answers twice.
const saveUnsentReports = (tier, reports) => writeJson(UNSENT_REPORTS_KEY, { ...readJson(UNSENT_REPORTS_KEY, {}), [tier]: reports })

const takeUnsentReports = (tier, newReportId) => {
  const stored = readJson(UNSENT_REPORTS_KEY, {})
  const reports = Array.isArray(stored[tier]) ? stored[tier] : []
  if (reports.length) writeJson(UNSENT_REPORTS_KEY, { ...stored, [tier]: [] })
  // Older versions kept only a count; turn it into one report so those answers are not lost.
  const legacy = readJson(UNREPORTED_SOLVED_KEY, {})
  if (legacy[tier]) {
    writeJson(UNREPORTED_SOLVED_KEY, { ...legacy, [tier]: 0 })
    reports.push({ practiceId: 'arithmetic', tier: Number(tier), solvedDelta: legacy[tier], streak: 0, streakRunId: LEGACY_RUN_ID, reportId: newReportId() })
  }
  return reports
}

module.exports = { readJson, writeJson, bestStreakOf, saveBestStreak, isSoundEnabled, setSoundEnabled, saveUnsentReports, takeUnsentReports }
