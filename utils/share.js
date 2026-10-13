// Every share card the app sends: title, landing page and picture. Pictures are 600×480 (WeChat shows 5:4).
// SHARE_IMAGE_BASE is the folder holding them. Replacing a picture = overwrite the file with the same name there.
const SHARE_IMAGE_BASE = '/assets/share/'
const SHARE_IMAGE_NAMES = ['default', 'rescue', 'rank', 'medal', 'certificate', 'honors', 'arithmetic', 'exam', 'kungfu']
const SHARE_IMAGES = Object.fromEntries(SHARE_IMAGE_NAMES.map((name) => [name, `${SHARE_IMAGE_BASE}${name}.jpg`]))

const LOBBY_PATH = '/pages/index/index'
const PRACTICE_TAB_PATH = '/pages/practice/index'
const KUNGFU_PATH = '/pages/practice/multiplication/index'

const DEFAULT_SHARE = {
  title: '猜成语、找错字、诗词填空、歇后语，还有趣味练习，来解谜达人看看你能闯到第几关！',
  path: LOBBY_PATH,
  imageUrl: SHARE_IMAGES.default
}

const buildRescueShare = (gameName, levelNo, rescueId) => ({
  title: `${gameName}第 ${levelNo} 关把我难住了，快来帮我解开！`,
  path: `/pages/rescue/rescue?id=${rescueId}`,
  imageUrl: SHARE_IMAGES.rescue
})

// Bragging about a rank or a title: lands in the lobby so friends can start playing.
const buildRankShare = (title) => ({ title, path: LOBBY_PATH, imageUrl: SHARE_IMAGES.rank })

const buildMedalShare = (medal) => ({
  title: `我获得了「${medal.name}」奖章！${medal.praise}`,
  path: PRACTICE_TAB_PATH,
  imageUrl: SHARE_IMAGES.medal
})

const buildCertificateShare = (nickname, achievement) => ({
  title: `${nickname}在${achievement}中考了 100 分，获得一张奖状！`,
  path: PRACTICE_TAB_PATH,
  imageUrl: SHARE_IMAGES.certificate
})

const buildHonorsShare = (flowers) => ({
  title: `我已经得到 ${flowers} 朵小红花啦，快来看看我的荣誉墙！`,
  path: PRACTICE_TAB_PATH,
  imageUrl: SHARE_IMAGES.honors
})

const ARITHMETIC_SHARE = { title: '一起来做加减运算，看谁连对得多！', path: PRACTICE_TAB_PATH, imageUrl: SHARE_IMAGES.arithmetic }

const buildExamShare = (tierLabel) => ({
  title: `来挑战${tierLabel}加减法限时考试，看看你能考几分！`,
  path: PRACTICE_TAB_PATH,
  imageUrl: SHARE_IMAGES.exam
})

const KUNGFU_SHARE = { title: '一起修炼九九神功，看谁先神功大成！', path: KUNGFU_PATH, imageUrl: SHARE_IMAGES.kungfu }

module.exports = {
  DEFAULT_SHARE,
  buildRescueShare,
  buildRankShare,
  buildMedalShare,
  buildCertificateShare,
  buildHonorsShare,
  ARITHMETIC_SHARE,
  buildExamShare,
  KUNGFU_SHARE
}
