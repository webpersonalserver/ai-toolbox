const TIERS = {
  10: { tier: 10, label: '10 以内', max: 10, maxInputDigits: 2, regroupRatio: 0, showDots: true, zeroRatio: 0.1, example: '3 + ? = 7' },
  20: { tier: 20, label: '20 以内', max: 20, maxInputDigits: 2, regroupRatio: 0.5, showDots: false, zeroRatio: 0.05, example: '9 + 6 = ?' },
  100: { tier: 100, label: '100 以内', max: 100, maxInputDigits: 3, regroupRatio: 0.4, showDots: false, zeroRatio: 0.03, example: '? − 28 = 45' }
}

const TIER_ORDER = [10, 20, 100]

const OPERATIONS = ['+', '-']
const BLANKS = ['left', 'right', 'result']
const MAX_SAMPLING_ATTEMPTS = 200
const TWO_DIGIT_MIN = 10

const tierOf = (tier) => TIERS[tier] || TIERS[10]

const randomInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1))

const pick = (rng, list) => list[Math.floor(rng() * list.length)]

// "Regrouping" = carrying in addition, borrowing in subtraction: the step children find hardest.
const needsRegrouping = (operation, left, right) =>
  operation === '+' ? (left % 10) + (right % 10) >= 10 : left % 10 < right % 10

const hasUnwantedZero = (left, right, result, rng, config) =>
  (left === 0 || right === 0 || result === 0) && rng() >= config.zeroRatio

const sampleOperands = (operation, config, rng) => {
  const minLeft = config.max >= 100 ? TWO_DIGIT_MIN : 0
  if (operation === '+') {
    const left = randomInt(rng, minLeft, config.max)
    const right = randomInt(rng, 0, config.max - left)
    return { left, right, result: left + right }
  }
  const left = randomInt(rng, minLeft, config.max)
  const right = randomInt(rng, 0, left)
  return { left, right, result: left - right }
}

const generateQuestion = (tier, { rng = Math.random, previousKey = '' } = {}) => {
  const config = tierOf(tier)
  const operation = pick(rng, OPERATIONS)
  const blank = pick(rng, BLANKS)
  const wantRegrouping = rng() < config.regroupRatio
  let candidate = null
  for (let attempt = 0; attempt < MAX_SAMPLING_ATTEMPTS; attempt += 1) {
    const operands = sampleOperands(operation, config, rng)
    const key = `${operands.left}${operation}${operands.right}:${blank}`
    if (key === previousKey) continue
    if (hasUnwantedZero(operands.left, operands.right, operands.result, rng, config)) continue
    candidate = { ...operands, key }
    if (!config.regroupRatio || needsRegrouping(operation, operands.left, operands.right) === wantRegrouping) break
  }
  const { left, right, result, key } = candidate
  const answerByBlank = { left, right, result }
  return { tier: config.tier, operation, left, right, result, blank, answer: answerByBlank[blank], key }
}

const isCorrect = (question, input) => input !== '' && Number(input) === question.answer

module.exports = { TIERS, TIER_ORDER, tierOf, generateQuestion, isCorrect, needsRegrouping }
