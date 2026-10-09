const ERROR_CODES = {
  BAD_REQUEST: 40000,
  INSUFFICIENT_ITEM: 40001,
  ALREADY_CHECKED_IN: 40002,
  LEVEL_LOCKED: 40003,
  LEVEL_ALREADY_SOLVED: 40004,
  HINT_LIMIT_REACHED: 40005,
  AD_UNAVAILABLE: 40006,
  RESCUE_NOT_FOUND: 40007,
  RESCUE_CLOSED: 40008,
  RESCUE_SELF_HELP: 40009,
  ATTEMPT_NOT_ACTIVE: 40010,
  RESCUE_HELPER_DAILY_LIMIT: 40011,
  NO_MILESTONE_TO_CLAIM: 40012,
  RESCUE_NEEDS_ATTEMPT: 40013,
  RESCUE_HELPER_LOCKED: 40014,
  CONTENT_RISKY: 40015,
  FORBIDDEN: 40300,
  NOT_FOUND: 40400,
  INTERNAL: 50000
}

class BusinessError extends Error {
  constructor(code, message, data) {
    super(message)
    this.code = code
    this.data = data
  }
}

const throwIfFailed = (outcome) => {
  if (outcome && outcome.failure) {
    throw new BusinessError(outcome.failure.code, outcome.failure.message)
  }
}

const ok = (data) => ({ code: 0, data })

const fail = (code, message, data) => ({ code, message, data })

module.exports = { ERROR_CODES, BusinessError, throwIfFailed, ok, fail }
