const crypto = require('crypto')
const { db, _ } = require('./cloud')
const { dailyDocId, ensureTodayRecord } = require('./daily')
const { changeItemsInTransaction } = require('./items')
const { ITEM_LOG_REASONS, writeItemLogs } = require('./item-log')
const { ERROR_CODES, BusinessError, throwIfFailed } = require('./response')
const { AD_VIEW_KINDS, recordAdView } = require('./ad-stats')

const TOKEN_BYTES = 8
const TOKEN_PATTERN = /^[0-9a-f]{16}$/

const sumRewards = (rewards) =>
  rewards.reduce((totals, reward) => ({ ...totals, [reward.type]: (totals[reward.type] || 0) + reward.amount }), {})

/**
 * After a free claim (check-in, recovered stamina, chests), offers "watch a video to get the same again".
 * The token is single use and lives in today's daily record, so it expires at midnight with the record.
 * Returns '' when videos are off, there is nothing to double, or the total is below minAmount.
 */
const issueDoubleOffer = async (openid, rewards, source, rules, { minAmount = 1 } = {}) => {
  const positive = rewards.filter((reward) => reward.amount > 0)
  const total = positive.reduce((sum, reward) => sum + reward.amount, 0)
  if (!rules.ad.enabled || !rules.ad.adUnitId || !positive.length || total < minAmount) return ''
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex')
  await ensureTodayRecord(openid)
  await db.collection('daily').doc(dailyDocId(openid)).update({
    data: { [`doubleOffers.${token}`]: _.set({ source, rewards: positive, used: false }), updatedAt: db.serverDate() }
  })
  return token
}

const claimDoubleOffer = async (openid, token, rules, now = Date.now()) => {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) throw new BusinessError(ERROR_CODES.BAD_REQUEST, '翻倍凭证不正确')
  if (!rules.ad.enabled) throw new BusinessError(ERROR_CODES.AD_UNAVAILABLE, '视频奖励暂未开放')
  await ensureTodayRecord(openid)
  const outcome = await db.runTransaction(async (transaction) => {
    const dailyRef = transaction.collection('daily').doc(dailyDocId(openid))
    const { data: todayRecord } = await dailyRef.get()
    const offer = (todayRecord.doubleOffers || {})[token]
    if (!offer) return { failure: { code: ERROR_CODES.AD_UNAVAILABLE, message: '这份奖励已经过期了' } }
    if (offer.used) return { failure: { code: ERROR_CODES.AD_UNAVAILABLE, message: '这份奖励已经翻倍过了' } }
    const deltas = sumRewards(offer.rewards)
    const { items } = await changeItemsInTransaction(transaction, openid, deltas, rules, now)
    await dailyRef.update({ data: { [`doubleOffers.${token}.used`]: true, adViews: _.inc(1), updatedAt: db.serverDate() } })
    return { rewards: offer.rewards, source: offer.source, deltas, items, isFirstViewToday: !(todayRecord.adViews > 0) }
  })
  throwIfFailed(outcome)
  await recordAdView(AD_VIEW_KINDS.DOUBLE, outcome.isFirstViewToday)
  await writeItemLogs(openid, outcome.deltas, ITEM_LOG_REASONS.AD, { doubled: outcome.source })
  return { rewards: outcome.rewards, items: outcome.items }
}

module.exports = { issueDoubleOffer, claimDoubleOffer }
