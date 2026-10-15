const CLOUD_FUNCTION_NAME = 'api'
// Shown when the cloud gives no message of its own; the players are children, so keep it friendly and actionable.
const FALLBACK_ERROR_MESSAGE = '哎呀，出了点小问题，再试一次吧'

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
    throw new ApiError(ERROR_CODES.NETWORK, '网络开小差了，再试一次吧')
  }
  const { code, message, data } = response.result || {}
  if (code !== 0) {
    throw new ApiError(code, message || FALLBACK_ERROR_MESSAGE, data)
  }
  return data
}

const toastError = (error) => {
  wx.showToast({ title: error.message || FALLBACK_ERROR_MESSAGE, icon: 'none' })
}

const account = {
  login: () => call('account.login'),
  updateProfile: (profile) => call('account.updateProfile', profile),
  checkin: () => call('account.checkin'),
  grantAdReward: (itemType) => call('account.grantAdReward', { itemType }),
  claimRecoveredStamina: () => call('account.claimRecoveredStamina'),
  claimDoubleReward: (token) => call('account.claimDoubleReward', { token })
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
  reportExam: (exam) => call('practice.reportExam', exam),
  honors: () => call('practice.honors'),
  syncProgress: (practiceId, progress, practiced) => call('practice.syncProgress', { practiceId, progress, practiced }),
  mistakes: (practiceId, unitId) => call('practice.mistakes', { practiceId, unitId }),
  weekly: () => call('practice.weekly'),
  claimChests: (practiceId) => call('practice.claimChests', { practiceId })
}

const speech = {
  clipUrls: (clipNames) => call('speech.clipUrls', { clipNames })
}

const chests = {
  list: () => call('chests.list'),
  open: (chestIds) => call('chests.open', { chestIds }),
  openAll: () => call('chests.open', { all: true })
}

const assets = {
  imageUrls: (imagePaths) => call('assets.imageUrls', { imagePaths })
}

const leaderboard = {
  list: (gameType) => call('leaderboard.list', { gameType })
}

const admin = {
  stats: (gameType) => call('admin.stats', { gameType }),
  switches: () => call('admin.switches'),
  updateSwitches: (switches) => call('admin.updateSwitches', { switches })
}

// 口算闯关: questions come without answers; each answer is judged in the cloud.
const math = {
  level: (levelNo) => call('math.level', { levelNo }),
  start: (levelNo) => call('math.start', { levelNo }),
  answer: (levelNo, index, answer) => call('math.answer', { levelNo, index, answer }),
  hint: (levelNo) => call('math.hint', { levelNo })
}

// 口算竞速: 60 seconds on one island's questions; the cloud judges the run again when it is handed in.
const sprint = {
  islands: () => call('sprint.islands'),
  start: (islandId) => call('sprint.start', { islandId }),
  finish: (runId, answers) => call('sprint.finish', { runId, answers }),
  board: (islandId) => call('sprint.board', { islandId })
}

const daily = {
  today: () => call('daily.today'),
  submit: (result) => call('daily.submit', result)
}

module.exports = { ERROR_CODES, ApiError, toastError, account, game, rescue, practice, math, sprint, daily, speech, chests, assets, leaderboard, admin }
