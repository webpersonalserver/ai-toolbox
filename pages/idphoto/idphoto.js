// pages/idphoto/idphoto.js — AI 证件照
const api = require('../../utils/api')
const config = require('../../utils/config')

Page({
  data: {
    specs: config.ID_SPECS,
    specIndex: 0,
    bgColors: ['#FFFFFF', '#438EDB', '#FF0000'],
    bgIndex: 0,
    imagePath: '',
    resultPath: '',
    processing: false
  },

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

  pickSpec(e) { this.setData({ specIndex: Number(e.currentTarget.dataset.index) }) },
  pickBg(e)   { this.setData({ bgIndex: Number(e.currentTarget.dataset.index) }) },

  async startMake() {
    if (!this.data.imagePath) {
      wx.showToast({ title: '请先拍摄或选择照片', icon: 'none' })
      return
    }
    this.setData({ processing: true })
    try {
      const spec = this.data.specs[this.data.specIndex]
      const res = await api.makeIdPhoto(this.data.imagePath, {
        specId: spec.id,
        bgColor: this.data.bgColors[this.data.bgIndex]
      })
      this.setData({ resultPath: res.resultUrl || '', processing: false })
      wx.showToast({ title: '生成完成', icon: 'success' })
    } catch (e) {
      this.setData({ processing: false })
      const msg = e.code === 40010 ? '免费次数已用完' : (e.message || '生成失败，请重试')
      wx.showToast({ title: msg.slice(0, 20), icon: 'none' })
    }
  },

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
  }
})
