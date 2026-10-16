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

// image: the island picture on the map (cut out by scripts/prepare_art.py); emoji: a small mark beside the name.
const ISLAND_IMAGE_BASE = '/packageMath/assets/islands/'
const ISLAND_EMOJI = {
  counting: '🍭',
  'make-ten': '🏘️',
  hundred: '🎋',
  'times-table': '⛰️',
  'ten-thousand': '🏰'
}
const ISLAND_ART = Object.fromEntries(
  Object.entries(ISLAND_EMOJI).map(([id, emoji]) => [id, { emoji, image: `${ISLAND_IMAGE_BASE}${id}.png` }])
)

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
    bestStreakText: stats.bestStreak ? `最多连对 ${stats.bestStreak} 题` : '',
    bestExamText: bestExam ? `挑战最高 ${bestExam.best} 分` : '',
    // Badges on the unit card: three stars, a full-score exam, and every caught monster gone from 小怪兽藏身洞.
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

// Dots along an S-curve between islands (x in %, y in rpx). Each leg starts below one island's name card and ends above
// the next island, so the route never runs across a label. Dots sit at equal distances along the curve (not at equal
// steps of the curve parameter, which bunches them where the curve turns), and carry a delay so a light runs down the
// route from the first dot to the last, then starts again.
const MAP_WIDTH_RPX = 750
const ROUTE_DOT_SPACING_RPX = 36
const CURVE_SAMPLES = 120
const ROUTE_LIGHT_STEP_SECONDS = 0.12

// Cubic Bézier that leaves start straight down and arrives at end straight down: a smooth S between two islands.
const sCurvePoint = (start, end, t) => {
  const middleY = (start.y + end.y) / 2
  const along = (a, b, c, d) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d
  return { x: along(start.x, start.x, end.x, end.x), y: along(start.y, middleY, middleY, end.y) }
}

const evenlySpacedPoints = (start, end) => {
  const samples = Array.from({ length: CURVE_SAMPLES + 1 }, (_, index) => sCurvePoint(start, end, index / CURVE_SAMPLES))
  const toRpx = (point) => ({ x: (point.x / 100) * MAP_WIDTH_RPX, y: point.y })
  const points = []
  let travelled = 0
  let nextAt = ROUTE_DOT_SPACING_RPX / 2
  samples.slice(1).forEach((point, index) => {
    const from = toRpx(samples[index])
    const to = toRpx(point)
    const segment = Math.hypot(to.x - from.x, to.y - from.y)
    while (segment > 0 && nextAt <= travelled + segment) {
      const ratio = (nextAt - travelled) / segment
      points.push({ x: samples[index].x + (point.x - samples[index].x) * ratio, y: from.y + (to.y - from.y) * ratio })
      nextAt += ROUTE_DOT_SPACING_RPX
    }
    travelled += segment
  })
  return points
}

const routeDots = (centres, { leaveBelow = 0, arriveAbove = 0 } = {}) => {
  const points = centres.slice(1).flatMap((next, leg) =>
    evenlySpacedPoints({ x: centres[leg].x, y: centres[leg].y + leaveBelow }, { x: next.x, y: next.y - arriveAbove }).map((point, step) => ({
      ...point,
      id: `${leg}-${step}`
    }))
  )
  const loopSeconds = (points.length * ROUTE_LIGHT_STEP_SECONDS).toFixed(2)
  return points.map(({ id, x, y }, index) => ({
    id,
    style: `left: ${x.toFixed(1)}%; top: ${Math.round(y)}rpx; animation-delay: ${(index * ROUTE_LIGHT_STEP_SECONDS).toFixed(2)}s; animation-duration: ${loopSeconds}s`
  }))
}

module.exports = { MAX_STARS, MONSTERS_FIRST_AT, REVIEW_AFTER_DAYS, buildIslandMap, kungfuStarsOf, routeDots }
