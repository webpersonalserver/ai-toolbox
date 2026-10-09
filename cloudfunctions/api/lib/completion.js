const { db } = require('./cloud')
const { hashedId } = require('./hashed-id')
const { todayInChina } = require('./date')
const { getProgress, progressDocId } = require('./progress')

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

const syncProgressAfterSolve = async (openid, gameType, totalLevels) => {
  const progress = await getProgress(openid, gameType)
  const solvedCount = progress.solved.length
  if (progress.solvedCount !== solvedCount) {
    await db.collection('progress').doc(progressDocId(openid, gameType)).update({
      data: { solvedCount, lastSolvedAt: db.serverDate() }
    })
  }
  const allCleared = isAllCleared(solvedCount, totalLevels)
  if (allCleared) {
    await recordCompletion(openid, gameType, totalLevels)
  }
  return { progress: { ...progress, solvedCount }, allCleared }
}

module.exports = { isAllCleared, syncProgressAfterSolve }
