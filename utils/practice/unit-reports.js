const { readJson, writeJson } = require('./records')

// Reports the cloud has not confirmed yet, per 数理乐园 unit. They are resent unchanged (same reportId),
// so the cloud never counts answers twice. Reports and counts left by the old 加减运算 pages are picked up too.
const UNSENT_KEY = 'practice.math.unsentReports.v1'
const LEGACY_UNSENT_KEY = 'practice.arithmetic.unsentReports.v1'
const LEGACY_COUNT_KEY = 'practice.arithmetic.unreportedSolved.v1'
const LEGACY_RUN_ID = 'legacy'

const saveUnitReports = (unitId, reports) => writeJson(UNSENT_KEY, { ...readJson(UNSENT_KEY, {}), [unitId]: reports })

const takeList = (key, field) => {
  const stored = readJson(key, {})
  const value = stored[field]
  if (value) writeJson(key, { ...stored, [field]: Array.isArray(value) ? [] : 0 })
  return value
}

/**
 * Everything still waiting for this unit. legacyTier: the old tier the unit replaced (10 / 20 / 100), if any.
 * Old reports keep their own ids (and say practiceId 'arithmetic' + tier, which the cloud still understands).
 */
const takeUnitReports = (unitId, legacyTier, newReportId) => {
  const reports = [...(takeList(UNSENT_KEY, unitId) || [])]
  if (!legacyTier) return reports
  const legacyReports = takeList(LEGACY_UNSENT_KEY, legacyTier)
  if (Array.isArray(legacyReports)) reports.unshift(...legacyReports)
  const legacyCount = takeList(LEGACY_COUNT_KEY, legacyTier)
  if (legacyCount) {
    reports.unshift({ practiceId: 'math', unitId, solvedDelta: legacyCount, streak: 0, streakRunId: LEGACY_RUN_ID, reportId: newReportId() })
  }
  return reports
}

module.exports = { saveUnitReports, takeUnitReports }
