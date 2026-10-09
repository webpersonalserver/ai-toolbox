const FALLBACK_HELPER_NAME = '热心好友'

const showRescueNotices = (rescueNotices) => {
  if (!rescueNotices || !rescueNotices.length) return
  const lines = rescueNotices.map(
    (notice) => `${notice.helperName || FALLBACK_HELPER_NAME} 帮你解开了第 ${notice.levelNo} 关`
  )
  wx.showModal({ title: '好友救助成功', content: lines.join('\n'), showCancel: false, confirmText: '太好了' })
}

module.exports = { showRescueNotices, FALLBACK_HELPER_NAME }
