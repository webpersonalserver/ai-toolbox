const MAX_INPUT_DIGITS = 2
const WRONG_SHAKE_MS = 450
const SYMBOLS = ['×', '=']
const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'delete', '0', 'confirm']

const tokenKindOf = (token) => {
  if (token === '') return 'blank'
  return SYMBOLS.includes(token) ? 'symbol' : 'number'
}

// Shows one 口诀 question (numeric keypad or verse choices) and reports each answer; the page decides what happens next.
Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    question: { type: Object, value: null },
    locked: { type: Boolean, value: false },
    revealed: { type: Boolean, value: false }
  },

  data: {
    keypad: KEYPAD,
    tokens: [],
    input: '',
    state: 'idle',
    pickedChoice: ''
  },

  observers: {
    question(question) {
      clearTimeout(this.clearTimer)
      const tokens = question && question.tokens ? question.tokens.map((text) => ({ text, kind: tokenKindOf(text) })) : []
      this.setData({ tokens, input: '', state: 'idle', pickedChoice: '' })
    },
    revealed(revealed) {
      if (!revealed || !this.data.question) return
      clearTimeout(this.clearTimer)
      this.setData({ state: 'revealed', input: this.data.question.answer, pickedChoice: this.data.question.answer })
    }
  },

  lifetimes: {
    detached() {
      clearTimeout(this.clearTimer)
    }
  },

  methods: {
    isBusy() {
      return this.data.locked || this.data.state === 'correct' || this.data.state === 'revealed'
    },

    handleKey(event) {
      if (this.isBusy()) return
      const { key } = event.currentTarget.dataset
      if (key === 'confirm') return this.submit(this.data.input)
      if (key === 'delete') return this.setData({ input: this.data.input.slice(0, -1), state: 'idle' })
      const current = this.data.input === '0' ? '' : this.data.input
      if (current.length >= MAX_INPUT_DIGITS) return
      this.setData({ input: current + key, state: 'idle' })
    },

    pickChoice(event) {
      if (this.isBusy()) return
      const { choice } = event.currentTarget.dataset
      this.setData({ pickedChoice: choice, input: choice })
      this.submit(choice)
    },

    submit(value) {
      if (value === '') {
        this.triggerEvent('empty')
        return
      }
      const correct = value === this.data.question.answer
      this.setData({ state: correct ? 'correct' : 'wrong' })
      this.triggerEvent('answered', { correct })
      if (correct) return
      this.clearTimer = setTimeout(() => {
        if (this.data.state === 'wrong') this.setData({ input: '', pickedChoice: '', state: 'idle' })
      }, WRONG_SHAKE_MS)
    }
  }
})
