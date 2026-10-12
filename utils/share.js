const DEFAULT_SHARE = {
  title: '猜成语、诗词填空、歇后语，来解谜达人看看你能闯到第几关！',
  path: '/pages/index/index'
}

const buildRescueShare = (gameName, levelNo, rescueId) => ({
  title: `${gameName}第 ${levelNo} 关把我难住了，快来帮我解开！`,
  path: `/pages/rescue/rescue?id=${rescueId}`
})

module.exports = { DEFAULT_SHARE, buildRescueShare }
