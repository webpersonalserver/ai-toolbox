const { db } = require('./cloud')
const { getTodayRecord, describeTodayStatus } = require('./daily')
const { sumRewardsByType } = require('./rules')
const { ITEM_TYPES } = require('./items')
const { ALL_GAME_TYPES } = require('./games')
const { pendingChestCount, milestoneClaimedCount } = require('./achievement')
const { PRACTICE_IDS, practiceStatsDocId } = require('./practice-rewards')
const { ERROR_CODES, BusinessError } = require('./response')

const ITEM_NEXT_STEPS = {
  CLAIM_RECOVERY: 'claimRecovery',
  CHECKIN: 'checkin',
  OPEN_CHESTS: 'openChests',
  AD: 'ad',
  PRACTICE: 'practice',
  RESCUE: 'rescue',
  WAIT_RECOVERY: 'waitRecovery',
  TOMORROW: 'tomorrow'
}

const FALLBACK_STEP_BY_ITEM = {
  [ITEM_TYPES.HINT]: ITEM_NEXT_STEPS.RESCUE,
  [ITEM_TYPES.STAMINA]: ITEM_NEXT_STEPS.WAIT_RECOVERY
}

const readDocOrNull = async (collection, docId) => {
  try {
    const { data } = await db.collection(collection).doc(docId).get()
    return data
  } catch (error) {
    return null
  }
}

// Unopened chests anywhere in the welfare bag (level chests of every game + practice chests); every one holds stamina or hints.
const countWelfareChests = async (openid, rules) => {
  const [progresses, practiceStats] = await Promise.all([
    Promise.all(ALL_GAME_TYPES.map((gameType) => readDocOrNull('progress', `${openid}_${gameType}`))),
    Promise.all(PRACTICE_IDS.map((practiceId) => readDocOrNull('practice_stats', practiceStatsDocId(openid, practiceId))))
  ])
  const levelChests = progresses
    .filter(Boolean)
    .reduce((total, progress) => total + pendingChestCount(progress.solved.length, milestoneClaimedCount(progress), rules.milestone.everyLevels), 0)
  const practiceChests = practiceStats.filter(Boolean).reduce((total, stats) => total + (stats.pendingChestCount || 0), 0)
  return levelChests + practiceChests
}

const practiceStaminaRoomOf = (todayRecord, rules) => {
  const earned = ((todayRecord && todayRecord.practiceEarned) || {}).stamina || 0
  return Math.max(rules.practice.dailyCaps.stamina - earned, 0)
}

// Free and instant options first (claim, check-in, chests), then the ad, then earning by practice, then waiting.
const resolveNextStep = async (openid, itemType, rules, items) => {
  const [todayRecord, welfareChests] = await Promise.all([getTodayRecord(openid), countWelfareChests(openid, rules)])
  const today = describeTodayStatus(todayRecord, rules)
  const checkinReward = sumRewardsByType(rules.checkinRewards)[itemType] || 0
  const pendingStamina = itemType === ITEM_TYPES.STAMINA && items ? items.staminaPending : 0
  const practiceStaminaRoom = itemType === ITEM_TYPES.STAMINA ? practiceStaminaRoomOf(todayRecord, rules) : 0
  let next = FALLBACK_STEP_BY_ITEM[itemType]
  if (pendingStamina > 0) {
    next = ITEM_NEXT_STEPS.CLAIM_RECOVERY
  } else if (!today.checkedIn && checkinReward > 0) {
    next = ITEM_NEXT_STEPS.CHECKIN
  } else if (welfareChests > 0) {
    next = ITEM_NEXT_STEPS.OPEN_CHESTS
  } else if (today.adRemaining[itemType] > 0) {
    next = ITEM_NEXT_STEPS.AD
  } else if (practiceStaminaRoom > 0) {
    next = ITEM_NEXT_STEPS.PRACTICE
  } else if (next === ITEM_NEXT_STEPS.WAIT_RECOVERY && !rules.staminaRecovery.enabled) {
    next = ITEM_NEXT_STEPS.TOMORROW
  }
  return {
    itemType,
    next,
    checkinReward,
    adReward: rules.ad.rewards[itemType] || 0,
    pendingStamina,
    welfareChests,
    practiceStaminaRoom
  }
}

const throwInsufficientItem = async (openid, itemType, rules, items) => {
  const nextStep = await resolveNextStep(openid, itemType, rules, items)
  throw new BusinessError(ERROR_CODES.INSUFFICIENT_ITEM, '道具不足', { ...nextStep, items })
}

module.exports = { ITEM_NEXT_STEPS, resolveNextStep, throwInsufficientItem }
