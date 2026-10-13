const { db } = require('./cloud')
const { todayInChina } = require('./date')
const { ALL_ITEM_TYPES } = require('./items')

const dailyDocId = (openid) => `${openid}_${todayInChina()}`

const getTodayRecord = async (openid) => {
  try {
    const { data } = await db.collection('daily').doc(dailyDocId(openid)).get()
    return data
  } catch (error) {
    return null
  }
}

const ensureTodayRecord = async (openid) => {
  if (await getTodayRecord(openid)) return
  try {
    await db.collection('daily').add({
      data: {
        _id: dailyDocId(openid),
        openid,
        date: todayInChina(),
        checkedIn: false,
        checkinRewards: [],
        adRewardCounts: {}
      }
    })
  } catch (duplicateError) {
    return
  }
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
