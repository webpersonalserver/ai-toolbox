const { ERROR_CODES, ApiError, toastError } = require('./api')
const { ensureLogin, setItems } = require('./session')
const { checkinToday } = require('./checkin')
const { watchAdForItem } = require('./ad-reward')
const { ITEM_META, describeAmount, minutesUntil } = require('./items')
const { openPage } = require('./navigation')
const { CHEST_ROOM_URL } = require('./milestone')

const ITEM_NEXT_STEPS = {
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

const PRACTICE_TAB_URL = '/pages/practice/index'

const notify = (title, content) => wx.showModal({ title, content, showCancel: false, confirmText: '知道了' })

// "用完啦" reads friendlier to a child than "不足", and every dialog below offers a way to get more.
const titleOf = (itemType) => `${ITEM_META[itemType].label}用完啦`

// Last resort once today's free supply is gone; the hint copy cheers the child on to try without one.
const OUT_FOR_TODAY_TEXT = {
  hint: '今天的提示用完啦，自己想一想，你一定行！明天还会送新的',
  stamina: '今天的体力都送完啦，明天还会送新的！'
}

const earnByCheckin = async ({ itemType, checkinReward }) => {
  const agreed = await confirm(titleOf(itemType), `今天还没打卡，打卡可领 ${describeAmount(itemType, checkinReward)}`, '去打卡')
  return agreed && Boolean(await checkinToday())
}

const earnByAd = async ({ itemType, adReward }) => {
  const agreed = await confirm(titleOf(itemType), `看完一段视频可得 ${describeAmount(itemType, adReward)}`, '看视频')
  if (!agreed) return false
  const result = await watchAdForItem(itemType)
  if (!result) return false
  wx.showToast({ title: `获得 ${describeAmount(itemType, result.rewardAmount)}`, icon: 'none' })
  return true
}

const openWelfareChests = async ({ itemType, welfareChests }) => {
  const agreed = await confirm(titleOf(itemType), `你有 ${welfareChests} 个宝箱还没打开，里面有体力和提示！`, '去开宝箱')
  if (agreed) openPage(CHEST_ROOM_URL)
}

const suggestPractice = async ({ practiceStaminaRoom }) => {
  const agreed = await confirm(
    titleOf('stamina'),
    `去「趣味」答题还能攒体力宝箱（今天还能攒 ${practiceStaminaRoom} 点）`,
    '去趣味'
  )
  if (agreed) wx.switchTab({ url: PRACTICE_TAB_URL })
}

// The server only sends waitRecovery after practice chests are capped for today, so once recovery is also done
// the 趣味 tab is offered as something fun to do rather than as another source of stamina.
const explainStaminaRecovery = async () => {
  let items
  try {
    ;({ items } = await ensureLogin({ force: true }))
  } catch (error) {
    toastError(error)
    return
  }
  if (items.nextStaminaAt) {
    notify(titleOf('stamina'), `再等 ${minutesUntil(items.nextStaminaAt)} 分钟就送你 1 点体力～`)
    return
  }
  const agreed = await confirm(titleOf('stamina'), `${OUT_FOR_TODAY_TEXT.stamina}先去「趣味」练练本领吧`, '去趣味')
  if (agreed) wx.switchTab({ url: PRACTICE_TAB_URL })
}

/**
 * Runs an action that consumes an item. When the server reports the item is short,
 * walks the fallback order: check-in → open chests → rewarded ad → practice → item-specific fallback.
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
        notify(titleOf(step.itemType), OUT_FOR_TODAY_TEXT[step.itemType] || `今天的${ITEM_META[step.itemType].label}送完啦，明天再来吧`)
        return null
    }
    return earned ? runWithItem(action) : null
  }
}

module.exports = { runWithItem }
