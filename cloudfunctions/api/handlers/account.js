const { cloud, db, _ } = require('../lib/cloud')
const { hashedId } = require('../lib/hashed-id')
const { ERROR_CODES, BusinessError, throwIfFailed } = require('../lib/response')
const { loadRules, sumRewardsByType, toClientRules } = require('../lib/rules')
const { dailyDocId, getTodayRecord, ensureTodayRecord, adRewardCountOf, describeTodayStatus } = require('../lib/daily')
const { isItemType, settleUserItems, toItemsView, changeItemsInTransaction } = require('../lib/items')
const { ITEM_LOG_REASONS, writeItemLogs } = require('../lib/item-log')

const NICKNAME_MAX_LENGTH = 20
const AVATAR_ROOT_DIR = 'avatars'
const CONTENT_CHECK_SCENE_PROFILE = 1
const CONTENT_CHECK_VERSION = 2
const CONTENT_CHECK_PASS = 'pass'

const avatarUploadDirOf = (openid) => `${AVATAR_ROOT_DIR}/${hashedId(openid)}`

const isOwnAvatarFile = (fileId, openid) =>
  typeof fileId === 'string' && fileId.startsWith('cloud://') && fileId.includes(`/${avatarUploadDirOf(openid)}/`)

const assertNicknameSafe = async (openid, nickname) => {
  let suggest
  try {
    const response = await cloud.openapi.security.msgSecCheck({
      openid,
      scene: CONTENT_CHECK_SCENE_PROFILE,
      version: CONTENT_CHECK_VERSION,
      content: nickname
    })
    suggest = response.result && response.result.suggest
  } catch (error) {
    console.error('msgSecCheck failed', error)
    throw new BusinessError(ERROR_CODES.CONTENT_RISKY, '昵称校验暂时不可用，请稍后再试')
  }
  if (suggest !== CONTENT_CHECK_PASS) {
    throw new BusinessError(ERROR_CODES.CONTENT_RISKY, '昵称包含不当内容，请换一个')
  }
}

const deleteReplacedAvatar = async (previousAvatarUrl, nextAvatarUrl, openid) => {
  if (!isOwnAvatarFile(previousAvatarUrl, openid) || previousAvatarUrl === nextAvatarUrl) return
  try {
    await cloud.deleteFile({ fileList: [previousAvatarUrl] })
  } catch (error) {
    console.error('deleteReplacedAvatar failed', previousAvatarUrl, error)
  }
}

const findOrCreateUser = async (openid, rules, now) => {
  const users = db.collection('users')
  try {
    const { data } = await users.doc(openid).get()
    return { user: data, isNewUser: false }
  } catch (error) {
    const newUser = {
      nickname: '',
      avatarUrl: '',
      items: { ...rules.signupItems },
      staminaAnchorAt: now,
      createdAt: db.serverDate(),
      lastLoginAt: db.serverDate()
    }
    try {
      await users.add({ data: { _id: openid, ...newUser } })
    } catch (duplicateError) {
      const { data } = await users.doc(openid).get()
      return { user: data, isNewUser: false }
    }
    await writeItemLogs(openid, rules.signupItems, ITEM_LOG_REASONS.SIGNUP)
    return { user: { _id: openid, ...newUser }, isNewUser: true }
  }
}

const login = async ({ openid }) => {
  const now = Date.now()
  const rules = await loadRules()
  const { user, isNewUser } = await findOrCreateUser(openid, rules, now)
  if (!isNewUser) {
    await db.collection('users').doc(openid).update({ data: { lastLoginAt: db.serverDate() } })
  }
  const todayRecord = await getTodayRecord(openid)
  return {
    isNewUser,
    profile: { nickname: user.nickname, avatarUrl: user.avatarUrl, avatarUploadDir: avatarUploadDirOf(openid) },
    items: toItemsView(settleUserItems(user, rules, now), rules),
    today: describeTodayStatus(todayRecord, rules),
    rules: toClientRules(rules)
  }
}

const updateProfile = async ({ openid, payload }) => {
  const nickname = String(payload.nickname || '').trim()
  const avatarUrl = String(payload.avatarUrl || '')
  if (!nickname || nickname.length > NICKNAME_MAX_LENGTH) {
    throw new BusinessError(ERROR_CODES.BAD_REQUEST, `昵称需为 1-${NICKNAME_MAX_LENGTH} 个字`)
  }
  if (avatarUrl && !isOwnAvatarFile(avatarUrl, openid)) {
    throw new BusinessError(ERROR_CODES.BAD_REQUEST, '头像文件无效，请重新选择')
  }
  const { data: user } = await db.collection('users').doc(openid).get()
  if (nickname !== user.nickname) {
    await assertNicknameSafe(openid, nickname)
  }
  await db.collection('users').doc(openid).update({
    data: { nickname, avatarUrl, updatedAt: db.serverDate() }
  })
  await deleteReplacedAvatar(user.avatarUrl, avatarUrl, openid)
  return { nickname, avatarUrl }
}

const checkin = async ({ openid }) => {
  const now = Date.now()
  const rules = await loadRules()
  const deltas = sumRewardsByType(rules.checkinRewards)
  await ensureTodayRecord(openid)
  const outcome = await db.runTransaction(async (transaction) => {
    const dailyRef = transaction.collection('daily').doc(dailyDocId(openid))
    const { data: todayRecord } = await dailyRef.get()
    if (todayRecord.checkedIn) {
      return { failure: { code: ERROR_CODES.ALREADY_CHECKED_IN, message: '今天已经打过卡了' } }
    }
    const { items } = await changeItemsInTransaction(transaction, openid, deltas, rules, now)
    await dailyRef.update({
      data: { checkedIn: true, checkinRewards: rules.checkinRewards, updatedAt: db.serverDate() }
    })
    return { items }
  })
  throwIfFailed(outcome)
  await writeItemLogs(openid, deltas, ITEM_LOG_REASONS.CHECKIN)
  return { rewards: rules.checkinRewards, items: outcome.items }
}

const grantAdReward = async ({ openid, payload }) => {
  const now = Date.now()
  const { itemType } = payload
  const rules = await loadRules()
  const rewardAmount = rules.ad.rewards[itemType] || 0
  if (!isItemType(itemType) || !rules.ad.enabled || rewardAmount <= 0) {
    throw new BusinessError(ERROR_CODES.AD_UNAVAILABLE, '视频奖励暂未开放')
  }
  const dailyLimit = rules.ad.dailyLimits[itemType] || 0
  await ensureTodayRecord(openid)
  const outcome = await db.runTransaction(async (transaction) => {
    const dailyRef = transaction.collection('daily').doc(dailyDocId(openid))
    const { data: todayRecord } = await dailyRef.get()
    const rewardedCount = adRewardCountOf(todayRecord, itemType)
    if (rewardedCount >= dailyLimit) {
      return { failure: { code: ERROR_CODES.AD_UNAVAILABLE, message: '今天的视频奖励已领完' } }
    }
    const { items } = await changeItemsInTransaction(transaction, openid, { [itemType]: rewardAmount }, rules, now)
    await dailyRef.update({ data: { [`adRewardCounts.${itemType}`]: _.inc(1), updatedAt: db.serverDate() } })
    return { items, adRemaining: dailyLimit - rewardedCount - 1 }
  })
  throwIfFailed(outcome)
  await writeItemLogs(openid, { [itemType]: rewardAmount }, ITEM_LOG_REASONS.AD)
  return { itemType, rewardAmount, items: outcome.items, adRemaining: outcome.adRemaining }
}

module.exports = { login, updateProfile, checkin, grantAdReward }
