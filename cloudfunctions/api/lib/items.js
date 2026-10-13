const ITEM_TYPES = {
  HINT: 'hint',
  STAMINA: 'stamina'
}

const ALL_ITEM_TYPES = Object.values(ITEM_TYPES)

const MINUTE_MS = 60 * 1000

const settleStamina = (stamina, pending, anchorAt, recovery, now) => {
  if (!recovery.enabled) return { staminaPending: pending, staminaAnchorAt: now }
  const anchor = anchorAt || now
  if (stamina + pending >= recovery.cap) return { staminaPending: pending, staminaAnchorAt: now }
  const intervalMs = recovery.intervalMinutes * MINUTE_MS
  const recovered = Math.floor((now - anchor) / intervalMs)
  const staminaPending = pending + Math.min(recovery.cap - stamina - pending, recovered)
  const isFull = stamina + staminaPending >= recovery.cap
  return { staminaPending, staminaAnchorAt: isFull ? now : anchor + recovered * intervalMs }
}

const settleUserItems = (user, rules, now) => {
  const items = {}
  ALL_ITEM_TYPES.forEach((type) => {
    items[type] = (user.items && user.items[type]) || 0
  })
  const { staminaPending, staminaAnchorAt } = settleStamina(
    items.stamina, user.staminaPending || 0, user.staminaAnchorAt, rules.staminaRecovery, now
  )
  return { items, staminaPending, staminaAnchorAt }
}

const toItemsView = ({ items, staminaPending, staminaAnchorAt }, rules) => {
  const recovery = rules.staminaRecovery
  const isAccruing = recovery.enabled && items.stamina + staminaPending < recovery.cap
  return {
    ...items,
    staminaPending,
    staminaCap: recovery.cap,
    nextStaminaAt: isAccruing ? staminaAnchorAt + recovery.intervalMinutes * MINUTE_MS : null
  }
}

const findInsufficientItem = (items, deltas) =>
  Object.keys(deltas).find((type) => deltas[type] < 0 && items[type] + deltas[type] < 0) || null

const writeSettled = (userRef, settled) =>
  userRef.update({
    data: { items: settled.items, staminaPending: settled.staminaPending, staminaAnchorAt: settled.staminaAnchorAt }
  })

const changeItemsInTransaction = async (transaction, openid, deltas, rules, now) => {
  const userRef = transaction.collection('users').doc(openid)
  const { data: user } = await userRef.get()
  const settled = settleUserItems(user, rules, now)
  const insufficientType = findInsufficientItem(settled.items, deltas)
  if (insufficientType) {
    return { insufficientType, items: toItemsView(settled, rules) }
  }
  const items = { ...settled.items }
  Object.keys(deltas).forEach((type) => {
    items[type] += deltas[type]
  })
  const next = { ...settled, items }
  await writeSettled(userRef, next)
  return { items: toItemsView(next, rules) }
}

const claimPendingStaminaInTransaction = async (transaction, openid, rules, now) => {
  const userRef = transaction.collection('users').doc(openid)
  const { data: user } = await userRef.get()
  const settled = settleUserItems(user, rules, now)
  const claimed = settled.staminaPending
  if (claimed <= 0) return { claimed: 0, items: toItemsView(settled, rules) }
  const next = {
    items: { ...settled.items, stamina: settled.items.stamina + claimed },
    staminaPending: 0,
    staminaAnchorAt: settled.staminaAnchorAt
  }
  await writeSettled(userRef, next)
  return { claimed, items: toItemsView(next, rules) }
}

const isItemType = (type) => ALL_ITEM_TYPES.includes(type)

module.exports = {
  ITEM_TYPES,
  ALL_ITEM_TYPES,
  isItemType,
  settleUserItems,
  toItemsView,
  changeItemsInTransaction,
  claimPendingStaminaInTransaction
}
