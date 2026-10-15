// A small seeded generator (mulberry32): the same text always gives the same numbers, so the cloud can rebuild a
// level or a paper later to check answers. utils/daily.js carries the same function for the phone.
const seededRandom = (seedText) => {
  let state = [...seedText].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 2654435761) >>> 0, 2166136261)
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

module.exports = { seededRandom }
