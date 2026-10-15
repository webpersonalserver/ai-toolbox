// Copied from utils/practice by scripts/sync_cloud_practice.js — edit the original, then run the script.
// Skill: 连加连减 / 加减混合 within 20 ("3 + 4 − 2 = ?"), told as a little story: a bus picking up and dropping off
// passengers, birds flying onto and off a tree. Worked left to right, one step at a time.
const { randomInt, pick, framePicture, twoColorFrames, step, isWholeNumber } = require('./shared')

const OPERATIONS = ['+', '-']
const SYMBOLS = { '+': '+', '-': '−' }
const THEMES = [
  { icon: '🚌', start: (count) => `公交车上有 ${count} 人`, '+': (count) => `上来 ${count} 人`, '-': (count) => `下去 ${count} 人`, ask: '现在车上有几人？', unit: '人' },
  { icon: '🐦', start: (count) => `树上有 ${count} 只小鸟`, '+': (count) => `飞来 ${count} 只`, '-': (count) => `飞走 ${count} 只`, ask: '现在树上有几只？', unit: '只' },
  { icon: '🐟', start: (count) => `鱼缸里有 ${count} 条小鱼`, '+': (count) => `放进 ${count} 条`, '-': (count) => `捞走 ${count} 条`, ask: '现在鱼缸里有几条？', unit: '条' }
]
const MAX_SAMPLING_ATTEMPTS = 200

const apply = (value, operation, amount) => (operation === '+' ? value + amount : value - amount)

const storyOf = ({ first, operations, numbers, theme }) => {
  const words = THEMES[theme]
  return `${words.icon} ${words.start(first)}，${words[operations[0]](numbers[0])}，又${words[operations[1]](numbers[1])}，${words.ask}`
}

const buildQuestion = (facts) => {
  const { first, operations, numbers } = facts
  const middle = apply(first, operations[0], numbers[0])
  const result = apply(middle, operations[1], numbers[1])
  const shown = [String(first), SYMBOLS[operations[0]], String(numbers[0]), SYMBOLS[operations[1]], String(numbers[1])]
  return {
    key: `${first}${operations[0]}${numbers[0]}${operations[1]}${numbers[1]}`,
    ...facts,
    middle,
    result,
    answer: String(result),
    tokens: [...shown, '=', ''],
    equation: `${shown.join(' ')} = ${result}`,
    story: storyOf(facts),
    maxDigits: 2
  }
}

const isInRange = (value, max) => value >= 0 && value <= max

/** options: { max } — every number, the middle step and the result stay within 0…max. */
const generate = (options, { rng = Math.random, previousKey = '' } = {}) => {
  const operations = [pick(rng, OPERATIONS), pick(rng, OPERATIONS)]
  const theme = randomInt(rng, 0, THEMES.length - 1)
  let question = null
  for (let attempt = 0; attempt < MAX_SAMPLING_ATTEMPTS; attempt += 1) {
    const first = randomInt(rng, 1, options.max)
    const numbers = [randomInt(rng, 1, Math.min(10, options.max)), randomInt(rng, 1, Math.min(10, options.max))]
    const candidate = buildQuestion({ first, operations, numbers, theme })
    if (!isInRange(candidate.middle, options.max) || !isInRange(candidate.result, options.max) || candidate.key === previousKey) continue
    question = candidate
    if (candidate.result > 0) break
  }
  return question || buildQuestion({ first: 2, operations: ['+', '+'], numbers: [1, 1], theme })
}

const check = (question, input) => input !== '' && input === question.answer

// The story carries the picture; the equation stays short enough for one line.
const visual = (question) => question.tokens.map(() => null)

// Taking away: what stays is coloured, what leaves is a faded dot.
const stepPicture = (from, operation, amount) =>
  operation === '+' ? twoColorFrames(from, amount) : framePicture([{ count: from - amount, tone: 'a' }, { count: amount, tone: 'x' }])

const explain = (question) => {
  const { first, operations, numbers, middle, result, theme } = question
  const words = THEMES[theme]
  const [firstSymbol, secondSymbol] = operations.map((operation) => SYMBOLS[operation])
  return [
    step(`连着算，要从左往右一步一步来喵～ 先看前两件事：${words.start(first)}，${words[operations[0]](numbers[0])}`, `${first} ${firstSymbol} ${numbers[0]} = ${middle}`, stepPicture(first, operations[0], numbers[0])),
    step(`现在是 ${middle} ${words.unit}，又${words[operations[1]](numbers[1])}`, `${middle} ${secondSymbol} ${numbers[1]} = ${result}`, stepPicture(middle, operations[1], numbers[1])),
    step(`所以问号是 ${result}，你已经会啦！`, question.equation, framePicture([{ count: result, tone: 'a' }]))
  ]
}

const toMistake = ({ first, operations, numbers, theme }) => ({ first, operations, numbers, theme })

const fromMistake = (data, options) => {
  const valid =
    isWholeNumber(data.first, 1, options.max) &&
    Array.isArray(data.operations) &&
    data.operations.length === 2 &&
    data.operations.every((operation) => OPERATIONS.includes(operation)) &&
    Array.isArray(data.numbers) &&
    data.numbers.length === 2 &&
    data.numbers.every((value) => isWholeNumber(value, 1, options.max)) &&
    isWholeNumber(data.theme, 0, THEMES.length - 1)
  if (!valid) return null
  const question = buildQuestion(data)
  return isInRange(question.middle, options.max) && isInRange(question.result, options.max) ? question : null
}

module.exports = { generate, check, visual, explain, toMistake, fromMistake }
