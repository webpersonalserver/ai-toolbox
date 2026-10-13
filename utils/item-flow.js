const { account, ERROR_CODES, ApiError, toastError } = require('./api')
const { getSession, ensureLogin, updateSession, setItems } = require('./session')
const { checkinToday } = require('./checkin')
const { watchRewardedAd } = require('./rewarded-ad')
const { ITEM_META, describeAmount, minutesUntil } = require('./items')

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

const confirm = (title, content, confirmText) =>
  new Promise((resolve) => {
    wx.showModal({ title, content, confirmText, success: (result) => resolve(result.confirm) })
  })

const WELFARE_URL = '/pages/welfare/welfare'
const PRACTICE_TAB_URL = '/pages/practice/index'

const notify = (title, content) => wx.showModal({ title, content, showCancel: false, confirmText: '知道了' })

const titleOf = (itemType) => `${ITEM_META[itemType].label}不足`

const claimRecovery = async ({ pendingStamina }) => {
  const agreed = await confirm('体力不足', `有 ${pendingStamina} 点恢复的体力还没领取，现在领取？`, '领取')
  if (!agreed) return false
  try {
    const result = await account.claimRecoveredStamina()
    setItems(result.items)
    return true
  } catch (error) {
    toastError(error)
    return false
  }
}

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

const openWelfareChests = async ({ itemType, welfareChests }) => {
  const agreed = await confirm(titleOf(itemType), `福利袋里有 ${welfareChests} 个宝箱还没打开，里面有体力和提示`, '去开宝箱')
  if (agreed) wx.navigateTo({ url: WELFARE_URL })
}

const suggestPractice = async ({ practiceStaminaRoom }) => {
  const agreed = await confirm(
    '体力不足',
    `去「趣味」做加减运算，答对题目就能攒体力宝箱（今天还能攒 ${practiceStaminaRoom} 点）`,
    '去练习'
  )
  if (agreed) wx.switchTab({ url: PRACTICE_TAB_URL })
}

const explainStaminaRecovery = async () => {
  const { items } = await ensureLogin({ force: true })
  const content = items.nextStaminaAt
    ? `${minutesUntil(items.nextStaminaAt)} 分钟后恢复 1 点体力，恢复的体力可以在顶部领取`
    : '体力会慢慢恢复，休息一下再来吧'
  notify('体力不足', content)
}

/**
 * Runs an action that consumes an item. When the server reports the item is short,
 * walks the fallback order: claim recovery → check-in → open chests → rewarded ad → practice → item-specific fallback.
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
      case ITEM_NEXT_STEPS.CLAIM_RECOVERY:
        earned = await claimRecovery(step)
        break
      case ITEM_NEXT_STEPS.CHECKIN:
        earned = await earnByCheckin(step)
        break
      case ITEM_NEXT_STEPS.OPEN_CHESTS:
        await openWelfareChests(step)
        return null
      case ITEM_NEXT_STEPS.AD:
        earned = await earnByAd(step)
        break
      case ITEM_NEXT_STEPS.PRACTICE:
        await suggestPractice(step)
        return null
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
