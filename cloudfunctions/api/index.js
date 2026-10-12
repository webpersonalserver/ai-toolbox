const { cloud } = require('./lib/cloud')
const { ERROR_CODES, BusinessError, ok, fail } = require('./lib/response')
const account = require('./handlers/account')
const game = require('./handlers/game')
const rescue = require('./handlers/rescue')
const maintenance = require('./handlers/maintenance')
const admin = require('./handlers/admin')
const leaderboard = require('./handlers/leaderboard')
const overview = require('./handlers/overview')

const ROUTES = {
  'account.login': account.login,
  'account.updateProfile': account.updateProfile,
  'account.checkin': account.checkin,
  'account.grantAdReward': account.grantAdReward,
  'game.overview': overview.overview,
  'game.levelList': game.levelList,
  'game.summary': game.summary,
  'game.claimMilestones': game.claimMilestones,
  'game.solvedBook': game.solvedBook,
  'game.getLevel': game.getLevel,
  'game.startAttempt': game.startAttempt,
  'game.submit': game.submit,
  'game.useHint': game.useHint,
  'rescue.create': rescue.create,
  'rescue.view': rescue.view,
  'rescue.answer': rescue.answer,
  'leaderboard.list': leaderboard.list,
  'admin.stats': admin.stats
}

const KNOWN_ERROR_CODES = new Set(Object.values(ERROR_CODES))

const TIMER_TRIGGERS = {
  cleanupExpiredRecords: maintenance.cleanupExpiredRecords,
  snapshotStats: maintenance.snapshotStats
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const isTimerInvocation = !OPENID && event.Type === 'Timer'
  if (isTimerInvocation) {
    const trigger = TIMER_TRIGGERS[event.TriggerName]
    return trigger ? ok(await trigger()) : fail(ERROR_CODES.BAD_REQUEST, `未知定时任务: ${event.TriggerName}`)
  }
  if (!OPENID) {
    return fail(ERROR_CODES.BAD_REQUEST, '缺少用户身份')
  }
  const { action, payload = {} } = event
  const handler = ROUTES[action]
  if (!handler) {
    return fail(ERROR_CODES.BAD_REQUEST, `未知操作: ${action}`)
  }
  try {
    return ok(await handler({ openid: OPENID, payload }))
  } catch (error) {
    if (error instanceof BusinessError || KNOWN_ERROR_CODES.has(error.code)) {
      return fail(error.code, error.message, error.data)
    }
    console.error(`[${action}] failed`, payload, error)
    return fail(ERROR_CODES.INTERNAL, '服务开小差了，请稍后再试')
  }
}
