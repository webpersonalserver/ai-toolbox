const { db, _ } = require('../lib/cloud')
const { ERROR_CODES, BusinessError, throwIfFailed } = require('../lib/response')
const { loadRulesForGame, sumRewardsByType } = require('../lib/rules')
const { countLevels, levelStages } = require('../lib/level-count')
const { RESCUE_STATUS, closeOpenRescue, ensureRescuedLevelSolved } = require('../lib/rescue-store')
const { isAllCleared, recordCompletionIfCleared, healProgress } = require('../lib/completion')
const { ITEM_TYPES, changeItemsInTransaction } = require('../lib/items')
const { ITEM_LOG_REASONS, writeItemLogs } = require('../lib/item-log')
const { throwIfSpendFailed } = require('../lib/item-next-step')
const {
  parseGameType,
  hintStrategyOf,
  HINT_STRATEGIES,
  ELIMINATED_PER_HINT,
  ELIMINATE_KEEP_AT_LEAST
} = require('../lib/games')
const {
  describeTitle,
  pendingChestNosOf,
  milestoneAfterOpening,
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
  solveLevelInTransaction,
  hintsUsedOnLevel,
  toPuzzle,
  toSolution
} = require('../lib/progress')
const { loadSwitches } = require('../lib/switches')
const { applyHonorsSafely } = require('../lib/honors')

const BOOK_PAGE_SIZE = 20

const parseLevelNo = (payload) => {
  const levelNo = Number(payload.levelNo)
  if (!Number.isInteger(levelNo) || levelNo < 1) {
    throw new BusinessError(ERROR_CODES.BAD_REQUEST, '关卡参数错误')
  }
  return levelNo
}

// No set number of hints per level: hints are the player's own items. By default they may give the whole answer
// (揭字 every character, 排除 every wrong choice); with 提示不能直接给出答案 on (控制中心) 揭字 stops before the last
// character and 排除 while two choices are left.
const maxHintsForLevel = (level, switches = {}) => {
  const keepLastStep = switches.hintKeepLastStep === true
  if (hintStrategyOf(level.gameType) === HINT_STRATEGIES.ELIMINATE) {
    const wrongChoices = level.board.length - 1
    return keepLastStep ? Math.floor((level.board.length - ELIMINATE_KEEP_AT_LEAST) / ELIMINATED_PER_HINT) : Math.ceil(wrongChoices / ELIMINATED_PER_HINT)
  }
  return keepLastStep ? level.answer.length - 1 : level.answer.length
}

const describeHintEffect = (level, hintsUsed) =>
  hintStrategyOf(level.gameType) === HINT_STRATEGIES.ELIMINATE
    ? { revealed: [], eliminated: level.eliminationOrder.slice(0, hintsUsed * ELIMINATED_PER_HINT) }
    : { revealed: level.answer.slice(0, hintsUsed).split(''), eliminated: [] }

const toLevelDetail = ({ level, progress, rules, total, switches }) => {
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
    maxHints: maxHintsForLevel(level, switches),
    staminaCost: rules.level.staminaCost,
    puzzle: isPlaying ? { ...toPuzzle(level, switches), ...describeHintEffect(level, hintsUsed) } : null,
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
    await Promise.all(data.map(ensureRescuedLevelSolved))
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

// Opens the given chests of one game (every pending one when chestNos is null) and pays their rewards.
// Chests already opened (another tap, another device) are skipped; nothing left to open is an error.
const openGameChests = async (openid, gameType, chestNos) => {
  const now = Date.now()
  const rules = await loadRulesForGame(gameType)
  await getProgress(openid, gameType)
  const { everyLevels } = rules.milestone

  const outcome = await db.runTransaction(async (transaction) => {
    const progressRef = progressRefOf(transaction, openid, gameType)
    const { data: progress } = await progressRef.get()
    const pending = pendingChestNosOf(progress, everyLevels)
    const chestNosToOpen = chestNos ? pending.filter((chestNo) => chestNos.includes(chestNo)) : pending
    if (!chestNosToOpen.length) {
      return { failure: { code: ERROR_CODES.NO_MILESTONE_TO_CLAIM, message: '还没有可以打开的宝箱' } }
    }
    const chests = chestNosToOpen.map((chestNo) => ({ chestNo, isBig: isBigChest(chestNo, rules), rewards: chestRewards(chestNo, rules) }))
    const deltas = sumRewardsByType(chests.flatMap((chest) => chest.rewards))
    const change = await changeItemsInTransaction(transaction, openid, deltas, rules, now)
    const milestone = milestoneAfterOpening(progress, chestNosToOpen, everyLevels)
    await progressRef.update({
      data: { milestoneClaimedSolvedCount: milestone.milestoneClaimedSolvedCount, milestoneOpenedChestNos: _.set(milestone.milestoneOpenedChestNos) }
    })
    return { chests, deltas, items: change.items }
  })
  throwIfFailed(outcome)
  await writeItemLogs(openid, outcome.deltas, ITEM_LOG_REASONS.MILESTONE, { gameType })
  return { ...outcome, rules }
}

// The pending chests of one game with what is inside, for the welfare bag.
const pendingGameChests = async (openid, gameType) => {
  const [rules, progress] = await Promise.all([loadRulesForGame(gameType), getProgress(openid, gameType)])
  const { everyLevels } = rules.milestone
  return pendingChestNosOf(progress, everyLevels).map((chestNo) => ({
    chestNo,
    levelNo: chestNo * everyLevels,
    isBig: isBigChest(chestNo, rules),
    rewards: chestRewards(chestNo, rules)
  }))
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
  const [rules, progress, level, total, switches] = await Promise.all([
    loadRulesForGame(gameType),
    getProgress(openid, gameType),
    getLevel(gameType, levelNo),
    countLevels(gameType),
    loadSwitches()
  ])
  assertLevelUnlocked(progress, levelNo)
  return toLevelDetail({ level, progress, rules, total, switches })
}

const startAttempt = async ({ openid, payload }) => {
  const gameType = parseGameType(payload)
  const now = Date.now()
  const levelNo = parseLevelNo(payload)
  const [rules, level, total, switches] = await Promise.all([loadRulesForGame(gameType), getLevel(gameType, levelNo), countLevels(gameType), loadSwitches()])
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
  await throwIfSpendFailed(openid, outcome, rules)
  if (outcome.charged) {
    await writeItemLogs(openid, staminaDelta, ITEM_LOG_REASONS.USE, { gameType, levelNo })
  }
  const progress = await getProgress(openid, gameType)
  return { ...toLevelDetail({ level, progress, rules, total, switches }), items: outcome.items || null }
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
      return { failure: { code: ERROR_CODES.ATTEMPT_NOT_ACTIVE, message: '先点「开始挑战」再答题哦' } }
    }
    if (isCorrect) {
      const solved = await solveLevelInTransaction(transaction, openid, gameType, levelNo)
      return {
        attempt: { active: false, wrongCount: attempt.wrongCount },
        solvedCountBefore: solved.solvedCountBefore,
        solvedCountAfter: solved.solvedCount
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
  // A level passed counts as practising today (day streak, the first-of-the-day flower).
  const [allCleared, progress] = await Promise.all([
    recordCompletionIfCleared(openid, gameType, outcome.solvedCountAfter, total),
    getProgress(openid, gameType),
    applyHonorsSafely(openid, { practiced: true }, rules)
  ])
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
  const [rules, level, switches] = await Promise.all([loadRulesForGame(gameType), getLevel(gameType, levelNo), loadSwitches()])
  await getProgress(openid, gameType)
  const maxHints = maxHintsForLevel(level, switches)
  const hintDelta = { [ITEM_TYPES.HINT]: -1 }

  const outcome = await db.runTransaction(async (transaction) => {
    const progressRef = progressRefOf(transaction, openid, gameType)
    const { data: progress } = await progressRef.get()
    const unplayableReason = findUnplayableReason(progress, levelNo)
    if (unplayableReason) return { failure: unplayableReason }
    if (!getAttempt(progress, levelNo).active) {
      return { failure: { code: ERROR_CODES.ATTEMPT_NOT_ACTIVE, message: '先点「开始挑战」再答题哦' } }
    }
    const hintsUsed = hintsUsedOnLevel(progress, levelNo)
    if (hintsUsed >= maxHints) {
      return { failure: { code: ERROR_CODES.HINT_LIMIT_REACHED, message: switches.hintKeepLastStep ? '再提示就是直接给答案啦，最后一步自己来，你可以的！' : '答案已经全部揭开啦' } }
    }
    const change = await changeItemsInTransaction(transaction, openid, hintDelta, rules, now)
    if (change.insufficientType) return { insufficientType: change.insufficientType, insufficientItems: change.items }
    await progressRef.update({ data: { [`hintsUsed.${levelNo}`]: _.inc(1) } })
    return { hintsUsed: hintsUsed + 1, items: change.items }
  })
  await throwIfSpendFailed(openid, outcome, rules)
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
  if (progress.solvedCount !== progress.solved.length || isAllCleared(progress.solved.length, total)) {
    await healProgress(openid, gameType, progress, total)
  }
  return {
    gameType,
    total,
    currentLevel: Math.min(progress.currentLevel, total),
    solvedCount: progress.solved.length,
    allCleared: isAllCleared(progress.solved.length, total),
    // When a level was last passed: the lobby recommends and opens the tab of the game played most recently.
    lastSolvedAt: progress.lastSolvedAt ? new Date(progress.lastSolvedAt).getTime() : 0,
    achievement: describeAchievement(progress, rules)
  }
}

module.exports = {
  takeUnseenRescueNotices,
  summarizeGame,
  levelList,
  openGameChests,
  pendingGameChests,
  solvedBook,
  getLevel: getLevelDetail,
  startAttempt,
  submit,
  useHint
}
