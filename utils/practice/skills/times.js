// Skill: 乘法口诀 inside the 9×9 table ("3 × 7 = ?", "? × 4 = 28", "6 × ? = 42"), explained with the verse.
// Used by the lobby challenges (口算闯关, 口算竞速); 数理乐园 itself teaches the table in 九九神功.
const { randomInt, pick, step, isWholeNumber } = require('./shared')
const { factOf } = require('../multiplication')

const BLANKS = ['result', 'result', 'result', 'left', 'right']
const MIN_FACTOR = 1
const MAX_FACTOR = 9
// Multiplying by 1 teaches little, so it is kept rare.
const ONE_RATIO = 0.08

const buildQuestion = ({ left, right, blank }) => {
  const product = left * right
  const values = { left, right, result: product }
  const cell = (field) => (blank === field ? '' : String(values[field]))
  return {
    key: `${left}x${right}:${blank}`,
    left,
    right,
    product,
    blank,
    answer: String(values[blank]),
    tokens: [cell('left'), '×', cell('right'), '=', cell('result')],
    equation: `${left} × ${right} = ${product}`,
    maxDigits: 2
  }
}

const factor = (rng) => (rng() < ONE_RATIO ? 1 : randomInt(rng, 2, MAX_FACTOR))

const generate = (options, { rng = Math.random, previousKey = '' } = {}) => {
  let question = null
  do {
    question = buildQuestion({ left: factor(rng), right: factor(rng), blank: pick(rng, BLANKS) })
  } while (question.key === previousKey)
  return question
}

const check = (question, input) => input !== '' && input === question.answer

const visual = (question) => question.tokens.map(() => null)

const explain = (question) => {
  const { left, right, product, blank } = question
  const verse = factOf(Math.min(left, right), Math.max(left, right)).verse
  const ask = blank === 'result' ? `${left} 个 ${right} 是多少？` : `几乘几等于 ${product}？`
  return [
    step(`${ask}想口诀喵～`, blank === 'result' ? `${left} × ${right} = ?` : `? × ? = ${product}`),
    step(`${verse}！`, question.equation),
    step(`所以问号是 ${question.answer}，你已经会啦！`, question.equation)
  ]
}

const toMistake = ({ left, right, blank }) => ({ left, right, blank })

const fromMistake = (data) => {
  const valid = BLANKS.includes(data.blank) && isWholeNumber(data.left, MIN_FACTOR, MAX_FACTOR) && isWholeNumber(data.right, MIN_FACTOR, MAX_FACTOR)
  return valid ? buildQuestion(data) : null
}

module.exports = { generate, check, visual, explain, toMistake, fromMistake }
