// Skill: addition and subtraction with one blank (? + b = c, a + ? = c, a + b = ?, same for −).
// A skill exports generate / check / visual / explain; pages only use these four and never know the question type.

const { TEN, randomInt, pick, framesOf, twoColorFrames, sticksOf, step } = require('./shared')

const OPERATIONS = ['+', '-']
const BLANKS = ['left', 'right', 'result']
const SYMBOLS = { '+': '+', '-': '−' }
const MAX_SAMPLING_ATTEMPTS = 200
const TWO_DIGIT_MIN = 10
const FRAME_LIMIT = 20

// "Regrouping" = carrying in addition, borrowing in subtraction: the step children find hardest.
const needsRegrouping = (operation, left, right) =>
  operation === '+' ? (left % TEN) + (right % TEN) >= TEN : left % TEN < right % TEN

const hasUnwantedZero = ({ left, right, result }, rng, options) =>
  (left === 0 || right === 0 || result === 0) && rng() >= options.zeroRatio

const sampleOperands = (operation, options, rng) => {
  const minLeft = options.max >= 100 ? TWO_DIGIT_MIN : 0
  const left = randomInt(rng, minLeft, options.max)
  if (operation === '+') {
    const right = randomInt(rng, 0, options.max - left)
    return { left, right, result: left + right }
  }
  const right = randomInt(rng, 0, left)
  return { left, right, result: left - right }
}

const equationText = ({ left, right, result, operation }) => `${left} ${SYMBOLS[operation]} ${right} = ${result}`

/**
 * options: { max, regroupRatio (share of questions that carry/borrow), zeroRatio (how often a 0 may appear) }.
 * previousKey avoids repeating the question just shown.
 */
const generate = (options, { rng = Math.random, previousKey = '' } = {}) => {
  const operation = pick(rng, OPERATIONS)
  const blank = pick(rng, BLANKS)
  const wantRegrouping = rng() < options.regroupRatio
  let candidate = null
  for (let attempt = 0; attempt < MAX_SAMPLING_ATTEMPTS; attempt += 1) {
    const operands = sampleOperands(operation, options, rng)
    const key = `${operands.left}${operation}${operands.right}:${blank}`
    if (key === previousKey) continue
    if (hasUnwantedZero(operands, rng, options)) continue
    candidate = { ...operands, key }
    if (!options.regroupRatio || needsRegrouping(operation, operands.left, operands.right) === wantRegrouping) break
  }
  const { left, right, result } = candidate
  return buildQuestion({ operation, left, right, result, blank }, options)
}

const buildQuestion = ({ operation, left, right, result, blank }, options) => {
  const facts = { operation, left, right, result }
  const cell = (field) => (blank === field ? '' : String(facts[field]))
  return {
    key: `${left}${operation}${right}:${blank}`,
    ...facts,
    blank,
    answer: String(facts[blank]),
    tokens: [cell('left'), SYMBOLS[operation], cell('right'), '=', cell('result')],
    equation: equationText(facts),
    maxDigits: String(options.max).length
  }
}

// What the mistake book stores for a question, and how it comes back for review.
const toMistake = ({ operation, left, right, result, blank }) => ({ operation, left, right, result, blank })

const fromMistake = (data, options) => {
  const valid =
    OPERATIONS.includes(data.operation) &&
    BLANKS.includes(data.blank) &&
    [data.left, data.right, data.result].every((value) => Number.isInteger(value) && value >= 0) &&
    (data.operation === '+' ? data.left + data.right : data.left - data.right) === data.result
  return valid ? buildQuestion(data, options) : null
}

const check = (question, input) => input !== '' && input === question.answer

// ----- pictures -----

const pictureOf = (value, max, tone) =>
  max <= FRAME_LIMIT ? { type: 'frames', frames: framesOf([{ count: value, tone }]) } : { type: 'sticks', groups: [sticksOf(value, tone)] }

// What sits under each known number of the question (the blank gets nothing).
const visual = (question, options) =>
  question.tokens.map((token, index) => {
    if (index === 1 || index === 3 || token === '') return null
    return pictureOf(Number(token), options.max, index === 2 ? 'b' : 'a')
  })

// ----- explanation: what 喵算算 says, step by step -----


// A blank on the left or right is turned into a plain calculation first ("? + 6 = 13 → 13 − 6").
const plainCalculation = ({ operation, left, right, result, blank }) => {
  if (blank === 'result') return { operation, x: left, y: right }
  if (operation === '+') return { operation: '-', x: result, y: blank === 'left' ? right : left }
  return blank === 'left' ? { operation: '+', x: result, y: right } : { operation: '-', x: left, y: result }
}

const reframeStep = (question, plain) => {
  if (question.blank === 'result') return []
  const shown = question.tokens.map((token) => token || '?').join(' ')
  const plainText = `${plain.x} ${SYMBOLS[plain.operation]} ${plain.y}`
  // Said about the question as it was asked, not about the calculation it turns into.
  const whyByForm = {
    '+': '加法的问号，可以用减法找回来',
    '-left': '被减数藏起来了，把剩下的和减掉的加回去就找到啦',
    '-right': '减掉了几？用大数减去剩下的就知道啦'
  }
  const why = question.operation === '+' ? whyByForm['+'] : whyByForm[`-${question.blank}`]
  return [step(`${why}喵～ ${shown}，其实就是在算 ${plainText}`, `${shown} → ${plainText}`)]
}


// Small numbers (within 10): count on for +, split for −.
const smallSteps = ({ operation, x, y }) => {
  if (operation === '+') {
    return [step(`从 ${x} 往后数 ${y} 个，一个一个跳过去喵～`, `${x} + ${y} = ${x + y}`, twoColorFrames(x, y))]
  }
  return [
    step(`${x} 可以分成 ${y} 和 ${x - y}，拿走 ${y} 个～`, `${x} = ${y} + ${x - y}`, twoColorFrames(y, x - y)),
    step(`剩下的就是 ${x - y} 个啦！`, `${x} − ${y} = ${x - y}`, twoColorFrames(0, x - y))
  ]
}

// 凑十法: the bigger number borrows from the smaller one to fill a ten.
const makeTenSteps = (x, y) => {
  const big = Math.max(x, y)
  const small = Math.min(x, y)
  const need = TEN - big
  const rest = small - need
  return [
    step(`${big} 想变成 10，还差 ${need} 个小伙伴喵！`, `${big} + ${need} = 10`, twoColorFrames(big, small)),
    step(`把 ${small} 分成 ${need} 和 ${rest}，先借 ${need} 个过去凑满 10～`, `${small} = ${need} + ${rest}`, twoColorFrames(TEN, rest)),
    step(`10 再加上剩下的 ${rest}，就是 ${TEN + rest} 啦！`, `${x} + ${y} = 10 + ${rest} = ${TEN + rest}`, twoColorFrames(TEN, rest))
  ]
}

// 破十法: take the subtraction from the ten, then add back the ones.
const breakTenSteps = (x, y) => {
  const ones = x - TEN
  const fromTen = TEN - y
  return [
    step(`${ones} 个不够减 ${y} 个，把 ${x} 分成 10 和 ${ones} 喵～`, `${x} = 10 + ${ones}`, twoColorFrames(TEN, ones)),
    step(`先用 10 减 ${y}，还剩 ${fromTen} 个`, `10 − ${y} = ${fromTen}`, twoColorFrames(fromTen, ones)),
    step(`${fromTen} 再和 ${ones} 合起来，就是 ${fromTen + ones} 啦！`, `${fromTen} + ${ones} = ${fromTen + ones}`, twoColorFrames(fromTen, ones))
  ]
}

// One place (tens or ones) of a calculation. A part that is 0 is not written as "50 + 0": that place just stays.
const placeLine = (place, a, b, symbol, value) => {
  if (!b) return { say: `${place}${a ? `是 ${a}，不用动` : '都是 0'}`, math: `${a}` }
  if (!a) return { say: `${place}只有 ${b}`, math: `${b}` }
  return { say: `${place}：${a} ${symbol} ${b} = ${value}`, math: `${a} ${symbol} ${b} = ${value}` }
}

const combineStep = (tens, ones, equationText, total, picture) =>
  tens && ones
    ? step(`合起来：${tens} + ${ones} = ${total}！`, `${equationText} = ${tens} + ${ones} = ${total}`, picture)
    : step(`合起来就是 ${total}！`, `${equationText} = ${total}`, picture)

// Tens and ones, for anything with a ten in it that is not a make-ten / break-ten case.
const placeValueSteps = ({ operation, x, y }) => {
  const [xt, xo, yt, yo] = [Math.floor(x / TEN), x % TEN, Math.floor(y / TEN), y % TEN]
  const sticks = (values) => ({ type: 'sticks', groups: values.map((value, index) => sticksOf(value, index ? 'b' : 'a')) })
  if (operation === '+') {
    const tens = (xt + yt) * TEN
    const ones = xo + yo
    const tensLine = xt && yt ? placeLine('十位', xt * TEN, yt * TEN, '+', tens) : placeLine('十位', tens, 0)
    const onesLine = xo && yo ? placeLine('个位', xo, yo, '+', ones) : placeLine('个位', ones, 0)
    return [
      step(`把十位和个位分开算喵～ ${tensLine.say}`, tensLine.math, sticks([x, y])),
      step(`${onesLine.say}${ones >= TEN ? '，满十了，变成 1 捆！' : ''}`, onesLine.math, sticks([x, y])),
      combineStep(tens, ones, `${x} + ${y}`, x + y, sticks([x + y]))
    ]
  }
  if (xo >= yo) {
    const tens = (xt - yt) * TEN
    const ones = xo - yo
    const tensLine = placeLine('十位', xt * TEN, yt * TEN, '−', tens)
    const onesLine = placeLine('个位', xo, yo, '−', ones)
    return [
      step(`十位和个位分开减喵～ ${tensLine.say}`, tensLine.math, sticks([x])),
      step(onesLine.say, onesLine.math, sticks([x])),
      combineStep(tens, ones, `${x} − ${y}`, x - y, sticks([x - y]))
    ]
  }
  const tensLeft = (xt - 1) * TEN
  const borrowedTens = tensLeft - yt * TEN
  const ones = xo + TEN - yo
  const tensLine = yt
    ? step(`十位还剩 ${tensLeft}，减去 ${yt * TEN} 是 ${borrowedTens}`, `${tensLeft} − ${yt * TEN} = ${borrowedTens}`, sticks([x]))
    : step(`十位还剩 ${tensLeft}，不用再减`, `${tensLeft}`, sticks([x]))
  return [
    step(`个位 ${xo} 不够减 ${yo}，从十位借 1 捆拆开，变成 ${xo + TEN} 喵～`, `${x} = ${tensLeft} + ${xo + TEN}`, sticks([x])),
    step(`个位：${xo + TEN} − ${yo} = ${ones}`, `${xo + TEN} − ${yo} = ${ones}`, sticks([x])),
    tensLine,
    combineStep(borrowedTens, ones, `${x} − ${y}`, x - y, sticks([x - y]))
  ]
}

const calculationSteps = (plain) => {
  const { operation, x, y } = plain
  if (operation === '+' && x < TEN && y < TEN && x + y > TEN) return makeTenSteps(x, y)
  if (operation === '-' && x > TEN && x < 2 * TEN && y < TEN && x % TEN < y) return breakTenSteps(x, y)
  if (x <= TEN && y <= TEN && (operation === '-' || x + y <= TEN)) return smallSteps(plain)
  return placeValueSteps(plain)
}

const explain = (question) => {
  const plain = plainCalculation(question)
  const finalStep = step(`所以问号是 ${question.answer}，你已经会啦！`, question.equation)
  return [...reframeStep(question, plain), ...calculationSteps(plain), finalStep]
}

module.exports = { generate, check, visual, explain, toMistake, fromMistake, needsRegrouping, plainCalculation, framesOf }
