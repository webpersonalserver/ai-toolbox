// utils/api.js — 后端接口封装（基于微信云开发）
// 流程：原图上传云存储 → 调用云函数 photo（CI 处理）→ 结果回传云存储 → 临时链接展示

/**
 * 上传原图到云存储，返回 fileID
 */
function uploadOriginal(filePath, prefix) {
  const cloudPath = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  return wx.cloud.uploadFile({ cloudPath, filePath }).then((res) => res.fileID)
}

/**
 * 当前小程序运行环境：develop（开发版）/ trial（体验版）/ release（正式版）
 * 云函数据此判断是不是开发者 / 体验成员，从而免额度
 */
function envVersion() {
  try {
    const info = wx.getAccountInfoSync && wx.getAccountInfoSync()
    return (info && info.miniProgram && info.miniProgram.envVersion) || 'release'
  } catch (e) {
    return 'release'
  }
}

/**
 * 调用云函数，统一处理业务错误码
 */
async function callPhoto(action, payload = {}) {
  let res
  try {
    res = await wx.cloud.callFunction({
      name: 'photo',
      data: { action, ...payload, env: envVersion() }
    })
  } catch (err) {
    // 调用层失败（函数不存在/网络/环境错误等），打印完整 errMsg 便于定位
    console.error('[api] callFunction 调用失败 action=' + action, JSON.stringify(err, null, 2))
    const msg = (err && (err.errMsg || err.message)) || '云函数调用失败'
    const e = new Error(msg)
    e.detail = err
    throw e
  }
  const r = res.result || {}
  if (r.code !== 0) {
    // 云函数业务层失败，打印服务端返回
    console.error('[api] 云函数业务错误 action=' + action, JSON.stringify(r))
    const err = new Error(r.msg || '处理失败，请重试')
    err.code = r.code
    throw err
  }
  return r.data
}

/**
 * fileID → 临时 https 链接（用于 <image> 展示/下载）
 */
async function fileIDToUrl(fileID) {
  const res = await wx.cloud.getTempFileURL({ fileList: [fileID] })
  const f = res.fileList && res.fileList[0]
  if (!f || !f.tempFileURL) throw new Error('获取结果链接失败')
  return f.tempFileURL
}

/**
 * 老照片修复
 * @param {string} filePath 本地图片路径
 * @param {object} options  { colorize: 是否上色, enhance: 是否增强 }
 * @returns {Promise<{resultUrl: string, fileID: string}>}
 */
async function restorePhoto(filePath, options = {}) {
  const fileID = await uploadOriginal(filePath, 'uploads/restore')
  const data = await callPhoto('restore', { fileID, colorize: !!options.colorize })
  return { resultUrl: await fileIDToUrl(data.fileID), fileID: data.fileID }
}

/**
 * 证件照生成
 * @param {string} filePath 本地图片路径
 * @param {object} options  { specId: 规格, bgColor: 背景色 }
 * @returns {Promise<{resultUrl: string, fileID: string}>}
 */
async function makeIdPhoto(filePath, options = {}) {
  const fileID = await uploadOriginal(filePath, 'uploads/idphoto')
  const data = await callPhoto('idphoto', {
    fileID,
    specId: options.specId,
    bgColor: options.bgColor
  })
  return { resultUrl: await fileIDToUrl(data.fileID), fileID: data.fileID }
}

/**
 * 查询用户当月免费额度与权益
 * @returns {Promise<{used:number, free:number, isMember:boolean, unlimited:boolean, levelLabel:string, expireAt:string|null, openid:string}>}
 */
async function getQuota() {
  const data = await callPhoto('quota')
  return data
}

/**
 * 兑换码核销（白名单/会员开通）
 * @param {string} code 兑换码
 */
async function redeemCode(code) {
  return await callPhoto('redeem', { code })
}

/**
 * 开发者口令激活：把当前微信永久加入免费白名单（不限次）
 * @param {string} pass
 */
async function bindMember(pass) {
  return await callPhoto('bindMember', { pass })
}

/**
 * 下载结果图到本地临时文件（保存相册前用）
 */
function downloadToTemp(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode === 200) resolve(res.tempFilePath)
        else reject(new Error('下载失败 HTTP ' + res.statusCode))
      },
      fail: reject
    })
  })
}

module.exports = { request: null, restorePhoto, makeIdPhoto, getQuota, redeemCode, bindMember, fileIDToUrl, downloadToTemp }
