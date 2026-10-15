const { db, _ } = require('./cloud')
const { todayInChina } = require('./date')

// Counters for the admin's 数据统计, bumped as play happens. They are a side effect: a failure is logged and never
// passed on, so the player's own action always stands.
// - level_stats, one per level (`<gameType>_<levelNo>`): starts (a paid start), fails (an attempt lost), passes, hints.
//   This is where children get stuck.
// - stats_events, one per Beijing day (`<YYYYMMDD>`): hintShortage / staminaShortage (stopped for lack of an item),
//   dailyDone (每日挑战 finished).
const LEVEL_STATS = 'level_stats'
const DAILY_EVENTS = 'stats_events'

const incrementsOf = (counts) => Object.fromEntries(Object.entries(counts).map(([field, amount]) => [field, _.inc(amount)]))

// Update when the record exists, create it otherwise (if two arrive at once, the loser of the create updates).
const bump = async (collection, id, fields, counts) => {
  try {
    const { stats } = await db.collection(collection).where({ _id: id }).update({ data: incrementsOf(counts) })
    if (stats.updated) return
    try {
      await db.collection(collection).add({ data: { _id: id, ...fields, ...counts } })
    } catch (duplicateError) {
      await db.collection(collection).where({ _id: id }).update({ data: incrementsOf(counts) })
    }
  } catch (error) {
    console.error('[play-stats] counter not saved', collection, id, counts, error)
  }
}

const bumpLevelStats = (gameType, levelNo, counts) => bump(LEVEL_STATS, `${gameType}_${levelNo}`, { gameType, levelNo }, counts)

const bumpDailyEvents = (counts) => {
  const date = todayInChina()
  return bump(DAILY_EVENTS, date, { date }, counts)
}

module.exports = { LEVEL_STATS, DAILY_EVENTS, bumpLevelStats, bumpDailyEvents }
