const CLOUD_FUNCTION_NAME = 'api'

const ERROR_CODES = {
  NETWORK: -1,
  INSUFFICIENT_ITEM: 40001,
  ALREADY_CHECKED_IN: 40002,
  LEVEL_LOCKED: 40003,
  RESCUE_CLOSED: 40008,
  RESCUE_HELPER_DAILY_LIMIT: 40011,
  RESCUE_NEEDS_ATTEMPT: 40013,
  RESCUE_HELPER_LOCKED: 40014
}

class ApiError extends Error {
  constructor(code, message, data) {
    super(message)
    this.code = code
    this.data = data
  }
}

const call = async (action, payload = {}) => {
  let response
  try {
    response = await wx.cloud.callFunction({ name: CLOUD_FUNCTION_NAME, data: { action, payload } })
  } catch (error) {
    console.error(`[api] ${action} failed`, error)
    throw new ApiError(ERROR_CODES.NETWORK, '网络不太好，请稍后再试')
  }
  const { code, message, data } = response.result || {}
  if (code !== 0) {
    throw new ApiError(code, message || '请求失败', data)
  }
  return data
}

const toastError = (error) => {
  wx.showToast({ title: error.message || '出错了', icon: 'none' })
}

const account = {
  login: () => call('account.login'),
  updateProfile: (profile) => call('account.updateProfile', profile),
  checkin: () => call('account.checkin'),
  grantAdReward: (itemType) => call('account.grantAdReward', { itemType }),
  claimRecoveredStamina: () => call('account.claimRecoveredStamina')
}

const game = {
  overview: () => call('game.overview'),
  levelList: (gameType) => call('game.levelList', { gameType }),
  summary: (gameType) => call('game.summary', { gameType }),
  claimMilestones: (gameType) => call('game.claimMilestones', { gameType }),
  solvedBook: (gameType, page) => call('game.solvedBook', { gameType, page }),
  getLevel: (gameType, levelNo) => call('game.getLevel', { gameType, levelNo }),
  startAttempt: (gameType, levelNo) => call('game.startAttempt', { gameType, levelNo }),
  submit: (gameType, levelNo, answer) => call('game.submit', { gameType, levelNo, answer }),
  useHint: (gameType, levelNo) => call('game.useHint', { gameType, levelNo })
}

const rescue = {
  create: (gameType, levelNo) => call('rescue.create', { gameType, levelNo }),
  view: (rescueId) => call('rescue.view', { rescueId }),
  answer: (rescueId, answer) => call('rescue.answer', { rescueId, answer })
}

const practice = {
  stats: (practiceId) => call('practice.stats', { practiceId }),
  report: (report) => call('practice.report', report),
  syncProgress: (practiceId, progress) => call('practice.syncProgress', { practiceId, progress }),
  claimChests: (practiceId) => call('practice.claimChests', { practiceId })
}

const leaderboard = {
  list: (gameType) => call('leaderboard.list', { gameType })
}

const admin = {
  stats: (gameType) => call('admin.stats', { gameType })
}

module.exports = { ERROR_CODES, ApiError, toastError, account, game, rescue, practice, leaderboard, admin }
