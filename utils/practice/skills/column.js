// Skill: 万以内加减 (three-digit numbers, "356 + 278 = ?"), told as a story (books in the library, cars in the car park)
// and explained as a 竖式: line the places up, work from the ones, carry 1 (进一) or borrow 1 (退一) as you go.
const { TEN, randomInt, pick, chance, step, isWholeNumber } = require('./shared')

const OPERATIONS = ['+', '-']
const SYMBOLS = { '+': '+', '-': '−' }
const PLACES = ['个位', '十位', '百位', '千位']
const THEMES = [
  { icon: '📚', start: (count) => `图书馆有 ${count} 本书`, '+': (count) => `又买来 ${count} 本`, '-': (count) => `借走了 ${count} 本`, ask: { '+': '现在有几本？', '-': '还剩几本？' } },
  { icon: '🚗', start: (count) => `停车场有 ${count} 辆车`, '+': (count) => `又开来 ${count} 辆`, '-': (count) => `开走了 ${count} 辆`, ask: { '+': '现在有几辆？', '-': '还剩几辆？' } },
  { icon: '🐑', start: (count) => `牧场有 ${count} 只羊`, '+': (count) => `又跑来 ${count} 只`, '-': (count) => `卖掉了 ${count} 只`, ask: { '+': '现在有几只？', '-': '还剩几只？' } }
]
const MIN_THREE_DIGIT = 100
const MAX_THREE_DIGIT = 999
const THOUSAND = 1000
const ROUND_TENS_RATIO = 0.2
const FROM_THOUSAND_RATIO = 0.08

const resultOf = ({ operation, left, right }) => (operation === '+' ? left + right : left - right)

const buildQuestion = (facts) => {
  const { operation, left, right, theme } = facts
  const result = resultOf(facts)
  const words = THEMES[theme]
  return {
    key: `${left}${operation}${right}`,
    ...facts,
    result,
    answer: String(result),
    tokens: [String(left), SYMBOLS[operation], String(right), '=', ''],
    equation: `${left} ${SYMBOLS[operation]} ${right} = ${result}`,
    story: `${words.icon} ${words.start(left)}，${words[operation](right)}，${words.ask[operation]}`,
    maxDigits: 4
  }
}

// 几百几十 (350 + 260) for warming up, then any three-digit numbers; now and then 1000 − ? for borrowing across zeros.
const sampleFacts = (operation, rng) => {
  const roundTens = chance(rng, ROUND_TENS_RATIO)
  const sample = () => (roundTens ? randomInt(rng, 10, 99) * TEN : randomInt(rng, MIN_THREE_DIGIT, MAX_THREE_DIGIT))
  if (operation === '+') return { left: sample(), right: sample() }
  if (!roundTens && chance(rng, FROM_THOUSAND_RATIO)) return { left: THOUSAND, right: sample() }
  const [first, second] = [sample(), sample()]
  return { left: Math.max(first, second), right: Math.min(first, second) }
}

const generate = (options, { rng = Math.random, previousKey = '' } = {}) => {
  let question = null
  do {
    const operation = pick(rng, OPERATIONS)
    question = buildQuestion({ operation, ...sampleFacts(operation, rng), theme: randomInt(rng, 0, THEMES.length - 1) })
  } while (question.key === previousKey || question.result < 0)
  return question
}

const check = (question, input) => input !== '' && input === question.answer

const visual = (question) => question.tokens.map(() => null)

const digitAt = (value, place) => Math.floor(value / TEN ** place) % TEN
const digitCount = (value) => String(value).length

/**
 * The 竖式 drawn by number-picture: rows of digits right-aligned in `width` columns, the result filled in up to
 * the place being worked on, little marks above for carries (1) and borrows (·), and the current column highlighted.
 */
const columnPicture = ({ left, right, operation, width, resultDigits, marks, focus }) => {
  const rowOf = (value) => Array.from({ length: width }, (_, column) => {
    const place = width - 1 - column
    return place < digitCount(value) ? String(digitAt(value, place)) : ''
  })
  return {
    type: 'column',
    symbol: SYMBOLS[operation],
    marks: Array.from({ length: width }, (_, column) => marks[width - 1 - column] || ''),
    top: rowOf(left),
    bottom: rowOf(right),
    result: Array.from({ length: width }, (_, column) => resultDigits[width - 1 - column] || ''),
    focus: focus === null ? -1 : width - 1 - focus
  }
}

const additionSteps = (question, width) => {
  const { left, right, result } = question
  const resultDigits = {}
  const marks = {}
  const steps = []
  let carry = 0
  for (let place = 0; place < width; place += 1) {
    const [top, bottom] = [digitAt(left, place), digitAt(right, place)]
    const hasDigits = place < digitCount(left) || place < digitCount(right)
    const sum = top + bottom + carry
    const carryText = carry ? ' + 进上来的 1' : ''
    if (!hasDigits) {
      resultDigits[place] = String(carry)
      steps.push(step(`${PLACES[place]}只有进上来的 1，写 1`, `${carry}`, columnPicture({ ...question, width, resultDigits: { ...resultDigits }, marks: { ...marks }, focus: place })))
      break
    }
    resultDigits[place] = String(sum % TEN)
    const nextCarry = sum >= TEN ? 1 : 0
    if (nextCarry) marks[place + 1] = '1'
    const writeText = nextCarry ? `满十了！写 ${sum % TEN}，向${PLACES[place + 1]}进 1` : `写 ${sum}`
    steps.push(
      step(`${PLACES[place]}：${top} + ${bottom}${carryText} = ${sum}，${writeText}`, `${top} + ${bottom}${carry ? ' + 1' : ''} = ${sum}`, columnPicture({ ...question, width, resultDigits: { ...resultDigits }, marks: { ...marks }, focus: place }))
    )
    carry = nextCarry
    if (place + 1 >= digitCount(result)) break
  }
  return steps
}

const subtractionSteps = (question, width) => {
  const { left, right, result } = question
  const resultDigits = {}
  const marks = {}
  const steps = []
  let borrow = 0
  for (let place = 0; place < digitCount(left); place += 1) {
    const [top, bottom] = [digitAt(left, place), digitAt(right, place)]
    const afterBorrow = top - borrow
    const needsBorrow = afterBorrow < bottom
    const working = needsBorrow ? afterBorrow + TEN : afterBorrow
    const difference = working - bottom
    if (needsBorrow) marks[place + 1] = '·'
    const isLeadingZero = place >= digitCount(result) && difference === 0
    if (!isLeadingZero) resultDigits[place] = String(difference)
    let say = `${PLACES[place]}：`
    if (borrow && top === 0) say += `0 被借走 1 不够，先向${PLACES[place + 1]}借 1 当 10，借走 1 后剩 9；`
    else if (borrow) say += `${top} 被借走了 1，还剩 ${afterBorrow}；`
    if (needsBorrow && !(borrow && top === 0)) say += `${afterBorrow} 不够减 ${bottom}，向${PLACES[place + 1]}借 1 当 10，${working} − ${bottom} = ${difference}`
    else if (place >= digitCount(right)) say += `下面没有要减的，就是 ${difference}`
    else say += `${working} − ${bottom} = ${difference}`
    say += isLeadingZero ? '，最前面的 0 不用写' : `，写 ${difference}`
    steps.push(step(say, `${working} − ${bottom} = ${difference}`, columnPicture({ ...question, width, resultDigits: { ...resultDigits }, marks: { ...marks }, focus: place })))
    borrow = needsBorrow ? 1 : 0
  }
  return steps
}

const explain = (question) => {
  const { left, right, result, operation } = question
  const width = Math.max(digitCount(left), digitCount(right), digitCount(result))
  const setUp = step('列竖式：相同数位对齐，从个位算起喵～', `${left} ${SYMBOLS[operation]} ${right}`, columnPicture({ ...question, width, resultDigits: {}, marks: {}, focus: null }))
  const work = operation === '+' ? additionSteps(question, width) : subtractionSteps(question, width)
  return [setUp, ...work, step(`所以问号是 ${result}，你已经会啦！`, question.equation, null)]
}

const toMistake = ({ operation, left, right, theme }) => ({ operation, left, right, theme })

const fromMistake = (data) => {
  const valid =
    OPERATIONS.includes(data.operation) &&
    isWholeNumber(data.left, 0, THOUSAND) &&
    isWholeNumber(data.right, 0, THOUSAND) &&
    isWholeNumber(data.theme, 0, THEMES.length - 1) &&
    resultOf(data) >= 0
  return valid ? buildQuestion(data) : null
}

module.exports = { generate, check, visual, explain, toMistake, fromMistake, columnPicture }
