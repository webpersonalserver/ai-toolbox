const { cloud } = require('./cloud')

// File storage used by the business code (player avatars, spoken praise clips). Uploads happen in the mini program (utils/upload.js);
// the cloud only checks ownership and removes old files. A migration to COS/OSS changes this file and utils/upload.js.
const STORED_FILE_PREFIX = 'cloud://'
// Bucket root for files we upload ourselves from the console (e.g. speech/ clips).
const STORAGE_ROOT = 'cloud://cloud1-d8g9yyxwe128b2185.636c-cloud1-d8g9yyxwe128b2185-1486441841'
const TEMP_URL_BATCH_SIZE = 50

const isStoredFileIn = (fileId, dir) => typeof fileId === 'string' && fileId.startsWith(STORED_FILE_PREFIX) && fileId.includes(`/${dir}/`)

// Best effort: a file that cannot be removed only costs storage, so failures are logged, not thrown.
const removeFile = async (fileId) => {
  try {
    await cloud.deleteFile({ fileList: [fileId] })
  } catch (error) {
    console.error('[storage] remove failed', fileId, error)
  }
}

// Signed https links for files under the bucket root, keyed by path. The cloud reads as admin, so this works whatever
// the storage read permission is. Files that do not exist are simply missing from the result.
const temporaryUrlsOf = async (paths, maxAgeSeconds) => {
  const batches = []
  for (let start = 0; start < paths.length; start += TEMP_URL_BATCH_SIZE) batches.push(paths.slice(start, start + TEMP_URL_BATCH_SIZE))
  const responses = await Promise.all(
    batches.map((batch) => cloud.getTempFileURL({ fileList: batch.map((path) => ({ fileID: `${STORAGE_ROOT}/${path}`, maxAge: maxAgeSeconds })) }))
  )
  const urls = {}
  responses.forEach(({ fileList }, batchIndex) =>
    fileList.forEach((file, index) => {
      if (file.status === 0 && file.tempFileURL) urls[batches[batchIndex][index]] = file.tempFileURL
    })
  )
  return urls
}

module.exports = { isStoredFileIn, removeFile, temporaryUrlsOf }
