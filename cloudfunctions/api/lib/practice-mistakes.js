// 小怪兽收容所: every unit keeps the questions a child got wrong. A question leaves after it is answered right
// twice in a row in review; the oldest drop off when a unit holds more than MAX_MISTAKES_PER_UNIT.
const MAX_MISTAKES_PER_UNIT = 50
const CAUGHT_AFTER_CORRECT = 2
const MAX_EVENTS_PER_REPORT = 50
const MAX_DATA_LENGTH = 300
const KEY_PATTERN = /^[0-9a-zA-Z+\-*/:_.]{1,40}$/

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

// Client sends { key, data } for a new wrong answer (data rebuilds the question), { key, correct } for a review,
// and in discards the keys whose data no longer rebuilds a question (they could never be caught otherwise).
const isMistakeEntry = (entry) =>
  isPlainObject(entry) && KEY_PATTERN.test(entry.key) && isPlainObject(entry.data) && JSON.stringify(entry.data).length <= MAX_DATA_LENGTH
const isReviewEntry = (entry) => isPlainObject(entry) && KEY_PATTERN.test(entry.key) && typeof entry.correct === 'boolean'

const parseMistakeEvents = (payload) => {
  const added = payload.mistakes === undefined ? [] : payload.mistakes
  const reviews = payload.reviews === undefined ? [] : payload.reviews
  const discards = payload.discards === undefined ? [] : payload.discards
  const isValid =
    [added, reviews, discards].every((list) => Array.isArray(list) && list.length <= MAX_EVENTS_PER_REPORT) &&
    added.every(isMistakeEntry) &&
    reviews.every(isReviewEntry) &&
    discards.every((key) => typeof key === 'string' && KEY_PATTERN.test(key))
  if (!isValid) return null
  return { added: added.map(({ key, data }) => ({ key, data })), reviews: reviews.map(({ key, correct }) => ({ key, correct })), discards: [...discards] }
}

const applyMistakeEvents = (mistakes, { added, reviews, discards = [] }, now) => {
  const list = mistakes.filter((mistake) => !discards.includes(mistake.key)).map((mistake) => ({ ...mistake }))
  added.forEach(({ key, data }) => {
    const existing = list.find((mistake) => mistake.key === key)
    if (existing) {
      existing.correctStreak = 0
      existing.data = data
      return
    }
    list.push({ key, data, correctStreak: 0, addedAt: now })
  })
  reviews.forEach(({ key, correct }) => {
    const existing = list.find((mistake) => mistake.key === key)
    if (existing) existing.correctStreak = correct ? existing.correctStreak + 1 : 0
  })
  const caught = list.filter((mistake) => mistake.correctStreak >= CAUGHT_AFTER_CORRECT).map((mistake) => mistake.key)
  const remaining = list.filter((mistake) => mistake.correctStreak < CAUGHT_AFTER_CORRECT)
  return { mistakes: remaining.slice(-MAX_MISTAKES_PER_UNIT), caught }
}

module.exports = { MAX_MISTAKES_PER_UNIT, CAUGHT_AFTER_CORRECT, parseMistakeEvents, applyMistakeEvents }
