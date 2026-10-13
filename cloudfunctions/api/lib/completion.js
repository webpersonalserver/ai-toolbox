const { db } = require('./cloud')
const { hashedId } = require('./hashed-id')
const { todayInChina } = require('./date')
const { progressDocId } = require('./progress')

const isAllCleared = (solvedCount, totalLevels) => totalLevels > 0 && solvedCount >= totalLevels

const completionDocId = (openid, gameType, totalLevels) => hashedId(`${openid}:${gameType}:${totalLevels}`)

const recordCompletion = async (openid, gameType, totalLevels) => {
  let nickname = ''
  try {
    const { data: user } = await db.collection('users').doc(openid).get()
    nickname = user.nickname
  } catch (error) {
    nickname = ''
  }
  try {
    await db.collection('completions').add({
      data: {
        _id: completionDocId(openid, gameType, totalLevels),
        openid,
        nickname,
        gameType,
        totalLevels,
        date: todayInChina(),
        completedAt: db.serverDate()
      }
    })
  } catch (duplicateError) {
    return
  }
}

// After a solve transaction: records the clear when every level is done (idempotent, safe to call again).
const recordCompletionIfCleared = async (openid, gameType, solvedCount, totalLevels) => {
  const allCleared = isAllCleared(solvedCount, totalLevels)
  if (allCleared) await recordCompletion(openid, gameType, totalLevels)
  return allCleared
}

/**
 * Repairs data written before solves were fully transactional (or a clear record that failed to write):
 * solvedCount is brought back in line with the solved list, and a missing clear record is added.
 */
const healProgress = async (openid, gameType, progress, totalLevels) => {
  const solvedCount = progress.solved.length
  if (progress.solvedCount !== solvedCount) {
    await db.collection('progress').doc(progressDocId(openid, gameType)).update({ data: { solvedCount } })
  }
  await recordCompletionIfCleared(openid, gameType, solvedCount, totalLevels)
}

module.exports = { isAllCleared, recordCompletionIfCleared, healProgress }
