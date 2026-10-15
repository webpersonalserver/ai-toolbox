// Pictures that also live in cloud storage under images/ (uploaded from scripts/output/images). Pages ask imageOf()
// with the packaged path; while a signed cloud link is known it is used, otherwise the packaged copy is shown.
// To drop the packaged copies later, delete the files once the cloud links have proved reliable.
const { assets } = require('./api')

const SECOND_MS = 1000
// Links are refreshed a little before they expire, so a page never gets a dead one.
const LINK_REFRESH_MARGIN_MS = 10 * 60 * SECOND_MS
const STORAGE_KEY = 'cloudImageLinks'

// Packaged path -> path under images/ in cloud storage.
const CLOUD_PATHS = {
  ...Object.fromEntries(
    ['default', 'rescue', 'rank', 'medal', 'certificate', 'honors', 'arithmetic', 'exam', 'kungfu'].map((name) => [`/assets/share/${name}.jpg`, `share/${name}.jpg`])
  ),
  ...Object.fromEntries(['normal', 'happy', 'cheer', 'wink'].map((mood) => [`/assets/mascot/${mood}.png`, `mascot/${mood}.png`])),
  ...Object.fromEntries(
    ['counting', 'make-ten', 'hundred', 'times-table', 'ten-thousand'].map((island) => [`/packageMath/assets/islands/${island}.png`, `islands/${island}.png`])
  )
}

const readSavedLinks = () => {
  try {
    return wx.getStorageSync(STORAGE_KEY) || null
  } catch (error) {
    return null
  }
}

const isFresh = (links) => Boolean(links) && links.expiresAt - LINK_REFRESH_MARGIN_MS > Date.now()

// Saved across launches so a warm start shows cloud pictures straight away.
let cloudLinks = readSavedLinks() || { urls: {}, expiresAt: 0 }
let pendingLinks = null
// Set when a cloud link would not load on this phone: packaged pictures only, until the next launch.
let cloudLinksBroken = false

const imageOf = (packagedPath) => {
  const cloudUrl = !cloudLinksBroken && isFresh(cloudLinks) && cloudLinks.urls[CLOUD_PATHS[packagedPath]]
  return cloudUrl || packagedPath
}

// An <image> showing a cloud link failed to load (seen on phones while the developer tools showed it fine): drop
// the cloud links and tell the page to draw its pictures again, now from the packaged copies. Returns whether the
// page should redraw (false when the failed picture was already a packaged one).
const fallBackFromCloudImage = (event) => {
  const src = (event && event.currentTarget && event.currentTarget.dataset.src) || ''
  if (cloudLinksBroken || !/^https?:/.test(src)) return false
  console.warn('[assets] cloud picture did not load, using packaged pictures until the next launch', src, event.detail)
  cloudLinksBroken = true
  cloudLinks = { urls: {}, expiresAt: 0 }
  try {
    wx.removeStorageSync(STORAGE_KEY)
  } catch (error) {
    console.warn('[assets] could not forget image links', error)
  }
  return true
}

// Maps every value of { key: packagedPath } through imageOf.
const imagesOf = (packagedPaths) => Object.fromEntries(Object.entries(packagedPaths).map(([key, packagedPath]) => [key, imageOf(packagedPath)]))

// Called on launch; a failure just keeps the packaged pictures until the next launch.
const refreshCloudImages = () => {
  if (cloudLinksBroken || isFresh(cloudLinks) || pendingLinks) return
  pendingLinks = assets
    .imageUrls(Object.values(CLOUD_PATHS))
    .then(({ urls, expiresInSeconds }) => {
      cloudLinks = { urls, expiresAt: Date.now() + expiresInSeconds * SECOND_MS }
      const missing = Object.values(CLOUD_PATHS).filter((cloudPath) => !urls[cloudPath])
      if (missing.length) console.warn('[assets] images missing from cloud storage', missing)
      try {
        wx.setStorageSync(STORAGE_KEY, cloudLinks)
      } catch (error) {
        console.warn('[assets] could not save image links', error)
      }
    })
    .catch((error) => console.warn('[assets] image links unavailable, using packaged pictures', error))
    .then(() => (pendingLinks = null))
}

module.exports = { imageOf, imagesOf, refreshCloudImages, fallBackFromCloudImage }
