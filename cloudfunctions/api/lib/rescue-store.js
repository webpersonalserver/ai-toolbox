const { db } = require('./cloud')
const { hashedId } = require('./hashed-id')
const { solveLevelInTransaction } = require('./progress')
const { recordCompletionIfCleared } = require('./completion')
const { countLevels } = require('./level-count')

const RESCUE_STATUS = {
  OPEN: 'open',
  SOLVED: 'solved',
  CLOSED_BY_REQUESTER: 'closedByRequester'
}

const rescueIdFor = (openid, gameType, levelNo) => hashedId(`${openid}:${gameType}:${levelNo}`)

const closeOpenRescue = async (openid, gameType, levelNo) => {
  try {
    await db
      .collection('rescues')
      .where({ _id: rescueIdFor(openid, gameType, levelNo), status: RESCUE_STATUS.OPEN })
      .update({ data: { status: RESCUE_STATUS.CLOSED_BY_REQUESTER, closedAt: db.serverDate() } })
  } catch (error) {
    console.error('closeOpenRescue failed', openid, gameType, levelNo, error)
  }
}

// A solved rescue must mean the requester's level is solved. Repairs rescues solved before the two writes
// shared one transaction, where the level could stay locked. Cheap when nothing is missing.
const ensureRescuedLevelSolved = async (rescue) => {
  const solved = await db.runTransaction((transaction) =>
    solveLevelInTransaction(transaction, rescue.requesterOpenid, rescue.gameType, rescue.levelNo)
  )
  if (!solved.alreadySolved) {
    await recordCompletionIfCleared(rescue.requesterOpenid, rescue.gameType, solved.solvedCount, await countLevels(rescue.gameType))
  }
}

module.exports = { RESCUE_STATUS, rescueIdFor, closeOpenRescue, ensureRescuedLevelSolved }
