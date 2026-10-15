const { db, readDocOrNull } = require('./cloud')
const { ALL_ITEM_TYPES } = require('./items')
const { practiceStatsDocId } = require('./practice-rewards')

// 数理乐园 keeps one record per player: <openid>_math. It replaced the old 加减运算 record <openid>_arithmetic,
// which is converted the first time it is needed and then left untouched (kept as a fallback, never written again).
const MATH_SUBJECT = 'math'
const LEGACY_ARITHMETIC = 'arithmetic'

// Units the cloud accepts and the island each sits on. Must match utils/practice/catalog.js (tests/math-park.test.js
// checks). 口诀岛 also holds 九九神功, which keeps its own record (see lib/honors.js).
const MATH_UNITS = {
  'split-10': { island: 'counting' },
  'add-sub-10': { island: 'counting', legacyTier: 10 },
  'add-sub-20': { island: 'make-ten', legacyTier: 20 },
  'chain-add-sub': { island: 'make-ten' },
  compare: { island: 'make-ten' },
  'add-sub-100': { island: 'hundred', legacyTier: 100 },
  'division-table': { island: 'times-table' },
  'add-sub-10000': { island: 'ten-thousand' }
}
const MATH_UNIT_IDS = Object.keys(MATH_UNITS)
// Daily tallies kept for the weekly report: this week and last week.
const KEPT_DAYS = 14

const isMathUnit = (unitId) => MATH_UNIT_IDS.includes(unitId)
const unitIdOfLegacyTier = (tier) => MATH_UNIT_IDS.find((unitId) => MATH_UNITS[unitId].legacyTier === tier) || null
const legacyTierKeyOf = (tier) => `within${tier}`

const emptyItemCounts = () => Object.fromEntries(ALL_ITEM_TYPES.map((type) => [type, 0]))
// caught: monsters caught back in total; lastPracticed: Beijing date key of the last answered question.
const emptyUnit = () => ({ solved: 0, bestStreak: 0, bestStars: 0, exams: {}, mistakes: [], caught: 0, lastPracticed: '' })
const emptyDay = () => ({ solved: 0, caught: 0, stars: 0 })

// Adds today's numbers to the daily tallies and forgets days older than KEPT_DAYS.
const addToDays = (days, dateKey, { solved, caught, stars }) => {
  const today = { ...emptyDay(), ...(days[dateKey] || {}) }
  const next = { ...days, [dateKey]: { solved: today.solved + solved, caught: today.caught + caught, stars: today.stars + stars } }
  return Object.fromEntries(Object.keys(next).sort().slice(-KEPT_DAYS).map((key) => [key, next[key]]))
}

const emptyMathStats = (openid) => ({
  openid,
  practiceId: MATH_SUBJECT,
  units: {},
  days: {},
  totalSolved: 0,
  streakRun: null,
  pendingChestCount: 0,
  pendingRewards: emptyItemCounts(),
  pendingChestList: [],
  recentReportIds: []
})

// Old record → new record, field by field. Chests, today's progress and the report ids carry over unchanged.
const mathStatsFromLegacy = (openid, legacy) => {
  const units = {}
  MATH_UNIT_IDS.filter((unitId) => MATH_UNITS[unitId].legacyTier).forEach((unitId) => {
    const key = legacyTierKeyOf(MATH_UNITS[unitId].legacyTier)
    const tier = (legacy.tiers || {})[key]
    const exams = (legacy.exams || {})[key]
    if (!tier && !exams) return
    units[unitId] = { solved: (tier && tier.solved) || 0, bestStreak: (tier && tier.bestStreak) || 0, exams: exams || {}, mistakes: [] }
  })
  return {
    ...emptyMathStats(openid),
    units,
    totalSolved: legacy.totalSolved || 0,
    streakRun: legacy.streakRun || null,
    pendingChestCount: legacy.pendingChestCount || 0,
    pendingRewards: { ...emptyItemCounts(), ...(legacy.pendingRewards || {}) },
    recentReportIds: legacy.recentReportIds || [],
    migratedFrom: LEGACY_ARITHMETIC
  }
}

const readDoc = (docId) => readDocOrNull('practice_stats', docId)

// The player's 数理乐园 record: the stored one, or the old record converted on the fly when not migrated yet.
const readMathStats = async (openid) => {
  const stored = await readDoc(practiceStatsDocId(openid, MATH_SUBJECT))
  if (stored) return { ...emptyMathStats(openid), ...stored }
  const legacy = await readDoc(practiceStatsDocId(openid, LEGACY_ARITHMETIC))
  return legacy ? mathStatsFromLegacy(openid, legacy) : null
}

// Creates the record once, converted from the old one when there is one. Safe when two requests race.
const ensureMathStats = async (openid) => {
  if (await readDoc(practiceStatsDocId(openid, MATH_SUBJECT))) return
  const legacy = await readDoc(practiceStatsDocId(openid, LEGACY_ARITHMETIC))
  const data = legacy ? mathStatsFromLegacy(openid, legacy) : emptyMathStats(openid)
  try {
    await db.collection('practice_stats').add({ data: { _id: practiceStatsDocId(openid, MATH_SUBJECT), ...data, createdAt: db.serverDate() } })
  } catch (duplicateError) {
    return
  }
}

module.exports = {
  MATH_SUBJECT,
  LEGACY_ARITHMETIC,
  MATH_UNITS,
  MATH_UNIT_IDS,
  KEPT_DAYS,
  addToDays,
  isMathUnit,
  unitIdOfLegacyTier,
  legacyTierKeyOf,
  emptyUnit,
  emptyMathStats,
  mathStatsFromLegacy,
  readMathStats,
  ensureMathStats
}
