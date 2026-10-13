const { db, _ } = require('../lib/cloud')
const { ERROR_CODES, BusinessError, throwIfFailed } = require('../lib/response')
const { loadRulesForGame } = require('../lib/rules')
const { countLevels, levelStages } = require('../lib/level-count')
const { RESCUE_STATUS, closeOpenRescue } = require('../lib/rescue-store')
const { isAllCleared, syncProgressAfterSolve } = require('../lib/completion')
const { ITEM_TYPES, changeItemsInTransaction } = require('../lib/items')
const { ITEM_LOG_REASONS, writeItemLogs } = require('../lib/item-log')
const { throwInsufficientItem } = require('../lib/item-next-step')
const { issueDoubleOffer } = require('../lib/double-reward')
const {
  parseGameType,
  hintStrategyOf,
  HINT_STRATEGIES,
  ELIMINATED_PER_HINT,
  ELIMINATE_KEEP_AT_LEAST
} = require('../lib/games')
const {
  describeTitle,
  pendingChestCount,
  milestoneClaimedCount,
  claimedChestCount,
  chestRewards,
  isBigChest,
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

const BOOK_PAGE_SIZE = 20

const parseLevelNo = (payload) => {
  const levelNo = Number(payload.levelNo)
  if (!Number.isInteger(levelNo) || levelNo < 1) {
    throw new BusinessError(ERROR_CODES.BAD_REQUEST, '关卡参数错误')
  }
  return levelNo
}

const maxHintsForLevel = (level, rules) => {
  const strategyLimit =
    hintStrategyOf(level.gameType) === HINT_STRATEGIES.ELIMINATE
      ? Math.floor((level.board.length - ELIMINATE_KEEP_AT_LEAST) / ELIMINATED_PER_HINT)
      : level.answer.length - 1
  return Math.min(rules.level.maxHints, strategyLimit)
}

const describeHintEffect = (level, hintsUsed) =>
  hintStrategyOf(level.gameType) === HINT_STRATEGIES.ELIMINATE
    ? { revealed: [], eliminated: level.eliminationOrder.slice(0, hintsUsed * ELIMINATED_PER_HINT) }
    : { revealed: level.answer.slice(0, hintsUsed).split(''), eliminated: [] }

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
    puzzle: isPlaying ? { ...toPuzzle(level), ...describeHintEffect(level, hintsUsed) } : null,
    solution: solved ? toSolution(level) : null
  }
}

const progressRefOf = (transaction, openid, gameType) =>
  transaction.collection('progress').doc(progressDocId(openid, gameType))

const RESCUE_NOTICE_LIMIT = 20

const takeUnseenRescueNotices = async (openid, gameType) => {
  const rescues = db.collection('rescues')
  const condition = { requesterOpenid: openid, status: RESCUE_STATUS.SOLVED, noticeSeen: false }
  const { data } = await rescues
    .where(gameType ? { ...condition, gameType } : condition)
    .limit(RESCUE_NOTICE_LIMIT)
    .get()
  if (data.length) {
    await rescues
      .where({ _id: _.in(data.map((rescue) => rescue._id)) })
      .update({ data: { noticeSeen: true } })
  }
  return data.map((rescue) => ({ gameType: rescue.gameType, levelNo: rescue.levelNo, helperName: rescue.helperName }))
}

const levelList = async ({ openid, payload }) => {
  const gameType = parseGameType(payload)
  const [rules, total, stages, progress, rescueNotices] = await Promise.all([
    loadRulesForGame(gameType),
    countLevels(gameType),
    levelStages(gameType),
    getProgress(openid, gameType),
    takeUnseenRescueNotices(openid, gameType)
  ])
  return {
    total,
    stages,
    currentLevel: Math.min(progress.currentLevel, total),
    solved: progress.solved,
    allCleared: isAllCleared(progress.solved.length, total),
    rescueNotices,
    achievement: describeAchievement(progress, rules)
  }
}

const summary = async ({ openid, payload }) => {
  const gameType = parseGameType(payload)
  const [rules, total, progress] = await Promise.all([loadRulesForGame(gameType), countLevels(gameType), getProgress(openid, gameType)])
  return {
    total,
    allCleared: isAllCleared(progress.solved.length, total),
    lastSolvedAt: progress.lastSolvedAt ? new Date(progress.lastSolvedAt).getTime() : 0,
    achievement: describeAchievement(progress, rules)
  }
}

const claimMilestones = async ({ openid, payload }) => {
  const gameType = parseGameType(payload)
  const now = Date.now()
  const rules = await loadRulesForGame(gameType)
  await getProgress(openid, gameType)
  const { everyLevels } = rules.milestone

  const outcome = await db.runTransaction(async (transaction) => {
    const progressRef = progressRefOf(transaction, openid, gameType)
    const { data: progress } = await progressRef.get()
    const solvedCount = progress.solved.length
    const chestCount = pendingChestCount(solvedCount, milestoneClaimedCount(progress), everyLevels)
    if (chestCount <= 0) {
      return { failure: { code: ERROR_CODES.NO_MILESTONE_TO_CLAIM, message: '还没有可以打开的宝箱' } }
    }
    const firstChestNo = claimedChestCount(progress, everyLevels) + 1
    const chests = Array.from({ length: chestCount }, (_, offset) => {
      const chestNo = firstChestNo + offset
      return { chestNo, isBig: isBigChest(chestNo, rules), rewards: chestRewards(chestNo, rules) }
    })
    const deltas = {}
    chests.forEach((chest) => chest.rewards.forEach((reward) => {
      deltas[reward.type] = (deltas[reward.type] || 0) + reward.amount
    }))
    const change = await changeItemsInTransaction(transaction, openid, deltas, rules, now)
    const claimedSolvedCount = Math.floor(solvedCount / everyLevels) * everyLevels
    await progressRef.update({ data: { milestoneClaimedSolvedCount: claimedSolvedCount } })
    return { chestCount, chests, deltas, items: change.items }
  })
  throwIfFailed(outcome)
  await writeItemLogs(openid, outcome.deltas, ITEM_LOG_REASONS.MILESTONE, { gameType })
  const rewards = Object.keys(outcome.deltas).map((type) => ({ type, amount: outcome.deltas[type] }))
  return {
    chestCount: outcome.chestCount,
    chests: outcome.chests,
    rewards,
    items: outcome.items,
    doubleToken: await issueDoubleOffer(openid, rewards, `milestone:${gameType}`, rules)
  }
}

const solvedBook = async ({ openid, payload }) => {
  const gameType = parseGameType(payload)
  const page = Math.max(Number(payload.page) || 1, 1)
  const progress = await getProgress(openid, gameType)
  const solvedLevelNos = [...progress.solved].sort((left, right) => left - right)
  const pageLevelNos = solvedLevelNos.slice((page - 1) * BOOK_PAGE_SIZE, page * BOOK_PAGE_SIZE)
  if (!pageLevelNos.length) {
    return { total: solvedLevelNos.length, page, entries: [], hasMore: false }
  }
  const { data } = await db
    .collection('levels')
    .where({ gameType, levelNo: _.in(pageLevelNos) })
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
  const gameType = parseGameType(payload)
  const levelNo = parseLevelNo(payload)
  const [rules, progress, level, total] = await Promise.all([
    loadRulesForGame(gameType),
    getProgress(openid, gameType),
    getLevel(gameType, levelNo),
    countLevels(gameType)
  ])
  assertLevelUnlocked(progress, levelNo)
  return toLevelDetail({ level, progress, rules, total })
}

const startAttempt = async ({ openid, payload }) => {
  const gameType = parseGameType(payload)
  const now = Date.now()
  const levelNo = parseLevelNo(payload)
  const [rules, level, total] = await Promise.all([loadRulesForGame(gameType), getLevel(gameType, levelNo), countLevels(gameType)])
  await getProgress(openid, gameType)
  const staminaDelta = { [ITEM_TYPES.STAMINA]: -rules.level.staminaCost }

  const outcome = await db.runTransaction(async (transaction) => {
    const progressRef = progressRefOf(transaction, openid, gameType)
    const { data: progress } = await progressRef.get()
    const unplayableReason = findUnplayableReason(progress, levelNo)
    if (unplayableReason) return { failure: unplayableReason }
    if (getAttempt(progress, levelNo).active) return { charged: false }
    const change = await changeItemsInTransaction(transaction, openid, staminaDelta, rules, now)
    if (change.insufficientType) return { insufficientType: change.insufficientType, insufficientItems: change.items }
    await progressRef.update({ data: { [`attempts.${levelNo}`]: _.set({ active: true, wrongCount: 0 }) } })
    return { charged: true, items: change.items }
  })
  throwIfFailed(outcome)
  if (outcome.insufficientType) {
    await throwInsufficientItem(openid, outcome.insufficientType, rules, outcome.insufficientItems)
  }
  if (outcome.charged) {
    await writeItemLogs(openid, staminaDelta, ITEM_LOG_REASONS.USE, { gameType, levelNo })
  }
  const progress = await getProgress(openid, gameType)
  return { ...toLevelDetail({ level, progress, rules, total }), items: outcome.items || null }
}

const submit = async ({ openid, payload }) => {
  const gameType = parseGameType(payload)
  const levelNo = parseLevelNo(payload)
  const [rules, level, total] = await Promise.all([loadRulesForGame(gameType), getLevel(gameType, levelNo), countLevels(gameType)])
  const isCorrect = String(payload.answer || '') === level.answer

  const outcome = await db.runTransaction(async (transaction) => {
    const progressRef = progressRefOf(transaction, openid, gameType)
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
  await closeOpenRescue(openid, gameType, levelNo)
  const titleBefore = describeTitle(outcome.solvedCountBefore, rules, gameType)
  const titleAfter = describeTitle(outcome.solvedCountAfter, rules, gameType)
  const { progress, allCleared } = await syncProgressAfterSolve(openid, gameType, total)
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
  const gameType = parseGameType(payload)
  const now = Date.now()
  const levelNo = parseLevelNo(payload)
  const [rules, level] = await Promise.all([loadRulesForGame(gameType), getLevel(gameType, levelNo)])
  await getProgress(openid, gameType)
  const maxHints = maxHintsForLevel(level, rules)
  const hintDelta = { [ITEM_TYPES.HINT]: -1 }

  const outcome = await db.runTransaction(async (transaction) => {
    const progressRef = progressRefOf(transaction, openid, gameType)
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
    if (change.insufficientType) return { insufficientType: change.insufficientType, insufficientItems: change.items }
    await progressRef.update({ data: { [`hintsUsed.${levelNo}`]: _.inc(1) } })
    return { hintsUsed: hintsUsed + 1, items: change.items }
  })
  throwIfFailed(outcome)
  if (outcome.insufficientType) {
    await throwInsufficientItem(openid, outcome.insufficientType, rules, outcome.insufficientItems)
  }
  await writeItemLogs(openid, hintDelta, ITEM_LOG_REASONS.USE, { gameType, levelNo })
  return {
    items: outcome.items,
    hintsUsed: outcome.hintsUsed,
    maxHints,
    ...describeHintEffect(level, outcome.hintsUsed)
  }
}

const summarizeGame = async (openid, gameType, rules) => {
  const [total, progress] = await Promise.all([countLevels(gameType), getProgress(openid, gameType)])
  return {
    gameType,
    total,
    currentLevel: Math.min(progress.currentLevel, total),
    solvedCount: progress.solved.length,
    allCleared: isAllCleared(progress.solved.length, total),
    achievement: describeAchievement(progress, rules)
  }
}

module.exports = {
  takeUnseenRescueNotices,
  summarizeGame,
  levelList,
  summary,
  claimMilestones,
  solvedBook,
  getLevel: getLevelDetail,
  startAttempt,
  submit,
  useHint
}
