// The lobby: one recommendation per subject on top, every game below under 汉字城堡 / 数字星球 / 字母乐园 tabs.
// cards: the lobby's game cards (gameType, solvedCount, currentLevel, allCleared, lastSolvedAt, …).
// Each subject is a place to go adventuring (like 趣味's 乐园 and islands): 汉字城堡 = 语文, 数字星球 = 数学,
// 字母乐园 = 英语. ids stay subject names; the names shown are the playful ones.
const SUBJECTS = [
  // hasSprint: the subject's 60-second challenge (识字竞速 / 口算竞速, utils/sprint.js) is not a level game, so it
  // sits in the tab as an extra card (see the lobby page).
  { id: 'chinese', name: '汉字城堡', icon: '🏰', gameTypes: ['hanzi', 'idiom', 'typo', 'poetry', 'xiehouyu'], beginner: 'hanzi', hasSprint: true },
  { id: 'math', name: '数字星球', icon: '🪐', gameTypes: ['math'], beginner: 'math', hasSprint: true },
  { id: 'english', name: '字母乐园', icon: '🎠', gameTypes: [], comingSoon: true }
]
const DEFAULT_SUBJECT = 'chinese'

const subjectOfGame = (gameType) => SUBJECTS.find((subject) => subject.gameTypes.includes(gameType)) || null

// Most recent first; levels passed break ties (and stand in for the time if the cloud did not send it).
const byRecent = (left, right) => right.lastSolvedAt - left.lastSolvedAt || right.solvedCount - left.solvedCount
const hasPlayed = (card) => card.lastSolvedAt > 0 || card.solvedCount > 0

/**
 * One game per subject, chosen from what this child has done (first rule that fits):
 * 1. the game played most recently, not finished yet → carry on from its current level;
 * 2. nothing played in this subject yet → its beginner game, from level 1;
 * 3. every played game finished → the next game in the subject not finished yet.
 */
const recommendationFor = (subject, cards) => {
  const own = cards.filter((card) => subject.gameTypes.includes(card.gameType))
  if (!own.length) return null
  const played = own.filter(hasPlayed).sort(byRecent)
  const recent = played.find((card) => !card.allCleared)
  if (recent) return { subjectId: subject.id, subjectName: subject.name, card: recent, levelNo: recent.currentLevel, reason: `上次闯到第 ${recent.currentLevel} 关，接着来` }
  if (!played.length) {
    const beginner = own.find((card) => card.gameType === subject.beginner) || own[0]
    return { subjectId: subject.id, subjectName: subject.name, card: beginner, levelNo: beginner.currentLevel || 1, reason: '新手从这里开始' }
  }
  const next = own.find((card) => !card.allCleared)
  return next ? { subjectId: subject.id, subjectName: subject.name, card: next, levelNo: next.currentLevel || 1, reason: `换个玩法：${next.name}` } : null
}

const recommendationsOf = (cards) => SUBJECTS.filter((subject) => !subject.comingSoon).map((subject) => recommendationFor(subject, cards)).filter(Boolean)

// The tab opened first: the one the child picked last time, else the subject of the game played most recently.
const initialSubjectOf = (cards, savedSubjectId) => {
  if (SUBJECTS.some((subject) => subject.id === savedSubjectId)) return savedSubjectId
  const recent = cards.filter(hasPlayed).sort(byRecent)[0]
  return (recent && subjectOfGame(recent.gameType) && subjectOfGame(recent.gameType).id) || DEFAULT_SUBJECT
}

const cardsOfSubject = (subjectId, cards) => {
  const subject = SUBJECTS.find((candidate) => candidate.id === subjectId)
  return subject ? subject.gameTypes.map((gameType) => cards.find((card) => card.gameType === gameType)).filter(Boolean) : []
}

module.exports = { SUBJECTS, DEFAULT_SUBJECT, subjectOfGame, recommendationsOf, initialSubjectOf, cardsOfSubject }
