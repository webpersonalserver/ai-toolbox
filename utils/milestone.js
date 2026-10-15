const HIDDEN_REWARD_POPUP = { visible: false, title: '', subtitle: '', badge: '', rewards: [], doubleToken: '', sound: '' }
const CHEST_SOUND = 'chest'

// Every chest (levels and practice) is opened in 我的宝箱, where each one shows what is inside.
const CHEST_ROOM_URL = '/pages/welfare/chests'

const describeTitleProgress = (achievement) => {
  const { title, solvedCount } = achievement
  return title.nextName ? `再闯过 ${title.nextMinSolved - solvedCount} 关升级「${title.nextName}」` : '已经是最高称号啦'
}

module.exports = { HIDDEN_REWARD_POPUP, CHEST_SOUND, CHEST_ROOM_URL, describeTitleProgress }
