const WRONG_SHAKE_MS = 450
const SYMBOLS = ['×', '÷', '+', '−', '=']
const WORDS = ['分成', '和', '合成']
// Long equations (连加连减, 三位数) shrink so they stay on one line.
const COMPACT_CHARACTERS = 8
const COMPACT_TOKENS = 5
const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'delete', '0', 'confirm']

const tokenKindOf = (token) => {
  if (token === '') return 'blank'
  if (WORDS.includes(token)) return 'word'
  return SYMBOLS.includes(token) ? 'symbol' : 'number'
}

const isCompact = (tokens, maxDigits) => {
  const characters = tokens.reduce((total, token) => total + (token === '' ? maxDigits : token.length), 0)
  return characters > COMPACT_CHARACTERS || tokens.length > COMPACT_TOKENS
}

// Shows one question (numeric keypad, or buttons when the question has choices: verses, > < =) and reports each
// answer; the page decides what happens next. Used by 九九神功 (default look) and the 数理乐园 exam (plain look).
Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    question: { type: Object, value: null },
    locked: { type: Boolean, value: false },
    revealed: { type: Boolean, value: false },
    plain: { type: Boolean, value: false },
    confirmText: { type: String, value: '出招' },
    maxDigits: { type: Number, value: 2 },
    // 'remote': the question carries no answer; the page judges (口算闯关 asks the cloud) and calls markAnswer().
    judge: { type: String, value: 'local' }
  },

  data: {
    keypad: KEYPAD,
    tokens: [],
    compact: false,
    input: '',
    state: 'idle',
    pickedChoice: ''
  },

  observers: {
    question(question) {
      clearTimeout(this.clearTimer)
      const tokens = question && question.tokens ? question.tokens.map((text) => ({ text, kind: tokenKindOf(text) })) : []
      const compact = Boolean(question && question.tokens) && isCompact(question.tokens, question.maxDigits || this.data.maxDigits)
      this.setData({ tokens, compact, input: '', state: 'idle', pickedChoice: '' })
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
      return this.data.locked || ['correct', 'revealed', 'checking'].includes(this.data.state)
    },

    handleKey(event) {
      if (this.isBusy()) return
      const { key } = event.currentTarget.dataset
      if (key === 'confirm') return this.submit(this.data.input)
      if (key === 'delete') return this.setData({ input: this.data.input.slice(0, -1), state: 'idle' })
      const current = this.data.input === '0' ? '' : this.data.input
      if (current.length >= this.data.maxDigits) return
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
      if (this.data.judge === 'remote') {
        this.setData({ state: 'checking' })
        this.triggerEvent('submitted', { value })
        return
      }
      this.markAnswer(value === this.data.question.answer, value)
    },

    // The page could not get a verdict (network): let the child answer again.
    resetAnswer() {
      this.setData({ state: 'idle' })
    },

    // Shows a verdict: right stays green, wrong shakes and clears for another try.
    markAnswer(correct, value = '') {
      this.setData({ state: correct ? 'correct' : 'wrong' })
      this.triggerEvent('answered', { correct, value })
      if (correct) return
      this.clearTimer = setTimeout(() => {
        if (this.data.state === 'wrong') this.setData({ input: '', pickedChoice: '', state: 'idle' })
      }, WRONG_SHAKE_MS)
    }
  }
})
