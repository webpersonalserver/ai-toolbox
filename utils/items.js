const ITEM_TYPES = {
  HINT: 'hint',
  STAMINA: 'stamina'
}

const ITEM_META = {
  [ITEM_TYPES.HINT]: { label: '提示', unit: '次' },
  [ITEM_TYPES.STAMINA]: { label: '体力', unit: '点' }
}

const MINUTE_MS = 60 * 1000

const describeAmount = (itemType, amount) => {
  const meta = ITEM_META[itemType]
  return meta ? `${amount} ${meta.unit}${meta.label}` : ''
}

const describeRewards = (rewards) =>
  rewards
    .map((reward) => describeAmount(reward.type, reward.amount))
    .filter(Boolean)
    .join('、')

const minutesUntil = (timestamp) => Math.max(Math.ceil((timestamp - Date.now()) / MINUTE_MS), 1)

const describeStaminaRecovery = (items) =>
  items && items.nextStaminaAt ? `${minutesUntil(items.nextStaminaAt)} 分钟后 +1` : ''

module.exports = { ITEM_TYPES, ITEM_META, describeAmount, describeRewards, minutesUntil, describeStaminaRecovery }
