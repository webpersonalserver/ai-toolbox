const { account, toastError } = require('./api')
const { getSession, updateSession, setItems } = require('./session')
const { watchRewardedAd } = require('./rewarded-ad')
const { ITEM_META } = require('./items')

const AD_ITEM_ORDER = ['stamina', 'hint']
const ITEM_ICONS = { stamina: '/assets/icons/stamina.png', hint: '/assets/icons/hint.png' }

const isAdAvailable = (remaining) => remaining === null || remaining > 0

// Rewarded videos the player can still watch today (remaining null = no daily limit). Empty when ads are off.
const adOffersOf = (session) => {
  if (!session || !session.rules.ad.enabled || !session.rules.ad.adUnitId) return []
  const { rewards } = session.rules.ad
  const remainingByItem = (session.today && session.today.adRemaining) || {}
  return AD_ITEM_ORDER.filter((itemType) => rewards[itemType] > 0 && isAdAvailable(remainingByItem[itemType]))
    .map((itemType) => {
      const remaining = remainingByItem[itemType]
      return {
        itemType,
        amount: rewards[itemType],
        label: ITEM_META[itemType].label,
        icon: ITEM_ICONS[itemType],
        remainingText: remaining === null ? '随时都能看' : `今天还能看 ${remaining} 次`
      }
    })
}

// Plays one rewarded video and grants its reward. Resolves the grant result, or null when not watched / failed.
const watchAdForItem = async (itemType) => {
  const session = getSession()
  const watchedToEnd = await watchRewardedAd(session.rules.ad.adUnitId)
  if (!watchedToEnd) {
    wx.showToast({ title: '看完视频才能领取哦', icon: 'none' })
    return null
  }
  try {
    const result = await account.grantAdReward(itemType)
    updateSession({
      items: result.items,
      today: { adRemaining: { ...((getSession().today || {}).adRemaining || {}), [itemType]: result.adRemaining } }
    })
    return result
  } catch (error) {
    toastError(error)
    return null
  }
}

// "看视频再领一份": plays a video, then redeems the single-use token the claim came with.
const watchAdForDouble = async (token) => {
  const watchedToEnd = await watchRewardedAd(getSession().rules.ad.adUnitId)
  if (!watchedToEnd) {
    wx.showToast({ title: '看完视频才能翻倍哦', icon: 'none' })
    return null
  }
  try {
    const result = await account.claimDoubleReward(token)
    setItems(result.items)
    return result
  } catch (error) {
    toastError(error)
    return null
  }
}

module.exports = { adOffersOf, watchAdForItem, watchAdForDouble }
