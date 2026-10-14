// Turns the chests from chests.list into the cards of the chest room: what each chest is, where it came from and
// what is inside, grouped by the game or practice that earned it.
const { gameConfigOf } = require('./games')
const { PRACTICES } = require('./practice/registry')
const { describeRewards } = require('./items')

const CHEST_KINDS = { GAME: 'game', PRACTICE: 'practice' }

// Where a practice chest came from (practice-rewards.js sources and multiplication milestones).
const PRACTICE_SOURCE_TEXT = {
  solved: () => '答对题数攒够啦',
  streak: () => '连对奖励',
  rowRecited: (row) => `背会第 ${row} 重口诀`,
  rowMastered: (row) => `练成第 ${row} 重`,
  rowPerfect: (row) => `第 ${row} 重拿到三星`,
  grandmaster: () => '九九神功大成',
  earlier: (row, count) => `之前攒下的 ${count} 个宝箱，一起打开`
}

const practiceConfigOf = (practiceId) => PRACTICES.find((config) => config.id === practiceId) || { name: '趣味', chestName: '趣味宝箱', icon: '趣' }

const toChestCard = (chest) => {
  const rewardsText = describeRewards(chest.rewards)
  if (chest.kind === CHEST_KINDS.GAME) {
    const config = gameConfigOf(chest.ownerId)
    return {
      chestId: chest.chestId,
      isBig: chest.isBig,
      name: chest.isBig ? '大宝箱' : `第 ${chest.chestNo} 号宝箱`,
      sourceText: `${config.name}通过第 ${chest.levelNo} 关`,
      rewardsText
    }
  }
  const describeSource = PRACTICE_SOURCE_TEXT[chest.source] || PRACTICE_SOURCE_TEXT.solved
  return {
    chestId: chest.chestId,
    isBig: false,
    name: chest.count > 1 ? `宝箱 ×${chest.count}` : practiceConfigOf(chest.ownerId).chestName,
    sourceText: describeSource(chest.row, chest.count),
    rewardsText
  }
}

// [{ key, title, icon, gameType, cards }] in the order the cloud listed them (games first, oldest chest first).
const groupChestCards = (chests) => {
  const groups = []
  chests.forEach((chest) => {
    const key = `${chest.kind}:${chest.ownerId}`
    let group = groups.find((candidate) => candidate.key === key)
    if (!group) {
      const isGame = chest.kind === CHEST_KINDS.GAME
      const config = isGame ? gameConfigOf(chest.ownerId) : practiceConfigOf(chest.ownerId)
      group = { key, title: config.name, icon: config.icon, gameType: isGame ? chest.ownerId : '', cards: [] }
      groups.push(group)
    }
    group.cards.push(toChestCard(chest))
  })
  return groups
}

// The popup after opening: one chest names itself, several are summed up.
const openedPopupOf = (result, sound) => {
  const cards = result.chests.map(toChestCard)
  const chestCount = result.chests.reduce((total, chest) => total + (chest.count || 1), 0)
  const single = cards.length === 1 ? cards[0] : null
  return {
    visible: true,
    title: chestCount > 1 ? `打开了 ${chestCount} 个宝箱` : '宝箱打开啦',
    subtitle: single ? single.sourceText : '宝箱里的宝贝都归你啦！',
    badge: cards.some((card) => card.isBig) && single ? single.name : '',
    rewards: result.rewards,
    doubleToken: result.doubleToken || '',
    sound
  }
}

module.exports = { groupChestCards, openedPopupOf, toChestCard }
