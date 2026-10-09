const { db, _ } = require('../lib/cloud')
const { ERROR_CODES, BusinessError, throwIfFailed } = require('../lib/response')
const { loadRules } = require('../lib/rules')
const { countLevels } = require('../lib/level-count')
const { RESCUE_STATUS, closeOpenRescue } = require('../lib/rescue-store')
const { isAllCleared, syncProgressAfterSolve } = require('../lib/completion')
const { ITEM_TYPES, changeItemsInTransaction } = require('../lib/items')
const { ITEM_LOG_REASONS, writeItemLogs } = require('../lib/item-log')
const { throwInsufficientItem } = require('../lib/item-next-step')
const { sumRewardsByType } = require('../lib/rules')
const {
  describeTitle,
  pendingChestCount,
  milestoneClaimedCount,
  describeAchievement
} = require('../lib/achievement')
const {
  progressDocId,
  getProgress,
  getLevel,
  assertLevelUnlocked,
  findUnplayableReason,
  getAttempt,
  describeAttempt,
  isLevelSolved,
  hintsUsedOnLevel,
  toPuzzle,
  toSolution
} = require('../lib/progress')

const GAME_TYPE = 'idiom'

const BOOK_PAGE_SIZE = 20

const parseLevelNo = (payload) => {
  const levelNo = Number(payload.levelNo)
  if (!Number.isInteger(levelNo) || levelNo < 1) {
    throw new BusinessError(ERROR_CODES.BAD_REQUEST, '关卡参数错误')
  }
  return levelNo
}

const countIdiomLevels = () => countLevels(GAME_TYPE)

const maxHintsForLevel = (level, rules) => Math.min(rules.level.maxHints, level.answer.length - 1)

const toLevelDetail = ({ level, progress, rules, total }) => {
  const { levelNo } = level
  const solved = isLevelSolved(progress, levelNo)
  const attempt = describeAttempt(getAttempt(progress, levelNo), rules)
  const hintsUsed = hintsUsedOnLevel(progress, levelNo)
  const isPlaying = attempt.active && !solved
  return {
    levelNo,
    total,
    solved,
    attempt,
    hintsUsed,
    maxHints: maxHintsForLevel(level, rules),
    staminaCost: rules.level.staminaCost,
    puzzle: isPlaying ? { ...toPuzzle(level), revealed: level.answer.slice(0, hintsUsed).split('') } : null,
    solution: solved ? toSolution(level) : null
  }
}

const progressRefOf = (transaction, openid) => transaction.collection('progress').doc(progressDocId(openid, GAME_TYPE))

const takeUnseenRescueNotices = async (openid) => {
  const rescues = db.collection('rescues')
  const { data } = await rescues
    .where({ requesterOpenid: openid, gameType: GAME_TYPE, status: RESCUE_STATUS.SOLVED, noticeSeen: false })
    .limit(20)
    .get()
  if (data.length) {
    await rescues
      .where({ _id: _.in(data.map((rescue) => rescue._id)) })
      .update({ data: { noticeSeen: true } })
  }
  return data.map((rescue) => ({ levelNo: rescue.levelNo, helperName: rescue.helperName }))
}

const levelList = async ({ openid }) => {
  const [rules, total, progress, rescueNotices] = await Promise.all([
    loadRules(),
    countIdiomLevels(),
    getProgress(openid, GAME_TYPE),
    takeUnseenRescueNotices(openid)
  ])
  return {
    total,
    currentLevel: Math.min(progress.currentLevel, total),
    solved: progress.solved,
    allCleared: isAllCleared(progress.solved.length, total),
    rescueNotices,
    achievement: describeAchievement(progress, rules)
  }
}

const summary = async ({ openid }) => {
  const [rules, total, progress] = await Promise.all([loadRules(), countIdiomLevels(), getProgress(openid, GAME_TYPE)])
  return {
    total,
    allCleared: isAllCleared(progress.solved.length, total),
    achievement: describeAchievement(progress, rules)
  }
}

const claimMilestones = async ({ openid }) => {
  const now = Date.now()
  const rules = await loadRules()
  await getProgress(openid, GAME_TYPE)
  const { everyLevels } = rules.milestone
  const rewardPerChest = sumRewardsByType(rules.milestone.rewards)

  const outcome = await db.runTransaction(async (transaction) => {
    const progressRef = progressRefOf(transaction, openid)
    const { data: progress } = await progressRef.get()
    const solvedCount = progress.solved.length
    const chestCount = pendingChestCount(solvedCount, milestoneClaimedCount(progress), everyLevels)
    if (chestCount <= 0) {
      return { failure: { code: ERROR_CODES.NO_MILESTONE_TO_CLAIM, message: '还没有可以打开的宝箱' } }
    }
    const deltas = {}
    Object.keys(rewardPerChest).forEach((itemType) => {
      deltas[itemType] = rewardPerChest[itemType] * chestCount
    })
    const change = await changeItemsInTransaction(transaction, openid, deltas, rules, now)
    const claimedSolvedCount = Math.floor(solvedCount / everyLevels) * everyLevels
    await progressRef.update({ data: { milestoneClaimedSolvedCount: claimedSolvedCount } })
    return { chestCount, deltas, items: change.items }
  })
  throwIfFailed(outcome)
  await writeItemLogs(openid, outcome.deltas, ITEM_LOG_REASONS.MILESTONE, { gameType: GAME_TYPE })
  return {
    chestCount: outcome.chestCount,
    rewards: Object.keys(outcome.deltas).map((type) => ({ type, amount: outcome.deltas[type] })),
    items: outcome.items
  }
}

const solvedBook = async ({ openid, payload }) => {
  const page = Math.max(Number(payload.page) || 1, 1)
  const progress = await getProgress(openid, GAME_TYPE)
  const solvedLevelNos = [...progress.solved].sort((left, right) => left - right)
  const pageLevelNos = solvedLevelNos.slice((page - 1) * BOOK_PAGE_SIZE, page * BOOK_PAGE_SIZE)
  if (!pageLevelNos.length) {
    return { total: solvedLevelNos.length, page, entries: [], hasMore: false }
  }
  const { data } = await db
    .collection('levels')
    .where({ gameType: GAME_TYPE, levelNo: _.in(pageLevelNos) })
    .limit(BOOK_PAGE_SIZE)
    .get()
  const entries = data
    .sort((left, right) => left.levelNo - right.levelNo)
    .map((level) => ({ levelNo: level.levelNo, ...toSolution(level) }))
  return {
    total: solvedLevelNos.length,
    page,
    entries,
    hasMore: page * BOOK_PAGE_SIZE < solvedLevelNos.length
  }
}

const getLevelDetail = async ({ openid, payload }) => {
  const levelNo = parseLevelNo(payload)
  const [rules, progress, level, total] = await Promise.all([
    loadRules(),
    getProgress(openid, GAME_TYPE),
    getLevel(GAME_TYPE, levelNo),
    countIdiomLevels()
  ])
  assertLevelUnlocked(progress, levelNo)
  return toLevelDetail({ level, progress, rules, total })
}

const startAttempt = async ({ openid, payload }) => {
  const now = Date.now()
  const levelNo = parseLevelNo(payload)
  const [rules, level, total] = await Promise.all([loadRules(), getLevel(GAME_TYPE, levelNo), countIdiomLevels()])
  await getProgress(openid, GAME_TYPE)
  const staminaDelta = { [ITEM_TYPES.STAMINA]: -rules.level.staminaCost }

  const outcome = await db.runTransaction(async (transaction) => {
    const progressRef = progressRefOf(transaction, openid)
    const { data: progress } = await progressRef.get()
    const unplayableReason = findUnplayableReason(progress, levelNo)
    if (unplayableReason) return { failure: unplayableReason }
    if (getAttempt(progress, levelNo).active) return { charged: false }
    const change = await changeItemsInTransaction(transaction, openid, staminaDelta, rules, now)
    if (change.insufficientType) return { insufficientType: change.insufficientType, items: null }
    await progressRef.update({ data: { [`attempts.${levelNo}`]: _.set({ active: true, wrongCount: 0 }) } })
    return { charged: true, items: change.items }
  })
  throwIfFailed(outcome)
  if (outcome.insufficientType) {
    await throwInsufficientItem(openid, outcome.insufficientType, rules)
  }
  if (outcome.charged) {
    await writeItemLogs(openid, staminaDelta, ITEM_LOG_REASONS.USE, { gameType: GAME_TYPE, levelNo })
  }
  const progress = await getProgress(openid, GAME_TYPE)
  return { ...toLevelDetail({ level, progress, rules, total }), items: outcome.items || null }
}

const submit = async ({ openid, payload }) => {
  const levelNo = parseLevelNo(payload)
  const [rules, level, total] = await Promise.all([loadRules(), getLevel(GAME_TYPE, levelNo), countIdiomLevels()])
  const isCorrect = String(payload.answer || '') === level.answer

  const outcome = await db.runTransaction(async (transaction) => {
    const progressRef = progressRefOf(transaction, openid)
    const { data: progress } = await progressRef.get()
    const unplayableReason = findUnplayableReason(progress, levelNo)
    if (unplayableReason) return { failure: unplayableReason }
    const attempt = getAttempt(progress, levelNo)
    if (!attempt.active) {
      return { failure: { code: ERROR_CODES.ATTEMPT_NOT_ACTIVE, message: '请先开始挑战' } }
    }
    if (isCorrect) {
      const solvedCountAfter = progress.solved.length + 1
      await progressRef.update({
        data: {
          solved: _.addToSet(levelNo),
          currentLevel: _.max(levelNo + 1),
          [`attempts.${levelNo}`]: _.set({ active: false, wrongCount: attempt.wrongCount }),
          updatedAt: db.serverDate()
        }
      })
      return {
        attempt: { active: false, wrongCount: attempt.wrongCount },
        solvedCountBefore: progress.solved.length,
        solvedCountAfter
      }
    }
    const wrongCount = attempt.wrongCount + 1
    const nextAttempt = { active: wrongCount < rules.level.maxWrongAttempts, wrongCount }
    await progressRef.update({ data: { [`attempts.${levelNo}`]: _.set(nextAttempt) } })
    return { attempt: nextAttempt }
  })
  throwIfFailed(outcome)

  if (!isCorrect) {
    return { correct: false, attempt: describeAttempt(outcome.attempt, rules) }
  }
  await closeOpenRescue(openid, GAME_TYPE, levelNo)
  const titleBefore = describeTitle(outcome.solvedCountBefore, rules)
  const titleAfter = describeTitle(outcome.solvedCountAfter, rules)
  const { progress, allCleared } = await syncProgressAfterSolve(openid, GAME_TYPE, total)
  return {
    correct: true,
    solution: toSolution(level),
    nextLevelNo: levelNo < total ? levelNo + 1 : null,
    allCleared,
    totalLevels: total,
    achievement: describeAchievement(progress, rules),
    titleUpgrade: titleAfter.name !== titleBefore.name ? titleAfter.name : null
  }
}

const useHint = async ({ openid, payload }) => {
  const now = Date.now()
  const levelNo = parseLevelNo(payload)
  const [rules, level] = await Promise.all([loadRules(), getLevel(GAME_TYPE, levelNo)])
  await getProgress(openid, GAME_TYPE)
  const maxHints = maxHintsForLevel(level, rules)
  const hintDelta = { [ITEM_TYPES.HINT]: -1 }

  const outcome = await db.runTransaction(async (transaction) => {
    const progressRef = progressRefOf(transaction, openid)
    const { data: progress } = await progressRef.get()
    const unplayableReason = findUnplayableReason(progress, levelNo)
    if (unplayableReason) return { failure: unplayableReason }
    if (!getAttempt(progress, levelNo).active) {
      return { failure: { code: ERROR_CODES.ATTEMPT_NOT_ACTIVE, message: '请先开始挑战' } }
    }
    const hintsUsed = hintsUsedOnLevel(progress, levelNo)
    if (hintsUsed >= maxHints) {
      return { failure: { code: ERROR_CODES.HINT_LIMIT_REACHED, message: `每关最多提示 ${maxHints} 次` } }
    }
    const change = await changeItemsInTransaction(transaction, openid, hintDelta, rules, now)
    if (change.insufficientType) return { insufficientType: change.insufficientType }
    await progressRef.update({ data: { [`hintsUsed.${levelNo}`]: _.inc(1) } })
    return { hintsUsed: hintsUsed + 1, items: change.items }
  })
  throwIfFailed(outcome)
  if (outcome.insufficientType) {
    await throwInsufficientItem(openid, outcome.insufficientType, rules)
  }
  await writeItemLogs(openid, hintDelta, ITEM_LOG_REASONS.USE, { gameType: GAME_TYPE, levelNo })
  return {
    items: outcome.items,
    hintsUsed: outcome.hintsUsed,
    maxHints,
    revealed: level.answer.slice(0, outcome.hintsUsed).split('')
  }
}

module.exports = {
  levelList,
  summary,
  claimMilestones,
  solvedBook,
  getLevel: getLevelDetail,
  startAttempt,
  submit,
  useHint,
  GAME_TYPE
}
