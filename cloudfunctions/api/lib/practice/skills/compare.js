// Copied from utils/practice by scripts/sync_cloud_practice.js — edit the original, then run the script.
// Skill: 比大小 ("38 ? 45", "9 + 5 ? 13"). The answer is a sign picked from three buttons, not typed.
// The crocodile rule makes it stick: 🐊 the mouth always opens towards the bigger number.
const { TEN, randomInt, pick, chance, framePicture, separateFrames, sticksPicture, step, isWholeNumber } = require('./shared')

const KINDS = ['small', 'big', 'expression']
const KIND_WEIGHTS = [0.3, 0.4, 0.3]
const SIGNS = ['>', '<', '=']
const OPERATIONS = ['+', '-']
const SYMBOLS = { '+': '+', '-': '−' }
const SMALL_MAX = 20
const BIG_MIN = 10
const BIG_MAX = 100
const EQUAL_RATIO = 0.15
const SAME_TENS_RATIO = 0.4
const EXPRESSION_GAP = 2
const STORY = '🐊 鳄鱼嘴巴朝着大的数张开，选一选～'

const signOf = (left, right) => {
  if (left > right) return '>'
  return left < right ? '<' : '='
}

const leftValueOf = ({ kind, left, operation, operand }) => (kind === 'expression' ? (operation === '+' ? left + operand : left - operand) : left)

const buildQuestion = (facts) => {
  const { kind, left, operation, operand, right } = facts
  const leftValue = leftValueOf(facts)
  const answer = signOf(leftValue, right)
  const leftTokens = kind === 'expression' ? [String(left), SYMBOLS[operation], String(operand)] : [String(left)]
  return {
    key: kind === 'expression' ? `c${left}${operation}${operand}:${right}` : `c${left}:${right}`,
    ...facts,
    leftValue,
    answer,
    tokens: [...leftTokens, '', String(right)],
    equation: `${leftTokens.join(' ')} ${answer} ${right}`,
    choices: SIGNS,
    story: STORY,
    maxDigits: 1
  }
}

const weightedKind = (rng) => {
  const roll = rng()
  let total = 0
  return KINDS.find((kind, index) => (total += KIND_WEIGHTS[index]) > roll) || KINDS[KINDS.length - 1]
}

const nearby = (rng, value, gap, min, max) => Math.min(max, Math.max(min, value + randomInt(rng, -gap, gap)))

const sampleFacts = (kind, rng) => {
  if (kind === 'small') {
    const left = randomInt(rng, 0, SMALL_MAX)
    return { kind, left, right: chance(rng, EQUAL_RATIO) ? left : randomInt(rng, 0, SMALL_MAX) }
  }
  if (kind === 'big') {
    const left = randomInt(rng, BIG_MIN, BIG_MAX - 1)
    if (chance(rng, EQUAL_RATIO)) return { kind, left, right: left }
    // Same tens is where children slip (先比十位，十位一样再比个位), so it comes up often.
    const right = chance(rng, SAME_TENS_RATIO) ? Math.floor(left / TEN) * TEN + randomInt(rng, 0, 9) : randomInt(rng, BIG_MIN, BIG_MAX)
    return { kind, left, right }
  }
  const operation = pick(rng, OPERATIONS)
  const left = randomInt(rng, 1, operation === '+' ? SMALL_MAX - 1 : SMALL_MAX)
  const operand = operation === '+' ? randomInt(rng, 1, SMALL_MAX - left) : randomInt(rng, 0, left)
  const value = operation === '+' ? left + operand : left - operand
  return { kind, left, operation, operand, right: nearby(rng, value, EXPRESSION_GAP, 0, SMALL_MAX) }
}

const generate = (options, { rng = Math.random, previousKey = '' } = {}) => {
  let question = null
  do {
    question = buildQuestion(sampleFacts(weightedKind(rng), rng))
  } while (question.key === previousKey)
  return question
}

const check = (question, input) => input !== '' && input === question.answer

const numberPicture = (value, tone) =>
  value <= SMALL_MAX ? framePicture([{ count: value, tone }]) : { type: 'sticks', groups: [{ bundles: Math.floor(value / TEN), ones: value % TEN, tone }] }

// Pictures under plain numbers only; a sum or difference has to be worked out first.
const visual = (question) =>
  question.tokens.map((token, index) => {
    if (question.kind === 'expression' || token === '') return null
    return numberPicture(Number(token), index === 0 ? 'a' : 'b')
  })

const wordOf = { '>': '大于', '<': '小于', '=': '等于' }

const crocodileStep = (question) =>
  question.answer === '='
    ? step('两边一样大，用等号 = 连起来喵～', question.equation)
    : step(`🐊 鳄鱼嘴巴朝大数张开：${question.leftValue} ${wordOf[question.answer]} ${question.right}`, question.equation)

const compareNumbersSteps = (left, right) => {
  if (left <= SMALL_MAX && right <= SMALL_MAX) {
    const bigger = left === right ? '一样多' : `${Math.max(left, right)} 更多`
    return [step(`数一数：${left} 个和 ${right} 个，${bigger}`, `${left} 和 ${right}`, separateFrames(left, right))]
  }
  const [leftTens, rightTens] = [Math.floor(left / TEN), Math.floor(right / TEN)]
  const sticks = sticksPicture([left, right])
  if (leftTens !== rightTens) {
    return [step(`先比十位：${left} 有 ${leftTens} 捆，${right} 有 ${rightTens} 捆，捆多的就大喵～`, `${leftTens}0 ${signOf(leftTens, rightTens)} ${rightTens}0`, sticks)]
  }
  const [leftOnes, rightOnes] = [left % TEN, right % TEN]
  return [
    step(`先比十位：都是 ${leftTens} 捆，一样！`, `${leftTens}0 = ${rightTens}0`, sticks),
    step(`十位一样，再比个位：${leftOnes} 根和 ${rightOnes} 根`, `${leftOnes} ${signOf(leftOnes, rightOnes)} ${rightOnes}`, sticks)
  ]
}

const explain = (question) => {
  const { kind, left, operation, operand, right, leftValue } = question
  if (kind !== 'expression') return [...compareNumbersSteps(left, right), crocodileStep(question)]
  return [
    step(`左边是算式，先把它算出来喵～`, `${left} ${SYMBOLS[operation]} ${operand} = ${leftValue}`, null),
    ...compareNumbersSteps(leftValue, right),
    crocodileStep(question)
  ]
}

const toMistake = ({ kind, left, operation, operand, right }) => (kind === 'expression' ? { kind, left, operation, operand, right } : { kind, left, right })

const fromMistake = (data) => {
  const max = data.kind === 'big' ? BIG_MAX : SMALL_MAX
  const valid =
    KINDS.includes(data.kind) &&
    isWholeNumber(data.left, 0, max) &&
    isWholeNumber(data.right, 0, max) &&
    (data.kind !== 'expression' ||
      (OPERATIONS.includes(data.operation) && isWholeNumber(data.operand, 0, SMALL_MAX) && isWholeNumber(leftValueOf(data), 0, SMALL_MAX)))
  return valid ? buildQuestion(data) : null
}

module.exports = { generate, check, visual, explain, toMistake, fromMistake }
