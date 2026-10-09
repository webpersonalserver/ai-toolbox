const { db, _ } = require('./cloud')
const { ERROR_CODES, BusinessError } = require('./response')

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

const markLevelSolved = async (openid, gameType, levelNo) => {
  await getProgress(openid, gameType)
  await db.collection('progress').doc(progressDocId(openid, gameType)).update({
    data: {
      solved: _.addToSet(levelNo),
      currentLevel: _.max(levelNo + 1),
      [`attempts.${levelNo}.active`]: false,
      updatedAt: db.serverDate()
    }
  })
}

const toPuzzle = (level) => ({
  levelNo: level.levelNo,
  clue: level.clue,
  board: level.board,
  answerLength: level.answer.length
})

const toSolution = (level) => ({
  answer: level.answer,
  pinyin: level.pinyin,
  explanation: level.explanation,
  derivation: level.derivation
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
  markLevelSolved,
  toPuzzle,
  toSolution
}
