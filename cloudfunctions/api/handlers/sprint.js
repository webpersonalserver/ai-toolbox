const { db, _ } = require('../lib/cloud')
const { ERROR_CODES, BusinessError, throwIfFailed } = require('../lib/response')
const { loadRules } = require('../lib/rules')
const { ITEM_TYPES, changeItemsInTransaction } = require('../lib/items')
const { ITEM_LOG_REASONS, writeItemLogs } = require('../lib/item-log')
const { throwInsufficientItem } = require('../lib/item-next-step')
const { loadSwitches } = require('../lib/switches')
const { chinaDateKey } = require('../lib/date')
const { SPRINT_ISLANDS, sprintIslandOf, sprintPaper, isRightAnswer } = require('../lib/math-challenge')

// 口算竞速: pick an island, answer as many of its questions as you can in 60 seconds.
// Score = right − wrong (never below 0); ties go to fewer wrong, then to whoever got there first.
// Each player keeps their best per island and period in sprint_scores: the week (Monday, Beijing) while
// 排行榜每周清零 is on (控制中心), otherwise one period for all time ('all'). Both are kept, so the switch can go back.
// The run being played sits on the user record (sprintRun); the cloud rebuilds its paper from the seed to judge it.
const SECONDS = 60
// Network and the closing animation; anything later than this is not counted.
const GRACE_SECONDS = 8
const BOARD_SIZE = 50
const ALL_TIME = 'all'
const DAY_MS = 24 * 60 * 60 * 1000
const CHINA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000
const SCORES = 'sprint_scores'

const weekKeyOf = (now) => {
  const weekday = (new Date(now + CHINA_UTC_OFFSET_MS).getUTCDay() + 6) % 7
  return `week${chinaDateKey(now - weekday * DAY_MS)}`
}

const parseIsland = (payload) => {
  const island = sprintIslandOf(payload.islandId)
  if (!island) throw new BusinessError(ERROR_CODES.BAD_REQUEST, '没有这座岛')
  return island
}

const newRunId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

const scoreDocId = (period, islandId, openid) => `${period}_${islandId}_${openid}`

const readDoc = async (collection, id) => {
  try {
    return (await db.collection(collection).doc(id).get()).data
  } catch (error) {
    return null
  }
}

const isBetter = (candidate, current) =>
  !current || candidate.score > current.score || (candidate.score === current.score && candidate.wrong < current.wrong)

const rankOf = async (record) => {
  const scores = db.collection(SCORES)
  const base = { period: record.period, islandId: record.islandId }
  const [higher, fewerWrong, earlier] = await Promise.all([
    scores.where({ ...base, score: _.gt(record.score) }).count(),
    scores.where({ ...base, score: record.score, wrong: _.lt(record.wrong) }).count(),
    scores.where({ ...base, score: record.score, wrong: record.wrong, achievedAt: _.lt(record.achievedAt) }).count()
  ])
  return higher.total + fewerWrong.total + earlier.total + 1
}

// The islands to choose from, with this player's best this period.
const islands = async ({ openid }) => {
  const switches = await loadSwitches()
  const period = switches.sprintWeeklyReset ? weekKeyOf(Date.now()) : ALL_TIME
  const records = await Promise.all(SPRINT_ISLANDS.map((island) => readDoc(SCORES, scoreDocId(period, island.id, openid))))
  return {
    seconds: SECONDS,
    staminaCost: switches.sprintStaminaCost,
    weekly: switches.sprintWeeklyReset,
    islands: SPRINT_ISLANDS.map((island, index) => ({ id: island.id, name: island.name, best: records[index] ? records[index].score : null }))
  }
}

// Starts a run: stamina (控制中心 sets how much) and a fresh paper. Answers go along so the phone marks each
// answer at once; the cloud judges again from the seed when the run is handed in.
const start = async ({ openid, payload }) => {
  const island = parseIsland(payload)
  const [rules, switches] = await Promise.all([loadRules(), loadSwitches()])
  const cost = switches.sprintStaminaCost
  const delta = { [ITEM_TYPES.STAMINA]: -cost }
  const run = { runId: newRunId(), islandId: island.id, startedAt: Date.now() }
  const outcome =
    cost > 0
      ? await db.runTransaction(async (transaction) => {
          const change = await changeItemsInTransaction(transaction, openid, delta, rules, Date.now())
          return change.insufficientType ? { insufficientType: change.insufficientType, insufficientItems: change.items } : { items: change.items }
        })
      : { items: null }
  throwIfFailed(outcome)
  if (outcome.insufficientType) await throwInsufficientItem(openid, outcome.insufficientType, rules, outcome.insufficientItems)
  // A new run replaces any unfinished one (closing the page mid-run just forfeits it).
  await db.collection('users').doc(openid).update({ data: { sprintRun: _.set(run) } })
  if (cost > 0) await writeItemLogs(openid, delta, ITEM_LOG_REASONS.USE, { sprint: island.id })
  return {
    runId: run.runId,
    seconds: SECONDS,
    islandId: island.id,
    questions: sprintPaper(island.id, run.runId).map((question) => ({
      index: question.index,
      tokens: question.tokens,
      answer: question.answer,
      maxDigits: question.maxDigits,
      ...(question.choices ? { choices: question.choices } : {})
    })),
    items: outcome.items
  }
}

// answers: [{ index, answer }] in order from 0, one per question tried.
const parseAnswers = (payload, paperSize) => {
  const { answers } = payload
  const isValid =
    Array.isArray(answers) &&
    answers.length <= paperSize &&
    answers.every((item, position) => item && item.index === position && typeof item.answer === 'string' && item.answer.length <= 8)
  if (!isValid) throw new BusinessError(ERROR_CODES.BAD_REQUEST, '成绩数据不正确')
  return answers
}

const finish = async ({ openid, payload }) => {
  const now = Date.now()
  const user = await readDoc('users', openid)
  const run = user && user.sprintRun
  if (!run || run.runId !== payload.runId) throw new BusinessError(ERROR_CODES.BAD_REQUEST, '这次挑战已经结束了，再开一局吧')
  await db.collection('users').doc(openid).update({ data: { sprintRun: null } })
  if (now - run.startedAt > (SECONDS + GRACE_SECONDS) * 1000) {
    return { counted: false, message: '超过时间了，这次成绩不算' }
  }
  const paper = sprintPaper(run.islandId, run.runId)
  const answers = parseAnswers(payload, paper.length)
  const correct = answers.filter((item) => isRightAnswer(paper[item.index], item.answer)).length
  const wrong = answers.length - correct
  const result = { score: Math.max(correct - wrong, 0), correct, wrong }
  const switches = await loadSwitches()
  const periods = [weekKeyOf(now), ALL_TIME]
  const shownPeriod = switches.sprintWeeklyReset ? periods[0] : ALL_TIME
  const saved = await Promise.all(
    periods.map(async (period) => {
      const id = scoreDocId(period, run.islandId, openid)
      const current = await readDoc(SCORES, id)
      if (!isBetter(result, current)) return { period, record: current, isNewBest: false }
      const record = { openid, period, islandId: run.islandId, ...result, achievedAt: now }
      await db.collection(SCORES).doc(id).set({ data: record })
      return { period, record, isNewBest: true }
    })
  )
  const shown = saved.find((entry) => entry.period === shownPeriod)
  return { counted: true, ...result, best: shown.record.score, isNewBest: shown.isNewBest, rank: await rankOf(shown.record), weekly: switches.sprintWeeklyReset }
}

const board = async ({ openid, payload }) => {
  const island = parseIsland(payload)
  const switches = await loadSwitches()
  const period = switches.sprintWeeklyReset ? weekKeyOf(Date.now()) : ALL_TIME
  const [{ data: top }, mine] = await Promise.all([
    db.collection(SCORES).where({ period, islandId: island.id }).orderBy('score', 'desc').orderBy('wrong', 'asc').orderBy('achievedAt', 'asc').limit(BOARD_SIZE).get(),
    readDoc(SCORES, scoreDocId(period, island.id, openid))
  ])
  const openids = top.map((record) => record.openid)
  const { data: users } = openids.length ? await db.collection('users').where({ _id: _.in(openids) }).limit(openids.length).get() : { data: [] }
  const profiles = Object.fromEntries(users.map((user) => [user._id, user]))
  return {
    weekly: switches.sprintWeeklyReset,
    islandName: island.name,
    entries: top.map((record, index) => ({
      rank: index + 1,
      nickname: (profiles[record.openid] || {}).nickname || '',
      avatarUrl: (profiles[record.openid] || {}).avatarUrl || '',
      score: record.score,
      correct: record.correct,
      wrong: record.wrong,
      isMe: record.openid === openid
    })),
    me: mine ? { score: mine.score, correct: mine.correct, wrong: mine.wrong, rank: await rankOf(mine) } : null
  }
}

module.exports = { islands, start, finish, board, weekKeyOf, SECONDS }
