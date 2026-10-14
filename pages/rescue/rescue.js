const { rescue, ERROR_CODES, toastError } = require('../../utils/api')
const { ensureLogin } = require('../../utils/session')
const { DEFAULT_SHARE } = require('../../utils/share')
const { FALLBACK_HELPER_NAME } = require('../../utils/rescue-notice')
const { gameConfigOf, clueLabelOf, describePoemSource, splitTypoClue } = require('../../utils/games')
const { splitClue } = require('../../utils/clue')
const { withMinimumDuration } = require('../../utils/min-duration')
const { createSoundPlayer } = require('../../utils/practice/sound')

const MIN_CHECKING_MS = 550

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

const describeHelperBlock = (viewState, detail) => {
  if (viewState === VIEW_STATES.HELPER_DAILY_LIMIT) return detail.helperLimitMessage
  if (viewState === VIEW_STATES.HELPER_LOCKED) return `${detail.maxWrongAnswersPerHelper} 颗❤️ 用完啦，这道题你帮不上啦`
  return ''
}

Page({
  data: {
    loading: true,
    gameType: '',
    game: null,
    poemSource: '',
    clueChars: [],
    clueHint: '',
    meaning: '',
    answerPinyin: [],
    hanziKind: '',
    clueLabel: '',
    clueSegments: [],
    clueHintSegments: [],
    viewState: '',
    rescueId: '',
    isOwner: false,
    requesterName: '',
    requesterAvatar: '',
    helperName: '',
    helperLimitMessage: '',
    helperAttemptsLeft: 0,
    helperBlocked: false,
    helperBlockedMessage: '',
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
    this.soundPlayer = createSoundPlayer()
    this.setData({ rescueId: query.id || '' })
    this.loadRescue()
  },

  onUnload() {
    this.soundPlayer.destroy()
  },

  async loadRescue() {
    try {
      await ensureLogin()
      const detail = await rescue.view(this.data.rescueId)
      const viewState = resolveViewState(detail)
      const helperBlockedMessage = describeHelperBlock(viewState, detail)
      this.setData({
        loading: false,
        viewState,
        helperBlocked: Boolean(helperBlockedMessage),
        helperBlockedMessage,
        isOwner: detail.isOwner,
        requesterName: detail.requester.nickname || FALLBACK_REQUESTER_NAME,
        requesterAvatar: detail.requester.avatarUrl,
        helperName: detail.helperName || FALLBACK_HELPER_NAME,
        helperLimitMessage: detail.helperLimitMessage,
        helperAttemptsLeft: detail.helperAttemptsLeft,
        maxWrongAnswersPerHelper: detail.maxWrongAnswersPerHelper,
        gameType: detail.gameType,
        game: gameConfigOf(detail.gameType),
        poemSource: describePoemSource(detail.puzzle),
        clueChars: splitTypoClue(detail.puzzle.clue, detail.puzzle.wrongPosition),
        clueHint: detail.puzzle.clueHint || '',
        meaning: detail.puzzle.meaning || '',
        answerPinyin: detail.puzzle.answerPinyin || [],
        hanziKind: detail.puzzle.kind || '',
        clueLabel: clueLabelOf(gameConfigOf(detail.gameType), detail.puzzle),
        clueSegments: splitClue(detail.puzzle.clue),
        clueHintSegments: splitClue(detail.puzzle.clueHint),
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
      const result = await withMinimumDuration(() => rescue.answer(this.data.rescueId, event.detail.answer), MIN_CHECKING_MS)
      if (result.correct) {
        // Helping a friend is the best moment on this page, so it gets the same sound and buzz as passing a level.
        this.soundPlayer.play('correct')
        wx.vibrateShort({ type: 'heavy' })
        this.setData({ viewState: VIEW_STATES.SOLVED, helpedByMe: true, solution: result.solution })
        return
      }
      this.soundPlayer.play('wrong')
      if (result.attemptsLeft <= 0) {
        this.setData({
          viewState: VIEW_STATES.HELPER_LOCKED,
          helperAttemptsLeft: 0,
          helperBlocked: true,
          helperBlockedMessage: describeHelperBlock(VIEW_STATES.HELPER_LOCKED, this.data)
        })
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
    wx.reLaunch({ url: `/pages/game/levels/levels?gameType=${this.data.gameType}` })
  },

  onShareAppMessage() {
    return DEFAULT_SHARE
  }
})
