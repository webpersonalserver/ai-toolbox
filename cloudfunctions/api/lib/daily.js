const { db } = require('./cloud')
const { todayInChina } = require('./date')
const { ALL_ITEM_TYPES } = require('./items')

const dailyDocId = (openid, dateKey = todayInChina()) => `${openid}_${dateKey}`

const getTodayRecord = async (openid, dateKey = todayInChina()) => {
  try {
    const { data } = await db.collection('daily').doc(dailyDocId(openid, dateKey)).get()
    return data
  } catch (error) {
    return null
  }
}

// Resolves the date key it made sure of; read that same key in the transaction, so a request crossing midnight
// does not ensure one day's record and then look for the next day's.
const ensureTodayRecord = async (openid, dateKey = todayInChina()) => {
  if (await getTodayRecord(openid, dateKey)) return dateKey
  try {
    await db.collection('daily').add({
      data: {
        _id: dailyDocId(openid, dateKey),
        openid,
        date: dateKey,
        checkedIn: false,
        checkinRewards: [],
        adRewardCounts: {}
      }
    })
  } catch (duplicateError) {
    return dateKey
  }
  return dateKey
}

const adRewardCountOf = (todayRecord, itemType) =>
  (todayRecord && todayRecord.adRewardCounts && todayRecord.adRewardCounts[itemType]) || 0

const UNLIMITED = null

// Remaining rewarded videos today; null when the config sets no daily limit.
const adRemainingOf = (todayRecord, itemType, rules) => {
  if (!rules.ad.enabled || !rules.ad.rewards[itemType]) return 0
  const limit = rules.ad.dailyLimits[itemType]
  if (limit === UNLIMITED) return UNLIMITED
  return Math.max((limit || 0) - adRewardCountOf(todayRecord, itemType), 0)
}

const describeTodayStatus = (todayRecord, rules) => {
  const adRemaining = {}
  ALL_ITEM_TYPES.forEach((itemType) => {
    adRemaining[itemType] = adRemainingOf(todayRecord, itemType, rules)
  })
  return { checkedIn: Boolean(todayRecord && todayRecord.checkedIn), adRemaining }
}

const hasAdLeft = (remaining) => remaining === UNLIMITED || remaining > 0

module.exports = { dailyDocId, getTodayRecord, ensureTodayRecord, adRewardCountOf, adRemainingOf, hasAdLeft, describeTodayStatus }
