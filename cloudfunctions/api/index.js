const { cloud } = require('./lib/cloud')
const { ERROR_CODES, BusinessError, ok, fail } = require('./lib/response')
const account = require('./handlers/account')
const game = require('./handlers/game')
const rescue = require('./handlers/rescue')
const maintenance = require('./handlers/maintenance')
const admin = require('./handlers/admin')
const leaderboard = require('./handlers/leaderboard')
const overview = require('./handlers/overview')
const practice = require('./handlers/practice')
const speech = require('./handlers/speech')
const assets = require('./handlers/assets')
const chests = require('./handlers/chests')
const daily = require('./handlers/daily')

const ROUTES = {
  'account.login': account.login,
  'account.updateProfile': account.updateProfile,
  'account.checkin': account.checkin,
  'account.grantAdReward': account.grantAdReward,
  'account.claimRecoveredStamina': account.claimRecoveredStamina,
  'account.claimDoubleReward': account.claimDoubleReward,
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
  'practice.stats': practice.stats,
  'practice.report': practice.report,
  'practice.reportExam': practice.reportExam,
  'practice.syncProgress': practice.syncProgress,
  'practice.honors': practice.honors,
  'practice.mistakes': practice.mistakes,
  'practice.weekly': practice.weekly,
  'daily.today': daily.today,
  'daily.submit': daily.submit,
  'practice.claimChests': practice.claimChests,
  'chests.list': chests.list,
  'chests.open': chests.open,
  'speech.clipUrls': speech.clipUrls,
  'assets.imageUrls': assets.imageUrls,
  'leaderboard.list': leaderboard.list,
  'admin.stats': admin.stats,
  'admin.switches': admin.switches,
  'admin.updateSwitches': admin.updateSwitches
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
  const { action } = event
  // Handlers read payload fields directly; anything but a plain object (null, array, string) becomes {}.
  const payload = event.payload !== null && typeof event.payload === 'object' && !Array.isArray(event.payload) ? event.payload : {}
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
    return fail(ERROR_CODES.INTERNAL, '哎呀，出了点小问题，再试一次吧')
  }
}
