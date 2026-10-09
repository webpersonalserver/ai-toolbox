const CHINA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000

const chinaDateKey = (timestamp) =>
  new Date(timestamp + CHINA_UTC_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, '')

const todayInChina = () => chinaDateKey(Date.now())

module.exports = { chinaDateKey, todayInChina }
