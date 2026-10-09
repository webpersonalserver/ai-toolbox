const DEFAULT_SHARE = {
  title: '来玩猜成语，看看你能闯到第几关！',
  path: '/pages/index/index'
}

const buildRescueShare = (levelNo, rescueId) => ({
  title: `第 ${levelNo} 关把我难住了，快来帮我解开！`,
  path: `/pages/rescue/rescue?id=${rescueId}`
})

module.exports = { DEFAULT_SHARE, buildRescueShare }
