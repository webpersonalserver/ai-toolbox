const { db } = require('./cloud')
const { hashedId } = require('./hashed-id')

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

module.exports = { RESCUE_STATUS, rescueIdFor, closeOpenRescue }
