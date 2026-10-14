const { db, _ } = require('./cloud')
const { ERROR_CODES, BusinessError } = require('./response')
const { SOLUTION_FIELDS_BY_GAME, PUZZLE_FIELDS_BY_GAME, pickFields, shownBoardOf } = require('./games')

const progressDocId = (openid, gameType) => `${openid}_${gameType}`

const levelDocId = (gameType, levelNo) => `${gameType}_${levelNo}`

const getProgress = async (openid, gameType) => {
  const progressCollection = db.collection('progress')
  const docId = progressDocId(openid, gameType)
  try {
    const { data } = await progressCollection.doc(docId).get()
    return data
  } catch (error) {
    const initialProgress = { openid, gameType, currentLevel: 1, solved: [], solvedCount: 0, hintsUsed: {}, attempts: {} }
    try {
      await progressCollection.add({ data: { _id: docId, ...initialProgress } })
      return { _id: docId, ...initialProgress }
    } catch (duplicateError) {
      const { data } = await progressCollection.doc(docId).get()
      return data
    }
  }
}

const getLevel = async (gameType, levelNo) => {
  try {
    const { data } = await db.collection('levels').doc(levelDocId(gameType, levelNo)).get()
    return data
  } catch (error) {
    throw new BusinessError(ERROR_CODES.NOT_FOUND, '关卡不存在')
  }
}

const isLevelSolved = (progress, levelNo) => progress.solved.includes(levelNo)

const findUnplayableReason = (progress, levelNo) => {
  if (levelNo > progress.currentLevel) {
    return { code: ERROR_CODES.LEVEL_LOCKED, message: '关卡未解锁' }
  }
  if (isLevelSolved(progress, levelNo)) {
    return { code: ERROR_CODES.LEVEL_ALREADY_SOLVED, message: '本关已通过' }
  }
  return null
}

const assertLevelUnlocked = (progress, levelNo) => {
  if (levelNo > progress.currentLevel) {
    throw new BusinessError(ERROR_CODES.LEVEL_LOCKED, '关卡未解锁')
  }
}

const assertLevelPlayable = (progress, levelNo) => {
  const reason = findUnplayableReason(progress, levelNo)
  if (reason) throw new BusinessError(reason.code, reason.message)
}

const getAttempt = (progress, levelNo) =>
  (progress.attempts || {})[levelNo] || { active: false, wrongCount: 0 }

const describeAttempt = (attempt, rules) => {
  const { maxWrongAttempts } = rules.level
  return {
    active: attempt.active,
    wrongCount: attempt.wrongCount,
    maxWrongAttempts,
    attemptsLeft: attempt.active ? Math.max(maxWrongAttempts - attempt.wrongCount, 0) : 0,
    failed: !attempt.active && attempt.wrongCount >= maxWrongAttempts
  }
}

const hintsUsedOnLevel = (progress, levelNo) => (progress.hintsUsed || {})[levelNo] || 0

/**
 * Marks a level solved inside the caller's transaction, writing the solved list, solvedCount and lastSolvedAt
 * together so the count used by the leaderboard and clear stats can never drift from the list.
 */
const solveLevelInTransaction = async (transaction, openid, gameType, levelNo) => {
  const progressRef = transaction.collection('progress').doc(progressDocId(openid, gameType))
  const { data: progress } = await progressRef.get()
  if (progress.solved.includes(levelNo)) return { alreadySolved: true, solvedCount: progress.solved.length }
  const wrongCount = ((progress.attempts || {})[levelNo] || {}).wrongCount || 0
  const solvedCount = progress.solved.length + 1
  await progressRef.update({
    data: {
      solved: _.addToSet(levelNo),
      solvedCount,
      currentLevel: _.max(levelNo + 1),
      [`attempts.${levelNo}`]: _.set({ active: false, wrongCount }),
      lastSolvedAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  })
  return { alreadySolved: false, solvedCountBefore: solvedCount - 1, solvedCount, wrongCount }
}

// switches: from lib/switches.js. 拼音辅助 adds one syllable per answer cell while it is on; with 标出错字 off,
// 成语找错字 leaves out where the wrong character is, so children have to spot it.
const hiddenPuzzleFields = (switches) => (switches.typoMarkWrong === false ? ['wrongPosition'] : [])

const toPuzzle = (level, switches = {}) => ({
  levelNo: level.levelNo,
  clue: level.clue,
  board: shownBoardOf(level),
  answerLength: level.answer.length,
  stage: level.stage || '',
  ...pickFields(level, (PUZZLE_FIELDS_BY_GAME[level.gameType] || []).filter((field) => !hiddenPuzzleFields(switches).includes(field))),
  ...(switches.pinyinAid && level.answerPinyin ? { answerPinyin: level.answerPinyin } : {})
})

const toSolution = (level) => ({
  answer: level.answer,
  stage: level.stage || '',
  ...pickFields(level, SOLUTION_FIELDS_BY_GAME[level.gameType] || [])
})

module.exports = {
  progressDocId,
  getProgress,
  getLevel,
  assertLevelUnlocked,
  assertLevelPlayable,
  findUnplayableReason,
  getAttempt,
  describeAttempt,
  isLevelSolved,
  hintsUsedOnLevel,
  solveLevelInTransaction,
  toPuzzle,
  toSolution
}
