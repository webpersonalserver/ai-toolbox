const { cloud } = require('./cloud')

// WeChat open APIs used by the business code. On 云开发 they go through 云调用; after a migration only this file
// changes (call the HTTPS APIs with an access_token instead).
const CONTENT_CHECK_VERSION = 2
const CONTENT_CHECK_PASS = 'pass'

const CONTENT_SCENES = { PROFILE: 1 }

// Resolves true when the text passes WeChat's content check. Throws when the check itself is unavailable.
const isTextSafe = async (openid, content, scene) => {
  const response = await cloud.openapi.security.msgSecCheck({ openid, scene, version: CONTENT_CHECK_VERSION, content })
  return Boolean(response.result) && response.result.suggest === CONTENT_CHECK_PASS
}

module.exports = { CONTENT_SCENES, isTextSafe }
