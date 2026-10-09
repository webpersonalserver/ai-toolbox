const { getTodayRecord, describeTodayStatus } = require('./daily')
const { sumRewardsByType } = require('./rules')
const { ITEM_TYPES } = require('./items')
const { ERROR_CODES, BusinessError } = require('./response')

const ITEM_NEXT_STEPS = {
  CHECKIN: 'checkin',
  AD: 'ad',
  RESCUE: 'rescue',
  WAIT_RECOVERY: 'waitRecovery',
  TOMORROW: 'tomorrow'
}

const FALLBACK_STEP_BY_ITEM = {
  [ITEM_TYPES.HINT]: ITEM_NEXT_STEPS.RESCUE,
  [ITEM_TYPES.STAMINA]: ITEM_NEXT_STEPS.WAIT_RECOVERY
}

const resolveNextStep = async (openid, itemType, rules) => {
  const today = describeTodayStatus(await getTodayRecord(openid), rules)
  const checkinReward = sumRewardsByType(rules.checkinRewards)[itemType] || 0
  let next = FALLBACK_STEP_BY_ITEM[itemType]
  if (!today.checkedIn && checkinReward > 0) {
    next = ITEM_NEXT_STEPS.CHECKIN
  } else if (today.adRemaining[itemType] > 0) {
    next = ITEM_NEXT_STEPS.AD
  } else if (next === ITEM_NEXT_STEPS.WAIT_RECOVERY && !rules.staminaRecovery.enabled) {
    next = ITEM_NEXT_STEPS.TOMORROW
  }
  return {
    itemType,
    next,
    checkinReward,
    adReward: rules.ad.rewards[itemType] || 0
  }
}

const throwInsufficientItem = async (openid, itemType, rules, items) => {
  const nextStep = await resolveNextStep(openid, itemType, rules)
  throw new BusinessError(ERROR_CODES.INSUFFICIENT_ITEM, '道具不足', { ...nextStep, items })
}

module.exports = { ITEM_NEXT_STEPS, resolveNextStep, throwInsufficientItem }
