const { db, _ } = require('../lib/cloud')
const { ERROR_CODES, BusinessError, throwIfFailed } = require('../lib/response')
const { loadRulesForGame } = require('../lib/rules')
const { recordCompletionIfCleared } = require('../lib/completion')
const { ITEM_TYPES, changeItemsInTransaction } = require('../lib/items')
const { ITEM_LOG_REASONS, writeItemLogs } = require('../lib/item-log')
const { throwIfSpendFailed } = require('../lib/item-next-step')
const { describeTitle, describeAchievement } = require('../lib/achievement')
const { progressDocId, getProgress, assertLevelUnlocked, findUnplayableReason, describeAttempt, isLevelSolved, solveLevelInTransaction } = require('../lib/progress')
const { loadSwitches } = require('../lib/switches')
const { applyHonorsSafely } = require('../lib/honors')
const { MATH_GAME_TYPE, TOTAL_LEVELS, QUESTIONS_PER_LEVEL, stageOfLevel, levelQuestions, publicQuestionOf, isRightAnswer } = require('../lib/math-challenge')

// 口算闯关: a lobby game like the others (stamina to start, wrong answers per attempt, hints, chests every 10 levels,
// titles, the leaderboard by levels passed), but a level is 10 questions answered one at a time and judged here.
// attempts[levelNo] = { active, wrongCount, index }: index is the question being answered; a wrong answer stays on it.
// mathHinted[levelNo] = question indexes whose answer a hint showed (kept, so a reload still shows them).

const parseLevelNo = (payload) => {
  const levelNo = Number(payload.levelNo)
  if (!Number.isInteger(levelNo) || levelNo < 1 || levelNo > TOTAL_LEVELS) throw new BusinessError(ERROR_CODES.BAD_REQUEST, '关卡参数错误')
  return levelNo
}

const progressRefOf = (transaction, openid) => transaction.collection('progress').doc(progressDocId(openid, MATH_GAME_TYPE))
const attemptOf = (progress, levelNo) => ({ active: false, wrongCount: 0, index: 0, ...((progress.attempts || {})[levelNo] || {}) })
const hintedOf = (progress, levelNo) => (progress.mathHinted || {})[levelNo] || []

const toLevelView = ({ levelNo, progress, rules }) => {
  const questions = levelQuestions(levelNo)
  const attempt = attemptOf(progress, levelNo)
  const solved = isLevelSolved(progress, levelNo)
  const hinted = hintedOf(progress, levelNo)
  return {
    levelNo,
    total: TOTAL_LEVELS,
    stage: stageOfLevel(levelNo).name,
    solved,
    staminaCost: rules.level.staminaCost,
    attempt: describeAttempt(attempt, rules),
    index: solved ? QUESTIONS_PER_LEVEL : attempt.active ? attempt.index : 0,
    hintsUsed: ((progress.hintsUsed || {})[levelNo]) || 0,
    questions: questions.map(publicQuestionOf),
    // Answers a hint already showed in this level; every answer once the level is passed (for the review).
    shownAnswers: Object.fromEntries(questions.filter((question) => solved || hinted.includes(question.index)).map((question) => [question.index, question.answer]))
  }
}

const level = async ({ openid, payload }) => {
  const levelNo = parseLevelNo(payload)
  const [rules, progress] = await Promise.all([loadRulesForGame(MATH_GAME_TYPE), getProgress(openid, MATH_GAME_TYPE)])
  assertLevelUnlocked(progress, levelNo)
  return toLevelView({ levelNo, progress, rules })
}

// Starting (or restarting after a failed attempt) costs stamina and begins at the first question;
// an attempt still running is resumed for free.
const start = async ({ openid, payload }) => {
  const levelNo = parseLevelNo(payload)
  const rules = await loadRulesForGame(MATH_GAME_TYPE)
  await getProgress(openid, MATH_GAME_TYPE)
  const staminaDelta = { [ITEM_TYPES.STAMINA]: -rules.level.staminaCost }
  const outcome = await db.runTransaction(async (transaction) => {
    const progressRef = progressRefOf(transaction, openid)
    const { data: progress } = await progressRef.get()
    const unplayableReason = findUnplayableReason(progress, levelNo)
    if (unplayableReason) return { failure: unplayableReason }
    if (attemptOf(progress, levelNo).active) return { charged: false }
    const change = await changeItemsInTransaction(transaction, openid, staminaDelta, rules, Date.now())
    if (change.insufficientType) return { insufficientType: change.insufficientType, insufficientItems: change.items }
    await progressRef.update({ data: { [`attempts.${levelNo}`]: _.set({ active: true, wrongCount: 0, index: 0 }) } })
    return { charged: true, items: change.items }
  })
  await throwIfSpendFailed(openid, outcome, rules)
  if (outcome.charged) await writeItemLogs(openid, staminaDelta, ITEM_LOG_REASONS.USE, { gameType: MATH_GAME_TYPE, levelNo })
  const progress = await getProgress(openid, MATH_GAME_TYPE)
  return { ...toLevelView({ levelNo, progress, rules }), items: outcome.items || null }
}

const parseAnswer = (payload) => {
  const { index, answer } = payload
  if (!Number.isInteger(index) || index < 0 || index >= QUESTIONS_PER_LEVEL || typeof answer !== 'string' || answer.length > 8) {
    throw new BusinessError(ERROR_CODES.BAD_REQUEST, '答案格式不正确')
  }
  return { index, answer }
}

// One question at a time: right moves to the next (the 10th passes the level), wrong costs one of the attempt's
// chances and stays on the same question.
const answer = async ({ openid, payload }) => {
  const levelNo = parseLevelNo(payload)
  const { index, answer: given } = parseAnswer(payload)
  const rules = await loadRulesForGame(MATH_GAME_TYPE)
  const question = levelQuestions(levelNo)[index]
  const correct = isRightAnswer(question, given)
  const outcome = await db.runTransaction(async (transaction) => {
    const progressRef = progressRefOf(transaction, openid)
    const { data: progress } = await progressRef.get()
    const unplayableReason = findUnplayableReason(progress, levelNo)
    if (unplayableReason) return { failure: unplayableReason }
    const attempt = attemptOf(progress, levelNo)
    if (!attempt.active) return { failure: { code: ERROR_CODES.ATTEMPT_NOT_ACTIVE, message: '先点「开始挑战」再答题哦' } }
    if (attempt.index !== index) return { failure: { code: ERROR_CODES.BAD_REQUEST, message: '题目已经变了，重新进来看看' } }
    if (correct && index + 1 >= QUESTIONS_PER_LEVEL) {
      const solved = await solveLevelInTransaction(transaction, openid, MATH_GAME_TYPE, levelNo)
      return { passed: true, solvedCountBefore: solved.solvedCountBefore, solvedCountAfter: solved.solvedCount, attempt: { active: false, wrongCount: attempt.wrongCount, index: QUESTIONS_PER_LEVEL } }
    }
    const nextAttempt = correct
      ? { ...attempt, index: index + 1 }
      : { ...attempt, wrongCount: attempt.wrongCount + 1, active: attempt.wrongCount + 1 < rules.level.maxWrongAttempts }
    await progressRef.update({ data: { [`attempts.${levelNo}`]: _.set(nextAttempt) } })
    return { passed: false, attempt: nextAttempt }
  })
  throwIfFailed(outcome)
  const base = { correct, index: outcome.attempt.index, attempt: describeAttempt(outcome.attempt, rules) }
  if (!outcome.passed) return base
  const titleBefore = describeTitle(outcome.solvedCountBefore, rules, MATH_GAME_TYPE)
  const titleAfter = describeTitle(outcome.solvedCountAfter, rules, MATH_GAME_TYPE)
  const [allCleared, progress] = await Promise.all([
    recordCompletionIfCleared(openid, MATH_GAME_TYPE, outcome.solvedCountAfter, TOTAL_LEVELS),
    getProgress(openid, MATH_GAME_TYPE),
    applyHonorsSafely(openid, { practiced: true }, rules)
  ])
  return {
    ...base,
    passed: true,
    nextLevelNo: levelNo < TOTAL_LEVELS ? levelNo + 1 : null,
    allCleared,
    achievement: describeAchievement(progress, rules),
    titleUpgrade: titleAfter.name !== titleBefore.name ? titleAfter.name : null
  }
}

// A hint shows the answer of the question being answered (one 提示 item). With 提示不能直接给出答案 on (控制中心)
// the last question of a level has to be done without one.
const hint = async ({ openid, payload }) => {
  const levelNo = parseLevelNo(payload)
  const [rules, switches] = await Promise.all([loadRulesForGame(MATH_GAME_TYPE), loadSwitches()])
  await getProgress(openid, MATH_GAME_TYPE)
  const hintDelta = { [ITEM_TYPES.HINT]: -1 }
  const outcome = await db.runTransaction(async (transaction) => {
    const progressRef = progressRefOf(transaction, openid)
    const { data: progress } = await progressRef.get()
    const unplayableReason = findUnplayableReason(progress, levelNo)
    if (unplayableReason) return { failure: unplayableReason }
    const attempt = attemptOf(progress, levelNo)
    if (!attempt.active) return { failure: { code: ERROR_CODES.ATTEMPT_NOT_ACTIVE, message: '先点「开始挑战」再答题哦' } }
    const hinted = hintedOf(progress, levelNo)
    if (hinted.includes(attempt.index)) return { index: attempt.index, alreadyShown: true }
    if (switches.hintKeepLastStep && attempt.index === QUESTIONS_PER_LEVEL - 1) {
      return { failure: { code: ERROR_CODES.HINT_LIMIT_REACHED, message: '最后一题自己来，你可以的！' } }
    }
    const change = await changeItemsInTransaction(transaction, openid, hintDelta, rules, Date.now())
    if (change.insufficientType) return { insufficientType: change.insufficientType, insufficientItems: change.items }
    await progressRef.update({
      data: { [`mathHinted.${levelNo}`]: _.set([...hinted, attempt.index]), [`hintsUsed.${levelNo}`]: _.inc(1) }
    })
    return { index: attempt.index, items: change.items }
  })
  await throwIfSpendFailed(openid, outcome, rules)
  if (!outcome.alreadyShown) await writeItemLogs(openid, hintDelta, ITEM_LOG_REASONS.USE, { gameType: MATH_GAME_TYPE, levelNo })
  return { index: outcome.index, answer: levelQuestions(levelNo)[outcome.index].answer, items: outcome.items || null }
}

module.exports = { level, start, answer, hint }
