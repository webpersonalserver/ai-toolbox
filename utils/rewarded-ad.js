const adInstances = {}

const getAdInstance = (adUnitId) => {
  if (!adInstances[adUnitId]) {
    adInstances[adUnitId] = wx.createRewardedVideoAd({ adUnitId })
  }
  return adInstances[adUnitId]
}

// Resolves true only when the viewer watched to the end; closing early or load failure resolves false.
const watchRewardedAd = (adUnitId) =>
  new Promise((resolve) => {
    if (!adUnitId || !wx.createRewardedVideoAd) {
      resolve(false)
      return
    }
    const ad = getAdInstance(adUnitId)
    const handleClose = (result) => {
      ad.offClose(handleClose)
      resolve(Boolean(result && result.isEnded))
    }
    ad.onClose(handleClose)
    ad.show().catch(() =>
      ad
        .load()
        .then(() => ad.show())
        .catch((error) => {
          console.error('[rewarded-ad] show failed', error)
          ad.offClose(handleClose)
          wx.showToast({ title: '视频加载失败，稍后再试', icon: 'none' })
          resolve(false)
        })
    )
  })

module.exports = { watchRewardedAd }
