const { hashedId } = require('./hashed-id')

const ADJECTIVES = [
  '好学的', '机灵的', '快乐的', '勇敢的', '认真的', '聪明的', '乐观的', '淡定的',
  '爱笑的', '勤快的', '细心的', '热心的', '安静的', '灵巧的', '执着的', '闪亮的',
  '温柔的', '大胆的', '可靠的', '睿智的', '活泼的', '沉稳的', '好奇的', '元气的'
]

const NOUNS = [
  '小书童', '小熊猫', '小狐狸', '小海豚', '小松鼠', '小白鹅', '小锦鲤', '小麻雀',
  '小企鹅', '小刺猬', '小考拉', '小鹦鹉', '小兔子', '小猫头鹰', '小梅花鹿', '小柴犬',
  '小水獭', '小仓鼠', '小青蛙', '小蜜蜂', '小海龟', '小燕子', '小金鱼', '小骆驼'
]

const HEX_SLICE_LENGTH = 8

const generateNickname = (openid) => {
  const seed = parseInt(hashedId(`nickname:${openid}`).slice(0, HEX_SLICE_LENGTH), 16)
  const adjective = ADJECTIVES[seed % ADJECTIVES.length]
  const noun = NOUNS[Math.floor(seed / ADJECTIVES.length) % NOUNS.length]
  return `${adjective}${noun}`
}

module.exports = { generateNickname }
