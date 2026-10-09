const { rescue, ERROR_CODES, toastError } = require('../../utils/api')
const { ensureLogin } = require('../../utils/session')
const { DEFAULT_SHARE } = require('../../utils/share')
const { FALLBACK_HELPER_NAME } = require('../../utils/rescue-notice')

const FALLBACK_REQUESTER_NAME = '你的好友'

const RESCUE_STATUS = {
  SOLVED: 'solved',
  CLOSED_BY_REQUESTER: 'closedByRequester'
}

const VIEW_STATES = {
  SOLVED: 'solved',
  CLOSED_BY_REQUESTER: 'closedByRequester',
  OWNER_WAITING: 'ownerWaiting',
  HELPER_DAILY_LIMIT: 'helperDailyLimit',
  HELPER_LOCKED: 'helperLocked',
  ANSWERING: 'answering'
}

const RELOAD_ON_ERRORS = [
  ERROR_CODES.RESCUE_CLOSED,
  ERROR_CODES.RESCUE_HELPER_DAILY_LIMIT,
  ERROR_CODES.RESCUE_HELPER_LOCKED
]

const resolveViewState = (detail) => {
  if (detail.status === RESCUE_STATUS.SOLVED) return VIEW_STATES.SOLVED
  if (detail.status === RESCUE_STATUS.CLOSED_BY_REQUESTER) return VIEW_STATES.CLOSED_BY_REQUESTER
  if (detail.isOwner) return VIEW_STATES.OWNER_WAITING
  if (detail.helperLimitReached) return VIEW_STATES.HELPER_DAILY_LIMIT
  if (detail.helperAttemptsLeft <= 0) return VIEW_STATES.HELPER_LOCKED
  return VIEW_STATES.ANSWERING
}

Page({
  data: {
    loading: true,
    viewState: '',
    rescueId: '',
    isOwner: false,
    requesterName: '',
    requesterAvatar: '',
    helperName: '',
    helperLimitMessage: '',
    helperAttemptsLeft: 0,
    maxWrongAnswersPerHelper: 0,
    levelNo: 0,
    clue: '',
    board: [],
    answerLength: 4,
    solution: null,
    helpedByMe: false,
    submitting: false
  },

  onLoad(query) {
    this.setData({ rescueId: query.id || '' })
    this.loadRescue()
  },

  async loadRescue() {
    try {
      await ensureLogin()
      const detail = await rescue.view(this.data.rescueId)
      this.setData({
        loading: false,
        viewState: resolveViewState(detail),
        isOwner: detail.isOwner,
        requesterName: detail.requester.nickname || FALLBACK_REQUESTER_NAME,
        requesterAvatar: detail.requester.avatarUrl,
        helperName: detail.helperName || FALLBACK_HELPER_NAME,
        helperLimitMessage: detail.helperLimitMessage,
        helperAttemptsLeft: detail.helperAttemptsLeft,
        maxWrongAnswersPerHelper: detail.maxWrongAnswersPerHelper,
        levelNo: detail.puzzle.levelNo,
        clue: detail.puzzle.clue,
        board: detail.puzzle.board,
        answerLength: detail.puzzle.answerLength,
        solution: detail.solution
      })
    } catch (error) {
      this.setData({ loading: false })
      toastError(error)
    }
  },

  async handleComplete(event) {
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      const result = await rescue.answer(this.data.rescueId, event.detail.answer)
      if (result.correct) {
        this.setData({ viewState: VIEW_STATES.SOLVED, helpedByMe: true, solution: result.solution })
      } else if (result.attemptsLeft <= 0) {
        this.setData({ viewState: VIEW_STATES.HELPER_LOCKED, helperAttemptsLeft: 0 })
      } else {
        this.setData({ helperAttemptsLeft: result.attemptsLeft })
        this.selectComponent('#puzzle').showWrongAnswer()
      }
    } catch (error) {
      toastError(error)
      if (RELOAD_ON_ERRORS.includes(error.code)) this.loadRescue()
    } finally {
      this.setData({ submitting: false })
    }
  },

  goPlay() {
    wx.reLaunch({ url: '/pages/idiom/levels/levels' })
  },

  onShareAppMessage() {
    return DEFAULT_SHARE
  }
})
