// Turns the catalog plus a player's stats into what the island map shows: stars per island, which islands are
// still in the fog, which unit is recommended next (and why), badges per unit, and the dotted route between islands.
const { islandsOf, unitOf } = require('./catalog')

const MAX_STARS = 3
const KUNGFU_ROWS = 9
const FULL_SCORE = 100
// Enough loose monsters that catching them beats anything else.
const MONSTERS_FIRST_AT = 5
// A mastered unit not practised for this many days is worth a visit.
const REVIEW_AFTER_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000
const CHINA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000

// Placeholder art until the illustrations arrive (packageMath/assets/islands/<id>.png); swapped per island.
const ISLAND_ART = {
  counting: { emoji: '🍭', props: ['🍬', '🍬'], tone: 'gold' },
  'make-ten': { emoji: '🏘️', props: ['🔟', '🫘'], tone: 'primary' },
  hundred: { emoji: '🎋', props: ['🐼', '🎍'], tone: 'success' },
  'times-table': { emoji: '⛰️', props: ['🥋', '📜'], tone: 'ink' },
  'ten-thousand': { emoji: '🏰', props: ['🎏', '☁️'], tone: 'primary' }
}

// 九九神功 keeps its own progress; on the map it earns stars like any unit.
const kungfuStarsOf = ({ masteredRows = 0, grandmaster = false } = {}) => {
  if (grandmaster) return MAX_STARS
  if (masteredRows >= KUNGFU_ROWS) return 2
  return masteredRows > 0 ? 1 : 0
}

const unitStarsOf = (unit, unitStats, kungfu) => {
  if (unit.id === 'multiplication') return kungfuStarsOf(kungfu)
  return Math.min((unitStats[unit.id] && unitStats[unit.id].bestStars) || 0, MAX_STARS)
}

const toUnitView = (unit, unitStats, kungfu) => {
  const stats = unitStats[unit.id] || {}
  const exams = stats.exams || []
  const bestExam = exams.filter((exam) => exam.best !== null && exam.best !== undefined).pop()
  const stars = unit.comingSoon ? 0 : unitStarsOf(unit, unitStats, kungfu)
  const mistakeCount = stats.mistakeCount || 0
  return {
    id: unit.id,
    name: unit.name,
    example: unit.example || '',
    comingSoon: Boolean(unit.comingSoon),
    hasOwnPages: Boolean(unit.entryUrl),
    stars,
    solved: stats.solved || 0,
    // 九九神功 counts as started once a row is mastered; it keeps no last-practised date here.
    started: unit.entryUrl ? (kungfu.masteredRows || 0) > 0 : (stats.solved || 0) > 0,
    lastPracticed: stats.lastPracticed || '',
    mistakeCount,
    bestExamText: bestExam ? `最高 ${bestExam.best} 分` : '',
    // Badges on the unit card: three stars, a full-score exam, and every caught monster gone from 收容所.
    badges: {
      stars: stars === MAX_STARS,
      fullScore: exams.some((exam) => exam.best === FULL_SCORE),
      cleared: (stats.caught || 0) > 0 && mistakeCount === 0
    }
  }
}

const dateOfKey = (dateKey) => Date.UTC(Number(dateKey.slice(0, 4)), Number(dateKey.slice(4, 6)) - 1, Number(dateKey.slice(6, 8)))
const todayKeyOf = (now) => new Date(now + CHINA_UTC_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, '')
const daysSince = (dateKey, now) => Math.round((dateOfKey(todayKeyOf(now)) - dateOfKey(dateKey)) / DAY_MS)

/**
 * Where the boat waits, first rule that matches wins:
 * 1. a unit with MONSTERS_FIRST_AT or more loose monsters (the most first) → catch them;
 * 2. the first unit (route order) started but not at three stars → go for three stars;
 * 3. the first unit not started → explore;
 * 4. everything at three stars: the unit left longest, if REVIEW_AFTER_DAYS or more → come back.
 */
const recommendationOf = (islands, now) => {
  const entries = islands.flatMap((island) => island.units.filter((unit) => !unit.comingSoon).map((unit) => ({ island, unit })))
  const monsters = entries.filter(({ unit }) => unit.mistakeCount >= MONSTERS_FIRST_AT).sort((a, b) => b.unit.mistakeCount - a.unit.mistakeCount)[0]
  if (monsters) return { ...monsters, reason: 'monsters' }
  const unfinished = entries.find(({ unit }) => unit.started && unit.stars < MAX_STARS)
  if (unfinished) return { ...unfinished, reason: 'improve' }
  const fresh = entries.find(({ unit }) => !unit.started && unit.stars < MAX_STARS)
  if (fresh) return { ...fresh, reason: 'explore' }
  const stale = entries
    .filter(({ unit }) => unit.lastPracticed && daysSince(unit.lastPracticed, now) >= REVIEW_AFTER_DAYS)
    .sort((a, b) => (a.unit.lastPracticed < b.unit.lastPracticed ? -1 : 1))[0]
  return stale ? { ...stale, reason: 'review' } : null
}

/**
 * unitStats: practice.stats(...).units (may be empty while loading or offline).
 * kungfu: { masteredRows, grandmaster } from the 九九神功 progress.
 */
const buildIslandMap = (subjectId, unitStats = {}, kungfu = {}, now = Date.now()) => {
  const islands = islandsOf(subjectId).map((island, index) => {
    const units = island.units.map((unitId) => toUnitView(unitOf(unitId), unitStats, kungfu))
    const playable = units.filter((unit) => !unit.comingSoon)
    const starsEarned = playable.reduce((total, unit) => total + unit.stars, 0)
    return {
      ...island,
      order: index + 1,
      art: ISLAND_ART[island.id],
      units,
      starsEarned,
      starsTotal: playable.length * MAX_STARS,
      foggy: playable.length === 0,
      flagged: playable.length > 0 && playable.every((unit) => unit.stars === MAX_STARS)
    }
  })
  const recommendation = recommendationOf(islands, now)
  const allMastered = islands.every((island) => island.units.every((unit) => unit.comingSoon || unit.stars === MAX_STARS))
  return {
    islands: islands.map((island) => ({ ...island, isNextStop: Boolean(recommendation) && island.id === recommendation.island.id })),
    recommendation: recommendation
      ? { islandId: recommendation.island.id, islandName: recommendation.island.name, unitId: recommendation.unit.id, unitName: recommendation.unit.name, reason: recommendation.reason, mistakeCount: recommendation.unit.mistakeCount }
      : null,
    nextStop: recommendation ? recommendation.island.name : '',
    allMastered
  }
}

// Dots along a gentle S-curve between islands (x in %, y in rpx). Each leg starts below one island's name card
// and ends above the next island, so the route never runs across a label.
const ROUTE_DOTS_PER_LEG = 9
const routeDots = (centres, { leaveBelow = 0, arriveAbove = 0 } = {}) =>
  centres.slice(1).flatMap((next, leg) => {
    const start = { x: centres[leg].x, y: centres[leg].y + leaveBelow }
    const end = { x: next.x, y: next.y - arriveAbove }
    const bend = (end.x - start.x) * 0.6
    return Array.from({ length: ROUTE_DOTS_PER_LEG }, (_, step) => {
      const t = (step + 1) / (ROUTE_DOTS_PER_LEG + 1)
      const controlX = (start.x + end.x) / 2 + bend
      const x = (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * controlX + t * t * end.x
      const y = start.y + (end.y - start.y) * t
      return { id: `${leg}-${step}`, style: `left: ${x.toFixed(1)}%; top: ${Math.round(y)}rpx` }
    })
  })

module.exports = { MAX_STARS, MONSTERS_FIRST_AT, REVIEW_AFTER_DAYS, buildIslandMap, kungfuStarsOf, routeDots }
