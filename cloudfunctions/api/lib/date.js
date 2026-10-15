const CHINA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000

const chinaDateKey = (timestamp) =>
  new Date(timestamp + CHINA_UTC_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, '')

const todayInChina = () => chinaDateKey(Date.now())

const DAY_MS = 24 * 60 * 60 * 1000

// The same moment on this week's Monday (weeks run Monday … Sunday, Beijing time).
const mondayOf = (timestamp) => timestamp - ((new Date(timestamp + CHINA_UTC_OFFSET_MS).getUTCDay() + 6) % 7) * DAY_MS

const weekKeyOf = (timestamp) => `week${chinaDateKey(mondayOf(timestamp))}`

module.exports = { DAY_MS, chinaDateKey, todayInChina, mondayOf, weekKeyOf }
