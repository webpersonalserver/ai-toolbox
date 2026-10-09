const { account, ERROR_CODES, ApiError, toastError } = require('./api')
const { getSession, ensureLogin, updateSession, setItems } = require('./session')
const { checkinToday } = require('./checkin')
const { watchRewardedAd } = require('./rewarded-ad')
const { ITEM_META, describeAmount, minutesUntil } = require('./items')

const ITEM_NEXT_STEPS = {
  CHECKIN: 'checkin',
  AD: 'ad',
  RESCUE: 'rescue',
  WAIT_RECOVERY: 'waitRecovery',
  TOMORROW: 'tomorrow'
}

const confirm = (title, content, confirmText) =>
  new Promise((resolve) => {
    wx.showModal({ title, content, confirmText, success: (result) => resolve(result.confirm) })
  })

const notify = (title, content) => wx.showModal({ title, content, showCancel: false, confirmText: '知道了' })

const titleOf = (itemType) => `${ITEM_META[itemType].label}不足`

const earnByCheckin = async ({ itemType, checkinReward }) => {
  const agreed = await confirm(titleOf(itemType), `今天还没打卡，打卡可领 ${describeAmount(itemType, checkinReward)}`, '去打卡')
  return agreed && Boolean(await checkinToday())
}

const earnByAd = async ({ itemType, adReward }) => {
  const agreed = await confirm(titleOf(itemType), `看完一段视频可得 ${describeAmount(itemType, adReward)}`, '看视频')
  if (!agreed) return false
  const watchedToEnd = await watchRewardedAd(getSession().rules.ad.adUnitId)
  if (!watchedToEnd) {
    wx.showToast({ title: '看完视频才能领取哦', icon: 'none' })
    return false
  }
  try {
    const result = await account.grantAdReward(itemType)
    updateSession({ items: result.items })
    wx.showToast({ title: `获得 ${describeAmount(itemType, result.rewardAmount)}`, icon: 'none' })
    return true
  } catch (error) {
    toastError(error)
    return false
  }
}

const explainStaminaRecovery = async () => {
  const { items } = await ensureLogin({ force: true })
  const content = items.nextStaminaAt
    ? `${minutesUntil(items.nextStaminaAt)} 分钟后恢复 1 点体力，休息一下再来吧`
    : '体力会慢慢恢复，休息一下再来吧'
  notify('体力不足', content)
}

/**
 * Runs an action that consumes an item. When the server reports the item is short,
 * walks the configured fallback order: check-in → rewarded ad → item-specific fallback, then retries.
 * Resolves the action result, { needRescue: true } when the user should ask friends, or null.
 */
const runWithItem = async (action) => {
  try {
    const result = await action()
    setItems(result.items)
    return result
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== ERROR_CODES.INSUFFICIENT_ITEM) {
      toastError(error)
      return null
    }
    const step = error.data
    let earned = false
    switch (step.next) {
      case ITEM_NEXT_STEPS.CHECKIN:
        earned = await earnByCheckin(step)
        break
      case ITEM_NEXT_STEPS.AD:
        earned = await earnByAd(step)
        break
      case ITEM_NEXT_STEPS.RESCUE:
        return { needRescue: true }
      case ITEM_NEXT_STEPS.WAIT_RECOVERY:
        await explainStaminaRecovery()
        return null
      default:
        notify(titleOf(step.itemType), `今天的${ITEM_META[step.itemType].label}已经领完了，明天再来吧`)
        return null
    }
    return earned ? runWithItem(action) : null
  }
}

module.exports = { runWithItem }
