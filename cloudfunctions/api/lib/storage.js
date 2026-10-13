const { cloud } = require('./cloud')

// File storage used by the business code (player avatars). Uploads happen in the mini program (utils/upload.js);
// the cloud only checks ownership and removes old files. A migration to COS/OSS changes this file and utils/upload.js.
const STORED_FILE_PREFIX = 'cloud://'

const isStoredFileIn = (fileId, dir) => typeof fileId === 'string' && fileId.startsWith(STORED_FILE_PREFIX) && fileId.includes(`/${dir}/`)

// Best effort: a file that cannot be removed only costs storage, so failures are logged, not thrown.
const removeFile = async (fileId) => {
  try {
    await cloud.deleteFile({ fileList: [fileId] })
  } catch (error) {
    console.error('[storage] remove failed', fileId, error)
  }
}

module.exports = { isStoredFileIn, removeFile }
