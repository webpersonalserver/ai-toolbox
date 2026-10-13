const { db, _ } = require('../lib/cloud')
const { CONTENT_SCENES, isTextSafe } = require('../lib/wechat-api')
const { isStoredFileIn, removeFile } = require('../lib/storage')
const { hashedId } = require('../lib/hashed-id')
const { generateNickname } = require('../lib/nickname')
const { ERROR_CODES, BusinessError, throwIfFailed } = require('../lib/response')
const { loadRules, sumRewardsByType, toClientRules } = require('../lib/rules')
const { dailyDocId, getTodayRecord, ensureTodayRecord, adRewardCountOf, describeTodayStatus } = require('../lib/daily')
const {
  ITEM_TYPES,
  isItemType,
  settleUserItems,
  toItemsView,
  changeItemsInTransaction,
  claimPendingStaminaInTransaction
} = require('../lib/items')
const { ITEM_LOG_REASONS, writeItemLogs } = require('../lib/item-log')
const { isAdmin } = require('./admin')
const { issueDoubleOffer, claimDoubleOffer } = require('../lib/double-reward')
const { recordAdView } = require('../lib/ad-stats')

const NICKNAME_MAX_LENGTH = 20
const AVATAR_ROOT_DIR = 'avatars'

const avatarUploadDirOf = (openid) => `${AVATAR_ROOT_DIR}/${hashedId(openid)}`

const isOwnAvatarFile = (fileId, openid) => isStoredFileIn(fileId, avatarUploadDirOf(openid))

const assertNicknameSafe = async (openid, nickname) => {
  let safe
  try {
    safe = await isTextSafe(openid, nickname, CONTENT_SCENES.PROFILE)
  } catch (error) {
    console.error('nickname content check failed', error)
    throw new BusinessError(ERROR_CODES.CONTENT_RISKY, '昵称校验暂时不可用，请稍后再试')
  }
  if (!safe) {
    throw new BusinessError(ERROR_CODES.CONTENT_RISKY, '昵称包含不当内容，请换一个')
  }
}

const deleteReplacedAvatar = async (previousAvatarUrl, nextAvatarUrl, openid) => {
  if (!isOwnAvatarFile(previousAvatarUrl, openid) || previousAvatarUrl === nextAvatarUrl) return
  await removeFile(previousAvatarUrl)
}

const findOrCreateUser = async (openid, rules, now) => {
  const users = db.collection('users')
  try {
    const { data } = await users.doc(openid).get()
    return { user: data, isNewUser: false }
  } catch (error) {
    const newUser = {
      nickname: generateNickname(openid),
      avatarUrl: '',
      profileCustomized: false,
      items: { ...rules.signupItems },
      staminaPending: 0,
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
    const backfill = user.nickname ? {} : { nickname: generateNickname(openid), profileCustomized: false }
    await db.collection('users').doc(openid).update({ data: { lastLoginAt: db.serverDate(), ...backfill } })
    Object.assign(user, backfill)
  }
  const todayRecord = await getTodayRecord(openid)
  return {
    isNewUser,
    openid,
    isAdmin: isAdmin(rules, openid),
    profile: {
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      avatarUploadDir: avatarUploadDirOf(openid),
      customized: Boolean(user.profileCustomized)
    },
    items: toItemsView(settleUserItems(user, rules, now), rules, now),
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
    data: { nickname, avatarUrl, profileCustomized: true, updatedAt: db.serverDate() }
  })
  await deleteReplacedAvatar(user.avatarUrl, avatarUrl, openid)
  return { nickname, avatarUrl, customized: true }
}

const checkin = async ({ openid }) => {
  const now = Date.now()
  const rules = await loadRules()
  const deltas = sumRewardsByType(rules.checkinRewards)
  const dateKey = await ensureTodayRecord(openid)
  const outcome = await db.runTransaction(async (transaction) => {
    const dailyRef = transaction.collection('daily').doc(dailyDocId(openid, dateKey))
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
  const doubleToken = await issueDoubleOffer(openid, rules.checkinRewards, 'checkin', rules)
  return { rewards: rules.checkinRewards, items: outcome.items, doubleToken }
}

const grantAdReward = async ({ openid, payload }) => {
  const now = Date.now()
  const { itemType } = payload
  const rules = await loadRules()
  const rewardAmount = rules.ad.rewards[itemType] || 0
  if (!isItemType(itemType) || !rules.ad.enabled || rewardAmount <= 0) {
    throw new BusinessError(ERROR_CODES.AD_UNAVAILABLE, '视频奖励暂未开放')
  }
  const dailyLimit = rules.ad.dailyLimits[itemType]
  const isUnlimited = dailyLimit === null
  const dateKey = await ensureTodayRecord(openid)
  const outcome = await db.runTransaction(async (transaction) => {
    const dailyRef = transaction.collection('daily').doc(dailyDocId(openid, dateKey))
    const { data: todayRecord } = await dailyRef.get()
    const rewardedCount = adRewardCountOf(todayRecord, itemType)
    if (!isUnlimited && rewardedCount >= (dailyLimit || 0)) {
      return { failure: { code: ERROR_CODES.AD_UNAVAILABLE, message: '今天的视频奖励已领完' } }
    }
    const { items } = await changeItemsInTransaction(transaction, openid, { [itemType]: rewardAmount }, rules, now)
    await dailyRef.update({ data: { [`adRewardCounts.${itemType}`]: _.inc(1), adViews: _.inc(1), updatedAt: db.serverDate() } })
    return { items, adRemaining: isUnlimited ? null : dailyLimit - rewardedCount - 1, isFirstViewToday: !(todayRecord.adViews > 0) }
  })
  throwIfFailed(outcome)
  await recordAdView(itemType, outcome.isFirstViewToday)
  await writeItemLogs(openid, { [itemType]: rewardAmount }, ITEM_LOG_REASONS.AD)
  return { itemType, rewardAmount, items: outcome.items, adRemaining: outcome.adRemaining }
}

const claimRecoveredStamina = async ({ openid }) => {
  const now = Date.now()
  const rules = await loadRules()
  const outcome = await db.runTransaction((transaction) => claimPendingStaminaInTransaction(transaction, openid, rules, now))
  if (outcome.claimed <= 0) {
    throw new BusinessError(ERROR_CODES.NOTHING_TO_CLAIM, '还没有恢复的体力可以领取')
  }
  await writeItemLogs(openid, { [ITEM_TYPES.STAMINA]: outcome.claimed }, ITEM_LOG_REASONS.RECOVERY)
  const doubleToken = await issueDoubleOffer(openid, [{ type: ITEM_TYPES.STAMINA, amount: outcome.claimed }], 'recovery', rules, {
    minAmount: rules.ad.recoveryDoubleMinAmount
  })
  return { ...outcome, doubleToken }
}

const claimDoubleReward = async ({ openid, payload }) => claimDoubleOffer(openid, payload.token, await loadRules())

module.exports = { login, updateProfile, checkin, grantAdReward, claimRecoveredStamina, claimDoubleReward }
