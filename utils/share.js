// Every share card the app sends: title, landing page and picture. Pictures are 600×480 (WeChat shows 5:4).
// SHARE_IMAGE_BASE is the folder holding them. Replacing a picture = overwrite the file with the same name there
// and in cloud storage images/share/ (imageOf prefers the cloud copy).
const { imageOf } = require('./assets')

const SHARE_IMAGE_BASE = '/assets/share/'
const SHARE_IMAGE_NAMES = ['default', 'rescue', 'rank', 'medal', 'certificate', 'honors', 'arithmetic', 'exam', 'kungfu']
const SHARE_IMAGES = Object.fromEntries(SHARE_IMAGE_NAMES.map((name) => [name, `${SHARE_IMAGE_BASE}${name}.jpg`]))

// A card shared from many pages: its picture is looked up each time it is sent, so cloud links that arrive after
// launch are still used.
const fixedShare = (share, imageName) =>
  Object.defineProperty(share, 'imageUrl', { enumerable: true, get: () => imageOf(SHARE_IMAGES[imageName]) })

const LOBBY_PATH = '/pages/index/index'
const PRACTICE_TAB_PATH = '/pages/practice/index'
const KUNGFU_PATH = '/pages/practice/multiplication/index'

const DEFAULT_SHARE = fixedShare(
  { title: '汉字、成语、诗词一起闯关，看你能闯到第几关！', path: LOBBY_PATH },
  'default'
)

const buildRescueShare = (gameName, levelNo, rescueId) => ({
  title: `${gameName}第 ${levelNo} 关把我难住了，快来帮我过关！`,
  path: `/pages/rescue/rescue?id=${rescueId}`,
  imageUrl: imageOf(SHARE_IMAGES.rescue)
})

// Bragging about a rank or a title: lands in the lobby so friends can start playing.
const buildRankShare = (title) => ({ title, path: LOBBY_PATH, imageUrl: imageOf(SHARE_IMAGES.rank) })

const buildMedalShare = (medal) => ({
  title: `我获得了「${medal.name}」奖章！${medal.praise}`,
  path: PRACTICE_TAB_PATH,
  imageUrl: imageOf(SHARE_IMAGES.medal)
})

const buildCertificateShare = (nickname, achievement) => ({
  title: `${nickname}在${achievement}中拿了 100 分，获得一张奖状！`,
  path: PRACTICE_TAB_PATH,
  imageUrl: imageOf(SHARE_IMAGES.certificate)
})

const buildHonorsShare = (flowers) => ({
  title: `我已经得到 ${flowers} 朵小红花啦，快来看看我的荣誉墙！`,
  path: PRACTICE_TAB_PATH,
  imageUrl: imageOf(SHARE_IMAGES.honors)
})

// 本周小结: the numbers go in the title; the card opens the 趣味 tab, never the child's own report.
const buildWeeklyShare = ({ practicedDays, solved, stars }) => ({
  title: `这周练了 ${practicedDays} 天、答对 ${solved} 题${stars ? `、拿到 ${stars} 颗星` : ''}，快来看看我的进步！`,
  path: PRACTICE_TAB_PATH,
  imageUrl: imageOf(SHARE_IMAGES.honors)
})

const ARITHMETIC_SHARE = fixedShare({ title: '跟着喵算算去数理乐园冒险，看谁连对得多！', path: PRACTICE_TAB_PATH }, 'arithmetic')

const buildExamShare = (unitName) => ({
  title: `来挑战「${unitName}」，看看你能拿几分！`,
  path: PRACTICE_TAB_PATH,
  imageUrl: imageOf(SHARE_IMAGES.exam)
})

const KUNGFU_SHARE = fixedShare({ title: '一起修炼九九神功，看谁先神功大成！', path: KUNGFU_PATH }, 'kungfu')

module.exports = {
  DEFAULT_SHARE,
  buildRescueShare,
  buildRankShare,
  buildMedalShare,
  buildCertificateShare,
  buildHonorsShare,
  ARITHMETIC_SHARE,
  buildExamShare,
  buildWeeklyShare,
  KUNGFU_SHARE
}
