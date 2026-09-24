// pages/index/index.js — 首页
Page({
  data: {
    tools: [
      {
        id: 'restore',
        title: '老照片修复',
        desc: '模糊旧照变清晰 · 支持黑白上色',
        icon: '📷',
        url: '/pages/restore/restore',
        tag: '热门'
      },
      {
        id: 'idphoto',
        title: 'AI 证件照',
        desc: '一寸/二寸 · 白底红底蓝底',
        icon: '🪪',
        url: '/pages/idphoto/idphoto',
        tag: '刚需'
      },
      {
        id: 'ledger',
        title: '牌局记账',
        desc: '打牌不用现金 · 散场自动算账',
        icon: '🀄',
        url: '/pages/ledger/ledger',
        tag: '新品'
      }
    ]
  },

  goTool(e) {
    const url = e.currentTarget.dataset.url
    wx.navigateTo({ url })
  }
})
