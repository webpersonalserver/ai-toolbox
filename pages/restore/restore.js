// pages/restore/restore.js — 老照片修复
const api = require('../../utils/api')

Page({
  data: {
    imagePath: '',
    resultPath: '',
    colorize: false,   // 黑白上色
    enhance: true,     // 清晰增强
    processing: false,
    previewing: false
  },

  // 选择照片
  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({ imagePath: res.tempFiles[0].tempFilePath, resultPath: '' })
      }
    })
  },

  toggleColorize() { this.setData({ colorize: !this.data.colorize }) },
  toggleEnhance()  { this.setData({ enhance: !this.data.enhance }) },

  // 开始修复
  async startRestore() {
    if (!this.data.imagePath) {
      wx.showToast({ title: '请先选择照片', icon: 'none' })
      return
    }
    this.setData({ processing: true })
    try {
      const res = await api.restorePhoto(this.data.imagePath, {
        colorize: this.data.colorize,
        enhance: this.data.enhance
      })
      // TODO: 联调后按真实返回结构调整
      this.setData({ resultPath: res.resultUrl || '', processing: false })
      wx.showToast({ title: '修复完成', icon: 'success' })
    } catch (e) {
      this.setData({ processing: false })
      console.error('[restore] 失败详情:', e)
      const msg = e.code === 40010 ? '免费次数已用完' : (e.message || '修复失败，请重试')
      wx.showToast({ title: msg.slice(0, 30), icon: 'none', duration: 5000 })
    }
  },

  // 保存到相册
  async saveResult() {
    if (!this.data.resultPath) return
    try {
      const localPath = await api.downloadToTemp(this.data.resultPath)
      wx.saveImageToPhotosAlbum({
        filePath: localPath,
        success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
        fail: () => wx.showToast({ title: '保存失败（需相册权限）', icon: 'none' })
      })
    } catch (e) {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
  },

  previewImage() {
    wx.previewImage({ urls: [this.data.resultPath] })
  }
})
