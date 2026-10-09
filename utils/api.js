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
  grantAdReward: (itemType) => call('account.grantAdReward', { itemType })
}

const idiom = {
  levelList: () => call('idiom.levelList'),
  summary: () => call('idiom.summary'),
  claimMilestones: () => call('idiom.claimMilestones'),
  solvedBook: (page) => call('idiom.solvedBook', { page }),
  getLevel: (levelNo) => call('idiom.getLevel', { levelNo }),
  startAttempt: (levelNo) => call('idiom.startAttempt', { levelNo }),
  submit: (levelNo, answer) => call('idiom.submit', { levelNo, answer }),
  useHint: (levelNo) => call('idiom.useHint', { levelNo })
}

const rescue = {
  create: (levelNo) => call('rescue.create', { levelNo }),
  view: (rescueId) => call('rescue.view', { rescueId }),
  answer: (rescueId, answer) => call('rescue.answer', { rescueId, answer })
}

module.exports = { ERROR_CODES, ApiError, toastError, account, idiom, rescue }
