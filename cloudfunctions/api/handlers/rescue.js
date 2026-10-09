const { db, _ } = require('../lib/cloud')
const { ERROR_CODES, BusinessError, throwIfFailed } = require('../lib/response')
const { loadRules } = require('../lib/rules')
const { todayInChina } = require('../lib/date')
const { hashedId } = require('../lib/hashed-id')
const { RESCUE_STATUS, rescueIdFor } = require('../lib/rescue-store')
const {
  getProgress,
  getLevel,
  assertLevelPlayable,
  getAttempt,
  markLevelSolved,
  toPuzzle,
  toSolution
} = require('../lib/progress')
const { GAME_TYPE } = require('./idiom')
const { countLevels } = require('../lib/level-count')
const { syncProgressAfterSolve } = require('../lib/completion')

const EMPTY_PROFILE = { nickname: '', avatarUrl: '' }

const helpPairDocId = (requesterOpenid, helperOpenid) =>
  hashedId(`${requesterOpenid}:${helperOpenid}:${todayInChina()}`)

const helperAttemptDocId = (rescueId, helperOpenid) => hashedId(`${rescueId}:${helperOpenid}`)

const findDoc = async (collectionName, docId) => {
  try {
    const { data } = await db.collection(collectionName).doc(String(docId)).get()
    return data
  } catch (error) {
    return null
  }
}

const findProfile = async (openid) => {
  const user = await findDoc('users', openid)
  return user ? { nickname: user.nickname, avatarUrl: user.avatarUrl } : EMPTY_PROFILE
}

const getRescue = async (rescueId) => {
  if (!rescueId) {
    throw new BusinessError(ERROR_CODES.BAD_REQUEST, '缺少求助编号')
  }
  const rescue = await findDoc('rescues', rescueId)
  if (!rescue) {
    throw new BusinessError(ERROR_CODES.RESCUE_NOT_FOUND, '求助不存在或已失效')
  }
  return rescue
}

const closedRescueMessage = (rescue) =>
  rescue.status === RESCUE_STATUS.CLOSED_BY_REQUESTER ? 'TA 已经自己解开这一关啦' : '这道题已经被别人解开啦'

const helpedCountToday = async (requesterOpenid, helperOpenid) => {
  const pair = await findDoc('rescue_help_pairs', helpPairDocId(requesterOpenid, helperOpenid))
  return pair ? pair.count : 0
}

const wrongAnswersOf = async (rescueId, helperOpenid) => {
  const attempt = await findDoc('rescue_helper_attempts', helperAttemptDocId(rescueId, helperOpenid))
  return attempt ? attempt.wrongCount : 0
}

const addDocIgnoringDuplicate = async (collectionName, data) => {
  try {
    await db.collection(collectionName).add({ data })
  } catch (duplicateError) {
    return
  }
}

const recordWrongAnswer = async (rescueId, helperOpenid) => {
  const docId = helperAttemptDocId(rescueId, helperOpenid)
  await addDocIgnoringDuplicate('rescue_helper_attempts', {
    _id: docId,
    rescueId,
    helperOpenid,
    date: todayInChina(),
    wrongCount: 0
  })
  await db.collection('rescue_helper_attempts').doc(docId).update({ data: { wrongCount: _.inc(1) } })
  return wrongAnswersOf(rescueId, helperOpenid)
}

const helperLimitMessage = (limit) => `你今天已经帮 TA 解过 ${limit} 关了，明天再来吧`

const create = async ({ openid, payload }) => {
  const levelNo = Number(payload.levelNo)
  const progress = await getProgress(openid, GAME_TYPE)
  assertLevelPlayable(progress, levelNo)
  const attempt = getAttempt(progress, levelNo)
  if (!attempt.active && attempt.wrongCount === 0) {
    throw new BusinessError(ERROR_CODES.RESCUE_NEEDS_ATTEMPT, '先开始挑战，卡住了再求助好友')
  }

  const rescueId = rescueIdFor(openid, GAME_TYPE, levelNo)
  if (await findDoc('rescues', rescueId)) {
    return { rescueId }
  }
  await addDocIgnoringDuplicate('rescues', {
    _id: rescueId,
    requesterOpenid: openid,
    gameType: GAME_TYPE,
    levelNo,
    status: RESCUE_STATUS.OPEN,
    helperOpenid: '',
    helperName: '',
    noticeSeen: false,
    createdAt: db.serverDate()
  })
  return { rescueId }
}

const view = async ({ openid, payload }) => {
  const rescue = await getRescue(payload.rescueId)
  const isOwner = rescue.requesterOpenid === openid
  const [level, rules, requester, helpedCount, wrongAnswers] = await Promise.all([
    getLevel(rescue.gameType, rescue.levelNo),
    loadRules(),
    findProfile(rescue.requesterOpenid),
    isOwner ? 0 : helpedCountToday(rescue.requesterOpenid, openid),
    isOwner ? 0 : wrongAnswersOf(rescue._id, openid)
  ])
  const { dailyLimitPerHelper, maxWrongAnswersPerHelper } = rules.rescue
  return {
    rescueId: rescue._id,
    status: rescue.status,
    isOwner,
    requester,
    helperName: rescue.helperName,
    helperLimitReached: !isOwner && helpedCount >= dailyLimitPerHelper,
    helperLimitMessage: helperLimitMessage(dailyLimitPerHelper),
    helperAttemptsLeft: Math.max(maxWrongAnswersPerHelper - wrongAnswers, 0),
    maxWrongAnswersPerHelper,
    puzzle: toPuzzle(level),
    solution: rescue.status === RESCUE_STATUS.SOLVED ? toSolution(level) : null
  }
}

const answer = async ({ openid, payload }) => {
  const rescue = await getRescue(payload.rescueId)
  if (rescue.requesterOpenid === openid) {
    throw new BusinessError(ERROR_CODES.RESCUE_SELF_HELP, '不能给自己救助哦，等好友来帮你吧')
  }
  if (rescue.status !== RESCUE_STATUS.OPEN) {
    throw new BusinessError(ERROR_CODES.RESCUE_CLOSED, closedRescueMessage(rescue))
  }
  const [level, rules, helper, wrongAnswers] = await Promise.all([
    getLevel(rescue.gameType, rescue.levelNo),
    loadRules(),
    findProfile(openid),
    wrongAnswersOf(rescue._id, openid)
  ])
  const { dailyLimitPerHelper, maxWrongAnswersPerHelper } = rules.rescue
  if (wrongAnswers >= maxWrongAnswersPerHelper) {
    throw new BusinessError(ERROR_CODES.RESCUE_HELPER_LOCKED, `答错 ${maxWrongAnswersPerHelper} 次了，换一位好友来帮 TA 吧`)
  }

  if (String(payload.answer || '') !== level.answer) {
    const wrongCount = await recordWrongAnswer(rescue._id, openid)
    return { correct: false, attemptsLeft: Math.max(maxWrongAnswersPerHelper - wrongCount, 0) }
  }

  const pairDocId = helpPairDocId(rescue.requesterOpenid, openid)
  await addDocIgnoringDuplicate('rescue_help_pairs', {
    _id: pairDocId,
    requesterOpenid: rescue.requesterOpenid,
    helperOpenid: openid,
    date: todayInChina(),
    count: 0
  })
  const outcome = await db.runTransaction(async (transaction) => {
    const rescueRef = transaction.collection('rescues').doc(rescue._id)
    const pairRef = transaction.collection('rescue_help_pairs').doc(pairDocId)
    const { data: latestRescue } = await rescueRef.get()
    const { data: pair } = await pairRef.get()
    if (latestRescue.status !== RESCUE_STATUS.OPEN) {
      return { failure: { code: ERROR_CODES.RESCUE_CLOSED, message: closedRescueMessage(latestRescue) } }
    }
    if (pair.count >= dailyLimitPerHelper) {
      return { failure: { code: ERROR_CODES.RESCUE_HELPER_DAILY_LIMIT, message: helperLimitMessage(dailyLimitPerHelper) } }
    }
    await rescueRef.update({
      data: {
        status: RESCUE_STATUS.SOLVED,
        helperOpenid: openid,
        helperName: helper.nickname,
        solvedAt: db.serverDate()
      }
    })
    await pairRef.update({ data: { count: _.inc(1) } })
    return {}
  })
  throwIfFailed(outcome)
  await markLevelSolved(rescue.requesterOpenid, rescue.gameType, rescue.levelNo)
  await syncProgressAfterSolve(rescue.requesterOpenid, rescue.gameType, await countLevels(rescue.gameType))
  return { correct: true, solution: toSolution(level) }
}

module.exports = { create, view, answer }
