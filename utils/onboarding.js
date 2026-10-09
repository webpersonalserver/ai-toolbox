const GUIDE_KEYS = {
  IDIOM_RULES: 'guide.idiomRules.seen.v1'
}

// Storage can be unavailable (privacy mode, cleared data); failing open only means the guide shows again.
const hasSeenGuide = (guideKey) => {
  try {
    return Boolean(wx.getStorageSync(guideKey))
  } catch (error) {
    return false
  }
}

const markGuideSeen = (guideKey) => {
  try {
    wx.setStorageSync(guideKey, Date.now())
  } catch (error) {
    console.error('[onboarding] markGuideSeen failed', error)
  }
}

module.exports = { GUIDE_KEYS, hasSeenGuide, markGuideSeen }
