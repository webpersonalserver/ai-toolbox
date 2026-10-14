const WRONG_FEEDBACK_MS = 600

const THINKING_LINES = ['让我翻翻字典…', '嗯，有点意思…', '答案马上揭晓…', '小书童正在核对…', '容我想一想…', '好像有戏…']

const pickThinkingLine = () => THINKING_LINES[Math.floor(Math.random() * THINKING_LINES.length)]

const SLOT_SIZE_BY_LENGTH = [
  { maxLength: 4, sizeClass: '' },
  { maxLength: 5, sizeClass: 'char-puzzle__slots--medium' },
  { maxLength: Infinity, sizeClass: 'char-puzzle__slots--small' }
]

const slotSizeClassOf = (answerLength) =>
  SLOT_SIZE_BY_LENGTH.find((rule) => answerLength <= rule.maxLength).sizeClass

// answerPinyin (拼音辅助): one syllable shown over each answer cell; empty when the game has none.
const buildSlots = (answerLength, revealed, answerPinyin) =>
  Array.from({ length: answerLength }, (_, index) => ({
    pinyin: answerPinyin[index] || '',
    char: revealed[index] || '',
    boardIndex: -1,
    locked: index < revealed.length
  }))

const buildBoardItems = (board, revealed, eliminated) => {
  const eliminatedSet = new Set(eliminated)
  const items = board.map((char, index) => ({ char, used: false, eliminated: eliminatedSet.has(index) }))
  revealed.forEach((char) => {
    const match = items.find((item) => !item.used && item.char === char)
    if (match) match.used = true
  })
  return items
}

Component({
  properties: {
    board: { type: Array, value: [] },
    answerLength: { type: Number, value: 4 },
    revealed: { type: Array, value: [] },
    eliminated: { type: Array, value: [] },
    answerPinyin: { type: Array, value: [] },
    columns: { type: Number, value: 6 },
    disabled: { type: Boolean, value: false },
    checking: { type: Boolean, value: false }
  },

  data: {
    slots: [],
    boardItems: [],
    slotSizeClass: '',
    hasPinyin: false,
    thinkingLine: '',
    isWrong: false
  },

  observers: {
    checking(checking) {
      if (checking) this.setData({ thinkingLine: pickThinkingLine() })
    },
    'board, answerLength, revealed, eliminated, answerPinyin'(board, answerLength, revealed, eliminated, answerPinyin) {
      this.setData({
        hasPinyin: answerPinyin.length > 0,
        slots: buildSlots(answerLength, revealed, answerPinyin),
        boardItems: buildBoardItems(board, revealed, eliminated),
        slotSizeClass: slotSizeClassOf(answerLength),
        isWrong: false
      })
    }
  },

  lifetimes: {
    detached() {
      clearTimeout(this.wrongFeedbackTimer)
    }
  },

  methods: {
    handleBoardTap(event) {
      const boardIndex = event.currentTarget.dataset.index
      const { slots, boardItems } = this.data
      const emptySlotIndex = slots.findIndex((slot) => !slot.char)
      const item = boardItems[boardIndex]
      if (this.data.disabled || item.used || item.eliminated || emptySlotIndex === -1) return

      this.setData({
        [`slots[${emptySlotIndex}].char`]: boardItems[boardIndex].char,
        [`slots[${emptySlotIndex}].boardIndex`]: boardIndex,
        [`boardItems[${boardIndex}].used`]: true
      })
      if (this.data.slots.every((slot) => slot.char)) {
        this.triggerEvent('complete', { answer: this.data.slots.map((slot) => slot.char).join('') })
      }
    },

    handleSlotTap(event) {
      const slotIndex = event.currentTarget.dataset.index
      const slot = this.data.slots[slotIndex]
      if (this.data.disabled || slot.locked || !slot.char) return
      this.setData({
        [`slots[${slotIndex}].char`]: '',
        [`slots[${slotIndex}].boardIndex`]: -1,
        [`boardItems[${slot.boardIndex}].used`]: false
      })
    },

    clearAttempt() {
      const changes = {}
      this.data.slots.forEach((slot, index) => {
        if (slot.locked || !slot.char) return
        changes[`slots[${index}].char`] = ''
        changes[`slots[${index}].boardIndex`] = -1
        changes[`boardItems[${slot.boardIndex}].used`] = false
      })
      this.setData(changes)
    },

    showWrongAnswer() {
      this.setData({ isWrong: true })
      clearTimeout(this.wrongFeedbackTimer)
      this.wrongFeedbackTimer = setTimeout(() => {
        this.setData({ isWrong: false })
        this.clearAttempt()
      }, WRONG_FEEDBACK_MS)
    }
  }
})
