const WRONG_FEEDBACK_MS = 600

const buildSlots = (answerLength, revealed) =>
  Array.from({ length: answerLength }, (_, index) => ({
    char: revealed[index] || '',
    boardIndex: -1,
    locked: index < revealed.length
  }))

const buildBoardItems = (board, revealed) => {
  const items = board.map((char) => ({ char, used: false }))
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
    disabled: { type: Boolean, value: false }
  },

  data: {
    slots: [],
    boardItems: [],
    isWrong: false
  },

  observers: {
    'board, answerLength, revealed'(board, answerLength, revealed) {
      this.setData({
        slots: buildSlots(answerLength, revealed),
        boardItems: buildBoardItems(board, revealed),
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
      if (this.data.disabled || boardItems[boardIndex].used || emptySlotIndex === -1) return

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
