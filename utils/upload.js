// File uploads from the mini program. On 云开发 this is cloud storage; a migration to COS/OSS changes only this file
// (and cloudfunctions/api/lib/storage.js on the server).
const STORED_FILE_PREFIX = 'cloud://'

const isUploadedFile = (url) => typeof url === 'string' && url.startsWith(STORED_FILE_PREFIX)

// Uploads a local temp file into the given directory and resolves the stored file id.
const uploadFile = async (localPath, dir) => {
  const extension = localPath.split('.').pop() || 'png'
  const cloudPath = `${dir}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`
  const { fileID } = await wx.cloud.uploadFile({ cloudPath, filePath: localPath })
  return fileID
}

module.exports = { isUploadedFile, uploadFile }
