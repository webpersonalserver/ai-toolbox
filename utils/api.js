// utils/api.js — 后端接口封装（云函数 / 自建后端二选一）
const config = require('./config')

/**
 * 通用请求封装
 */
function request(path, data = {}, method = 'POST') {
  return new Promise((resolve, reject) => {
    wx.request({
      url: config.API_BASE + path,
      method,
      data,
      header: { 'content-type': 'application/json' },
      success: (res) => {
        if (res.statusCode === 200) resolve(res.data)
        else reject(new Error('HTTP ' + res.statusCode))
      },
      fail: reject
    })
  })
}

/**
 * 老照片修复
 * @param {string} filePath 本地图片路径
 * @param {object} options  { colorize: 是否上色, enhance: 是否增强 }
 * TODO: 接入真实 AI 服务（腾讯云人像修复 / 阿里云人脸修复增强，约 0.1~0.2 元/次）
 */
function restorePhoto(filePath, options = {}) {
  // 上传图片 → 服务端调 AI → 返回结果图 URL
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: config.API_BASE + '/photo/restore',
      filePath,
      name: 'file',
      formData: options,
      success: (res) => {
        try { resolve(JSON.parse(res.data)) } catch (e) { reject(e) }
      },
      fail: reject
    })
  })
}

/**
 * 证件照生成
 * @param {string} filePath 本地图片路径
 * @param {object} options  { specId: 规格, bgColor: 背景色 }
 * TODO: 接入真实 AI 服务（人像分割 + 背景合成，约 0.12~0.15 元/次）
 */
function makeIdPhoto(filePath, options = {}) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: config.API_BASE + '/photo/idphoto',
      filePath,
      name: 'file',
      formData: options,
      success: (res) => {
        try { resolve(JSON.parse(res.data)) } catch (e) { reject(e) }
      },
      fail: reject
    })
  })
}

module.exports = { request, restorePhoto, makeIdPhoto }
