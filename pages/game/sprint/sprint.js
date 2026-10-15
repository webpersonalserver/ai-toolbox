const { sprint } = require('../../../utils/api')
const { getSession, setItems } = require('../../../utils/session')
const { runWithItem } = require('../../../utils/item-flow')
const { ISLANDS, unitOf } = require('../../../utils/practice/catalog')
const { createSoundPlayer } = require('../../../utils/practice/sound')
const { sprintSubjectOf } = require('../../../utils/sprint')

// 口算竞速 / 识字竞速 (?subject=math | chinese): pick a track (an island / a grade), answer as many as you can in 60
// seconds. No hints, no friends. Score = right − wrong (never below 0); ties go to fewer wrong answers, then to whoever
// got there first. The cloud judges the run again when handed in.
const STAGES = { LOADING: 'loading', CHOOSE: 'choose', RUNNING: 'running', CHECKING: 'checking', RESULT: 'result', FAILED: 'failed' }
const SECOND_MS = 1000
const RIGHT_PAUSE_MS = 150
const WRONG_PAUSE_MS = 450
const BOARD_PREVIEW = 10
const WARNING_SECONDS = 10

// What a 口算 island covers, in words (口诀岛's 九九 unit is 乘法口诀 here); 识字 tracks bring their own from the cloud.
const scopeOf = (track) => {
  if (track.scope) return track.scope
  const island = ISLANDS.find((candidate) => candidate.id === track.id)
  return island ? island.units.map((unitId) => (unitId === 'multiplication' ? '乘法口诀' : unitOf(unitId).name)).join('、') : ''
}

Page({
  data: {
    stage: STAGES.LOADING,
    subjectId: 'math',
    subjectName: '口算竞速',
    trackWord: '岛',
    chooseText: '选一座岛',
    items: { hint: 0, stamina: 0 },
    islands: [],
    selectedId: '',
    selectedName: '',
    staminaCost: 5,
    weekly: true,
    seconds: 60,
    remaining: 60,
    warning: false,
    score: 0,
    correct: 0,
    wrong: 0,
    question: null,
    locked: false,
    result: null,
    board: null,
    busy: false
  },

  // ?subject=<math | chinese>&island=<track id>: the challenge, and the track chosen first (the board's 「去当第一名」).
  onLoad(query = {}) {
    this.soundPlayer = createSoundPlayer()
    this.timers = []
    const subject = sprintSubjectOf(query.subject)
    wx.setNavigationBarTitle({ title: subject.name })
    this.setData({ subjectId: subject.id, subjectName: subject.name, trackWord: subject.trackWord, chooseText: subject.chooseText, selectedId: query.island || '' })
    this.load()
  },

  onShow() {
    this.syncItems()
  },

  onUnload() {
    this.stopClock()
    wx.disableAlertBeforeUnload()
    this.timers.forEach((timer) => clearTimeout(timer))
    this.soundPlayer.destroy()
  },

  later(callback, delayMs) {
    this.timers.push(setTimeout(callback, delayMs))
  },

  syncItems() {
    const session = getSession()
    if (session) this.setData({ items: session.items })
  },

  async load() {
    try {
      const info = await sprint.islands(this.data.subjectId)
      const islands = info.islands.map((island) => ({ ...island, scope: scopeOf(island), bestText: island.best === null ? '还没挑战过' : `${info.weekly ? '本周' : ''}最好 ${island.best} 分` }))
      const selectedId = islands.some((island) => island.id === this.data.selectedId) ? this.data.selectedId : islands[0].id
      // Refreshing the bests after a run must not take the child off the result card.
      const stage = this.data.stage === STAGES.RESULT ? STAGES.RESULT : STAGES.CHOOSE
      this.setData({ stage, islands, staminaCost: info.staminaCost, weekly: info.weekly, seconds: info.seconds })
      this.select(selectedId)
    } catch (error) {
      console.error('[sprint] islands unavailable', error)
      this.setData({ stage: STAGES.FAILED })
    }
  },

  chooseIsland(event) {
    this.select(event.currentTarget.dataset.id)
  },

  select(islandId) {
    const island = this.data.islands.find((candidate) => candidate.id === islandId)
    this.setData({ selectedId: islandId, selectedName: island.name, board: null })
    this.loadBoard(islandId)
  },

  async loadBoard(islandId) {
    try {
      const board = await sprint.board(islandId)
      if (islandId !== this.data.selectedId) return
      this.setData({ board: { ...board, entries: board.entries.slice(0, BOARD_PREVIEW) } })
    } catch (error) {
      console.error('[sprint] board unavailable', error)
    }
  },

  async start() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      const run = await runWithItem(() => sprint.start(this.data.selectedId))
      if (!run) return
      if (run.items) setItems(run.items)
      this.syncItems()
      this.run = run
      this.answers = []
      this.endsAt = Date.now() + run.seconds * SECOND_MS
      this.soundPlayer.play('gong')
      this.setData({ stage: STAGES.RUNNING, remaining: run.seconds, warning: false, score: 0, correct: 0, wrong: 0, result: null })
      this.showQuestion(0)
      // Leaving mid-run forfeits it (the stamina is already spent), so the back button asks first.
      wx.enableAlertBeforeUnload({ message: '比赛还没结束，现在离开这局就作废了，确定吗？' })
      this.clock = setInterval(() => this.tick(), SECOND_MS / 4)
    } finally {
      this.setData({ busy: false })
    }
  },

  stopClock() {
    clearInterval(this.clock)
    this.clock = null
  },

  tick() {
    const remaining = Math.max(Math.ceil((this.endsAt - Date.now()) / SECOND_MS), 0)
    if (remaining !== this.data.remaining) this.setData({ remaining, warning: remaining <= WARNING_SECONDS })
    if (remaining <= 0) this.finish()
  },

  showQuestion(index) {
    const question = this.run.questions[index]
    if (!question) return this.finish()
    // 口算 questions are sums typed on the keypad; 识字 questions come as type 'hanzi' with four choices.
    this.setData({ question: { type: 'equation', ...question, id: `${this.run.runId}-${index}`, revealText: '' }, locked: false })
  },

  // Every answer moves on: right quickly, wrong after a short shake. Score is right − wrong.
  handleAnswered(event) {
    if (this.data.stage !== STAGES.RUNNING || this.data.locked) return
    const { correct, value } = event.detail
    const index = this.answers.length
    this.answers.push({ index, answer: value })
    const tally = { correct: this.data.correct + (correct ? 1 : 0), wrong: this.data.wrong + (correct ? 0 : 1) }
    this.setData({ ...tally, score: Math.max(tally.correct - tally.wrong, 0), locked: true })
    this.soundPlayer.play(correct ? 'correct' : 'wrong')
    this.later(() => {
      if (this.data.stage === STAGES.RUNNING) this.showQuestion(index + 1)
    }, correct ? RIGHT_PAUSE_MS : WRONG_PAUSE_MS)
  },

  handleEmpty() {
    wx.showToast({ title: '先按数字，再点确定', icon: 'none' })
  },

  async finish() {
    if (this.data.stage !== STAGES.RUNNING) return
    this.stopClock()
    wx.disableAlertBeforeUnload()
    this.setData({ stage: STAGES.CHECKING, locked: true })
    try {
      const outcome = await sprint.finish(this.run.runId, this.answers)
      this.soundPlayer.play(outcome.isNewBest ? 'milestone' : 'correct')
      this.setData({ stage: STAGES.RESULT, result: outcome })
      this.load()
    } catch (error) {
      console.error('[sprint] run not saved', error)
      this.setData({ stage: STAGES.RESULT, result: { counted: false, message: '网络不太好，这次成绩没保存上' } })
    }
  },

  again() {
    this.start()
  },

  backToIslands() {
    this.setData({ stage: STAGES.CHOOSE, result: null })
  }
})
