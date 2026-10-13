const { ERROR_CODES, BusinessError } = require('../lib/response')
const { temporaryUrlsOf } = require('../lib/storage')

// Spoken praise clips live in storage under speech/ (made by scripts/make_speech.py); the mini program asks for all
// of them once and plays the links directly.
const SPEECH_DIR = 'speech'
const CLIP_NAME_PATTERN = /^[0-9a-f]{12}\.mp3$/
const MAX_CLIPS_PER_REQUEST = 300
const LINK_LIFETIME_SECONDS = 24 * 60 * 60

const clipUrls = async ({ payload }) => {
  const { clipNames } = payload
  const isValid =
    Array.isArray(clipNames) &&
    clipNames.length > 0 &&
    clipNames.length <= MAX_CLIPS_PER_REQUEST &&
    clipNames.every((name) => typeof name === 'string' && CLIP_NAME_PATTERN.test(name))
  if (!isValid) throw new BusinessError(ERROR_CODES.BAD_REQUEST, '语音文件名不正确')
  const urlsByPath = await temporaryUrlsOf([...new Set(clipNames)].map((name) => `${SPEECH_DIR}/${name}`), LINK_LIFETIME_SECONDS)
  const urls = Object.fromEntries(Object.entries(urlsByPath).map(([path, url]) => [path.slice(SPEECH_DIR.length + 1), url]))
  return { urls, expiresInSeconds: LINK_LIFETIME_SECONDS }
}

module.exports = { clipUrls }
