const ITEM_TYPES = {
  HINT: 'hint',
  STAMINA: 'stamina'
}

const ALL_ITEM_TYPES = Object.values(ITEM_TYPES)

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS
const CHINA_UTC_OFFSET_MS = 8 * 60 * MINUTE_MS

const chinaDateKey = (timestamp) => new Date(timestamp + CHINA_UTC_OFFSET_MS).toISOString().slice(0, 10)

const nextChinaMidnight = (timestamp) => {
  const shifted = timestamp + CHINA_UTC_OFFSET_MS
  return shifted - (shifted % DAY_MS) + DAY_MS - CHINA_UTC_OFFSET_MS
}

/**
 * One point every intervalMinutes, whatever the player holds, at most dailyCap points per Beijing day.
 * Points wait in pending (at most pendingCap) until claimed. Ticks past either cap are skipped (not saved for later),
 * and the clock keeps its rhythm across days. Walks day by day, so a long absence stays cheap.
 */
const settleStamina = (state, recovery, now) => {
  const { pending, anchorAt, recoveredDate, recoveredCount } = state
  if (!recovery.enabled) return { staminaPending: pending, staminaAnchorAt: now, recoveredDate, recoveredCount }
  const intervalMs = recovery.intervalMinutes * MINUTE_MS
  let cursor = anchorAt || now
  let dateKey = recoveredDate || ''
  let count = recoveredCount || 0
  let staminaPending = pending
  while (cursor + intervalMs <= now) {
    const firstTick = cursor + intervalMs
    const tickDate = chinaDateKey(firstTick)
    if (tickDate !== dateKey) {
      dateKey = tickDate
      count = 0
    }
    const lastTickTime = Math.min(now, nextChinaMidnight(firstTick) - 1)
    const ticks = Math.floor((lastTickTime - firstTick) / intervalMs) + 1
    const granted = Math.min(Math.max(recovery.dailyCap - count, 0), Math.max(recovery.pendingCap - staminaPending, 0), ticks)
    staminaPending += granted
    count += granted
    cursor = firstTick + (ticks - 1) * intervalMs
  }
  return { staminaPending, staminaAnchorAt: cursor, recoveredDate: dateKey, recoveredCount: count }
}

const settleUserItems = (user, rules, now) => {
  const items = {}
  ALL_ITEM_TYPES.forEach((type) => {
    items[type] = (user.items && user.items[type]) || 0
  })
  const recovery = settleStamina(
    {
      pending: user.staminaPending || 0,
      anchorAt: user.staminaAnchorAt,
      recoveredDate: user.staminaRecoveredDate,
      recoveredCount: user.staminaRecoveredCount
    },
    rules.staminaRecovery,
    now
  )
  return { items, ...recovery }
}

const recoveredTodayOf = (settled, now) => (settled.recoveredDate === chinaDateKey(now) ? settled.recoveredCount : 0)

const toItemsView = (settled, rules, now = Date.now()) => {
  const recovery = rules.staminaRecovery
  const recoveryLeftToday = recovery.enabled ? Math.max(recovery.dailyCap - recoveredTodayOf(settled, now), 0) : 0
  const pendingRoom = Math.max(recovery.pendingCap - settled.staminaPending, 0)
  const canAccrue = recoveryLeftToday > 0 && pendingRoom > 0
  return {
    ...settled.items,
    staminaPending: settled.staminaPending,
    staminaDailyCap: recovery.dailyCap,
    staminaPendingCap: recovery.pendingCap,
    recoveryLeftToday: Math.min(recoveryLeftToday, pendingRoom),
    pendingFull: pendingRoom === 0,
    nextStaminaAt: canAccrue ? settled.staminaAnchorAt + recovery.intervalMinutes * MINUTE_MS : null
  }
}

const findInsufficientItem = (items, deltas) =>
  Object.keys(deltas).find((type) => deltas[type] < 0 && items[type] + deltas[type] < 0) || null

const writeSettled = (userRef, settled) =>
  userRef.update({
    data: {
      items: settled.items,
      staminaPending: settled.staminaPending,
      staminaAnchorAt: settled.staminaAnchorAt,
      staminaRecoveredDate: settled.recoveredDate || '',
      staminaRecoveredCount: settled.recoveredCount || 0
    }
  })

const changeItemsInTransaction = async (transaction, openid, deltas, rules, now) => {
  const userRef = transaction.collection('users').doc(openid)
  const { data: user } = await userRef.get()
  const settled = settleUserItems(user, rules, now)
  const insufficientType = findInsufficientItem(settled.items, deltas)
  if (insufficientType) {
    return { insufficientType, items: toItemsView(settled, rules, now) }
  }
  const items = { ...settled.items }
  Object.keys(deltas).forEach((type) => {
    items[type] += deltas[type]
  })
  const next = { ...settled, items }
  await writeSettled(userRef, next)
  return { items: toItemsView(next, rules, now) }
}

const claimPendingStaminaInTransaction = async (transaction, openid, rules, now) => {
  const userRef = transaction.collection('users').doc(openid)
  const { data: user } = await userRef.get()
  const settled = settleUserItems(user, rules, now)
  const claimed = settled.staminaPending
  if (claimed <= 0) return { claimed: 0, items: toItemsView(settled, rules, now) }
  const next = { ...settled, items: { ...settled.items, stamina: settled.items.stamina + claimed }, staminaPending: 0 }
  await writeSettled(userRef, next)
  return { claimed, items: toItemsView(next, rules, now) }
}

const isItemType = (type) => ALL_ITEM_TYPES.includes(type)

module.exports = {
  ITEM_TYPES,
  ALL_ITEM_TYPES,
  isItemType,
  settleStamina,
  settleUserItems,
  toItemsView,
  changeItemsInTransaction,
  claimPendingStaminaInTransaction
}
