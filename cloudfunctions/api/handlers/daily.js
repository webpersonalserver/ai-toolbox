const { db } = require('../lib/cloud')
const { ERROR_CODES, BusinessError, throwIfFailed } = require('../lib/response')
const { loadRules, sumRewardsByType } = require('../lib/rules')
const { dailyDocId, ensureTodayRecord } = require('../lib/daily')
const { todayInChina } = require('../lib/date')
const { changeItemsInTransaction } = require('../lib/items')
const { ITEM_LOG_REASONS, writeItemLogs } = require('../lib/item-log')
const { FLOWER_REASONS, applyHonors } = require('../lib/honors')
const { countLevels } = require('../lib/level-count')
const { shownBoardOf } = require('../lib/games')
const { seededRandom } = require('../lib/seeded-random')

// 每日挑战: the same 10 questions for everyone on a Beijing day — 5 汉字闯关 levels picked here, and 5 sums the page
// makes from the same date (utils/daily.js). Finishing pays once a day, whatever the score.
const HANZI_GAME_TYPE = 'hanzi'
const HANZI_QUESTIONS = 5
const MATH_QUESTIONS = 5
const TOTAL_QUESTIONS = HANZI_QUESTIONS + MATH_QUESTIONS
const MAX_SECONDS = 3600

const pickLevelNos = (dateKey, total) => {
  const random = seededRandom(`daily:${dateKey}`)
  const picked = new Set()
  while (picked.size < Math.min(HANZI_QUESTIONS, total)) picked.add(1 + Math.floor(random() * total))
  return [...picked]
}

const readLevel = async (levelNo) => {
  try {
    const { data } = await db.collection('levels').doc(`${HANZI_GAME_TYPE}_${levelNo}`).get()
    return data
  } catch (error) {
    return null
  }
}

// Answers go along: the page marks each answer right away, and these levels can be played in the lobby anyway.
const toQuestion = (level) => ({
  id: level._id,
  kind: level.kind,
  prompt: level.prompt,
  clue: level.clue,
  board: shownBoardOf(level),
  answer: level.answer,
  char: level.char,
  pinyin: level.pinyin,
  word: level.word || ''
})

const today = async ({ openid }) => {
  const dateKey = todayInChina()
  const total = await countLevels(HANZI_GAME_TYPE)
  if (!total) throw new BusinessError(ERROR_CODES.BAD_REQUEST, '今日挑战还在准备中，等一会儿再来吧')
  const [levels, todayRecord] = await Promise.all([
    Promise.all(pickLevelNos(dateKey, total).map(readLevel)),
    db.collection('daily').doc(dailyDocId(openid, dateKey)).get().then(({ data }) => data, () => null)
  ])
  return {
    dateKey,
    hanzi: levels.filter(Boolean).map(toQuestion),
    mathCount: MATH_QUESTIONS,
    result: (todayRecord && todayRecord.dailyChallenge) || null
  }
}

const parseSubmit = (payload) => {
  const { dateKey, correct, seconds } = payload
  const isValid =
    typeof dateKey === 'string' &&
    Number.isInteger(correct) && correct >= 0 && correct <= TOTAL_QUESTIONS &&
    Number.isInteger(seconds) && seconds >= 1 && seconds <= MAX_SECONDS
  if (!isValid) throw new BusinessError(ERROR_CODES.BAD_REQUEST, '挑战成绩不正确')
  return { dateKey, correct, seconds }
}

const submit = async ({ openid, payload }) => {
  const { dateKey, correct, seconds } = parseSubmit(payload)
  const todayKey = await ensureTodayRecord(openid)
  if (dateKey !== todayKey) throw new BusinessError(ERROR_CODES.BAD_REQUEST, '这是昨天的挑战，今天有新题啦')
  const rules = await loadRules()
  const deltas = sumRewardsByType(rules.daily.rewards)
  const result = { correct, total: TOTAL_QUESTIONS, seconds }
  const outcome = await db.runTransaction(async (transaction) => {
    const dailyRef = transaction.collection('daily').doc(dailyDocId(openid, todayKey))
    const { data: todayRecord } = await dailyRef.get()
    if (todayRecord.dailyChallenge) return { alreadyDone: true, result: todayRecord.dailyChallenge }
    const changed = await changeItemsInTransaction(transaction, openid, deltas, rules, Date.now())
    await dailyRef.update({ data: { dailyChallenge: result, updatedAt: db.serverDate() } })
    return { alreadyDone: false, result, items: changed.items }
  })
  throwIfFailed(outcome)
  if (outcome.alreadyDone) return { alreadyDone: true, result: outcome.result, rewards: [], honors: null }
  await writeItemLogs(openid, deltas, ITEM_LOG_REASONS.DAILY_CHALLENGE)
  const flowerEvents = [{ reason: FLOWER_REASONS.DAILY_CHALLENGE, count: 1 }]
  if (correct === TOTAL_QUESTIONS) flowerEvents.push({ reason: FLOWER_REASONS.DAILY_PERFECT, count: 1 })
  let honors = null
  try {
    honors = await applyHonors(openid, { flowerEvents, practiced: true }, rules)
  } catch (error) {
    console.error('[daily] honors failed, the challenge is already recorded', error)
  }
  return { alreadyDone: false, result, rewards: rules.daily.rewards, items: outcome.items, honors }
}

module.exports = { today, submit, pickLevelNos, seededRandom, TOTAL_QUESTIONS }
