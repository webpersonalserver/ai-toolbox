// utils/settle.js — 记账的纯计算逻辑（无云依赖，方便单测）
// 设计原则：任何牌局都能拆成若干笔「某人的余额加/减一个整数」，
// 所以这里只做两件事：① 把不同牌型换算成一笔或多笔 entries；② 散场时算最少转账方案。

function toInt(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.trunc(n)
}

/** 单人记账：target 收/付 amount */
function buildSingle(targetId, delta) {
  const d = toInt(delta)
  if (!targetId || d === 0) return []
  return [{ memberId: targetId, delta: d }]
}

/**
 * 自摸：赢家收钱，其余每人各付 perLoser
 * 例如四人局每家付 20 → 赢家 +60，其余三人各 −20
 */
function buildZimo(allIds, winnerId, perLoser) {
  const amount = Math.abs(toInt(perLoser))
  if (!winnerId || amount === 0) return []
  const others = allIds.filter((id) => id !== winnerId)
  if (!others.length) return []
  const entries = [{ memberId: winnerId, delta: amount * others.length }]
  others.forEach((id) => entries.push({ memberId: id, delta: -amount }))
  return entries
}

/** 点炮：赢家收 amount，放炮者付 amount */
function buildDianpao(winnerId, loserId, amount) {
  const a = Math.abs(toInt(amount))
  if (!winnerId || !loserId || winnerId === loserId || a === 0) return []
  return [
    { memberId: winnerId, delta: a },
    { memberId: loserId, delta: -a }
  ]
}

/**
 * 一人收、其余平摊：常用于 AA / 某人垫付
 * 不能整除时，多出来的钱按顺序摊给前面的人（保证总额严格为零）
 */
function buildSplit(allIds, receiverId, total) {
  const amount = Math.abs(toInt(total))
  const others = allIds.filter((id) => id !== receiverId)
  if (!receiverId || amount === 0 || !others.length) return []
  const base = Math.floor(amount / others.length)
  let rest = amount - base * others.length
  const entries = [{ memberId: receiverId, delta: amount }]
  others.forEach((id) => {
    let d = base
    if (rest > 0) { d += 1; rest -= 1 }
    entries.push({ memberId: id, delta: -d })
  })
  return entries
}

/**
 * 最少转账方案（散场结算）
 * 贪心：最大的债权人和最大的债务人配对，比"人人都找赢家"少很多笔现金。
 * @param {Array<{id,name,balance}>} members
 * @returns {Array<{from,fromId,to,toId,amount}>}
 */
function settlePlan(members) {
  const creditors = []
  const debtors = []
  members.forEach((m) => {
    const v = toInt(m.balance)
    if (v > 0) creditors.push({ id: m.id, name: m.name, v })
    else if (v < 0) debtors.push({ id: m.id, name: m.name, v: -v })
  })
  creditors.sort((a, b) => b.v - a.v)
  debtors.sort((a, b) => b.v - a.v)

  const plan = []
  let ci = 0
  let di = 0
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci]
    const d = debtors[di]
    const amount = Math.min(c.v, d.v)
    if (amount > 0) {
      plan.push({ from: d.name, fromId: d.id, to: c.name, toId: c.id, amount })
    }
    c.v -= amount
    d.v -= amount
    if (c.v <= 0) ci++
    if (d.v <= 0) di++
  }
  return plan
}

/** 庄家式结算（备选）：所有人只跟余额为正的人结，用于 plan 为空但有人未平账的情况 */
function sumBalance(members) {
  return members.reduce((a, m) => a + toInt(m.balance), 0)
}

module.exports = {
  toInt,
  buildSingle,
  buildZimo,
  buildDianpao,
  buildSplit,
  settlePlan,
  sumBalance
}
