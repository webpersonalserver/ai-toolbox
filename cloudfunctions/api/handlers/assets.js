const { ERROR_CODES, BusinessError } = require('../lib/response')
const { temporaryUrlsOf } = require('../lib/storage')

// Pictures (share cards, 喵算算, islands) live in storage under images/, uploaded from the console. The storage read
// permission cannot be opened on the current plan, so the mini program asks here for signed links, read as admin.
const IMAGE_DIR = 'images'
const IMAGE_PATH_PATTERN = /^(share|mascot|islands)\/[a-z0-9-]+\.(png|jpg)$/
const MAX_IMAGES_PER_REQUEST = 100
const LINK_LIFETIME_SECONDS = 24 * 60 * 60

const imageUrls = async ({ payload }) => {
  const { imagePaths } = payload
  const isValid =
    Array.isArray(imagePaths) &&
    imagePaths.length > 0 &&
    imagePaths.length <= MAX_IMAGES_PER_REQUEST &&
    imagePaths.every((imagePath) => typeof imagePath === 'string' && IMAGE_PATH_PATTERN.test(imagePath))
  if (!isValid) throw new BusinessError(ERROR_CODES.BAD_REQUEST, '图片路径不正确')
  const urlsByPath = await temporaryUrlsOf([...new Set(imagePaths)].map((imagePath) => `${IMAGE_DIR}/${imagePath}`), LINK_LIFETIME_SECONDS)
  const urls = Object.fromEntries(Object.entries(urlsByPath).map(([path, url]) => [path.slice(IMAGE_DIR.length + 1), url]))
  return { urls, expiresInSeconds: LINK_LIFETIME_SECONDS }
}

module.exports = { imageUrls }
