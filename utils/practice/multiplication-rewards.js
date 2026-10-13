const { practice } = require('../api')
const { readProgress, writeProgress } = require('./multiplication-records')

const PRACTICE_ID = 'multiplication'

// The cloud keeps the master copy and merges forward-only, so sending the local copy never loses anything.
// If the player made more progress while the request was in flight, the local copy is kept; the next sync merges it.
// Resolves null when offline so callers can ignore it.
// practiced: this sync follows real practice (counts towards today's flower and day streaks), not just opening a page.
const syncProgress = async ({ practiced = false } = {}) => {
  const sent = readProgress()
  try {
    const result = await practice.syncProgress(PRACTICE_ID, sent, practiced)
    if (JSON.stringify(readProgress()) === JSON.stringify(sent)) writeProgress(result.progress)
    return result
  } catch (error) {
    console.error('[multiplication] progress sync failed, retried on next visit', error)
    return null
  }
}

const describeNewChests = (result) =>
  result && result.newChests.length ? `🎁 得到 ${result.newChests.length} 个宝箱，去「我的 › 福利袋」打开` : ''

module.exports = { syncProgress, describeNewChests }
