const ITEM_TYPES = {
  HINT: 'hint',
  STAMINA: 'stamina'
}

const ALL_ITEM_TYPES = Object.values(ITEM_TYPES)

const MINUTE_MS = 60 * 1000

const settleStamina = (stamina, anchorAt, recovery, now) => {
  if (!recovery.enabled || stamina >= recovery.cap || !anchorAt) {
    return { stamina, staminaAnchorAt: now }
  }
  const intervalMs = recovery.intervalMinutes * MINUTE_MS
  const recovered = Math.floor((now - anchorAt) / intervalMs)
  const settledStamina = Math.min(recovery.cap, stamina + recovered)
  return {
    stamina: settledStamina,
    staminaAnchorAt: settledStamina >= recovery.cap ? now : anchorAt + recovered * intervalMs
  }
}

const settleUserItems = (user, rules, now) => {
  const items = {}
  ALL_ITEM_TYPES.forEach((type) => {
    items[type] = (user.items && user.items[type]) || 0
  })
  const { stamina, staminaAnchorAt } = settleStamina(items.stamina, user.staminaAnchorAt, rules.staminaRecovery, now)
  return { items: { ...items, stamina }, staminaAnchorAt }
}

const toItemsView = ({ items, staminaAnchorAt }, rules) => {
  const recovery = rules.staminaRecovery
  const isRecovering = recovery.enabled && items.stamina < recovery.cap
  return {
    ...items,
    staminaCap: recovery.cap,
    nextStaminaAt: isRecovering ? staminaAnchorAt + recovery.intervalMinutes * MINUTE_MS : null
  }
}

const findInsufficientItem = (items, deltas) =>
  Object.keys(deltas).find((type) => deltas[type] < 0 && items[type] + deltas[type] < 0) || null

const changeItemsInTransaction = async (transaction, openid, deltas, rules, now) => {
  const userRef = transaction.collection('users').doc(openid)
  const { data: user } = await userRef.get()
  const settled = settleUserItems(user, rules, now)
  const insufficientType = findInsufficientItem(settled.items, deltas)
  if (insufficientType) {
    return { insufficientType }
  }
  const items = { ...settled.items }
  Object.keys(deltas).forEach((type) => {
    items[type] += deltas[type]
  })
  const { staminaAnchorAt } = settled
  await userRef.update({ data: { items, staminaAnchorAt } })
  return { items: toItemsView({ items, staminaAnchorAt }, rules) }
}

const isItemType = (type) => ALL_ITEM_TYPES.includes(type)

module.exports = {
  ITEM_TYPES,
  ALL_ITEM_TYPES,
  isItemType,
  settleUserItems,
  toItemsView,
  changeItemsInTransaction
}
