const CHINESE_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
const ROW_COUNT = 9

// Each 重 is one row of the traditional 小九九: 第 n 重 holds 1×n … n×n.
const TECHNIQUES = [
  { row: 1, name: '入门心法', tip: '任何数乘 1，都等于它自己' },
  { row: 2, name: '两仪掌', tip: '二的口诀全是双数：2、4、6、8、10…' },
  { row: 3, name: '三才剑', tip: '每多一招就多 3：3、6、9、12、15…' },
  { row: 4, name: '四象拳', tip: '四的结果是二的口诀再翻一倍' },
  { row: 5, name: '五行步', tip: '五的结果，个位不是 5 就是 0' },
  { row: 6, name: '六合刀', tip: '6 乘双数，个位和那个双数一样：二六十二、四六二十四' },
  { row: 7, name: '七星指', tip: '七的口诀最难，多念几遍：七七四十九' },
  { row: 8, name: '八卦掌', tip: '个位按 8、6、4、2、0 轮着来' },
  { row: 9, name: '九阳神功', tip: '十位加个位总是 9，十位比乘数少 1' }
]

const REALMS = [
  { minRows: 0, name: '初入江湖' },
  { minRows: 1, name: '初窥门径' },
  { minRows: 3, name: '小有所成' },
  { minRows: 5, name: '融会贯通' },
  { minRows: 7, name: '炉火纯青' },
  { minRows: 9, name: '登峰造极' }
]
const GRANDMASTER_REALM = '神功大成'

const QUESTION_TYPES = { PRODUCT: 'product', FACTOR: 'factor', VERSE: 'verse' }
const VERSE_CHOICE_COUNT = 3
const RETRY_GAP = 3
const EXAM_QUESTION_COUNT = 25
const EXAM_LIVES = 3

const chineseOf = (digit) => CHINESE_DIGITS[digit]

// 口诀 spelling of a product: 得六 / 一十 / 十二 / 二十 / 三十六.
const productWords = (product) => {
  if (product < 10) return `得${chineseOf(product)}`
  const tens = Math.floor(product / 10)
  const units = product % 10
  if (tens === 1) return units ? `十${chineseOf(units)}` : '一十'
  return `${chineseOf(tens)}十${units ? chineseOf(units) : ''}`
}

const factOf = (small, large) => {
  const product = small * large
  const head = `${chineseOf(small)}${chineseOf(large)}`
  const tail = productWords(product)
  return { key: `${small}x${large}`, small, large, product, head, tail, verse: `${head}${tail}` }
}

const factsOfRow = (row) => Array.from({ length: row }, (_, index) => factOf(index + 1, row))

const ALL_FACTS = Array.from({ length: ROW_COUNT }, (_, index) => factsOfRow(index + 1)).flat()

const techniqueOf = (row) => TECHNIQUES[row - 1]

const realmOf = (masteredRows, examPassed) => {
  if (examPassed) return GRANDMASTER_REALM
  return REALMS.filter((realm) => masteredRows >= realm.minRows).pop().name
}

const shuffle = (list, rng = Math.random) => {
  const copy = [...list]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    ;[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]]
  }
  return copy
}

// Wrong choices sit close to the right answer (one step up or down the table) so guessing is hard.
const verseChoicesOf = (fact, rng) => {
  const nearby = [fact.product - fact.large, fact.product + fact.large, fact.product - fact.small, fact.product + fact.small, fact.product + 1, fact.product - 1]
  const fallback = [fact.product + 2, fact.product + 3]
  const candidates = [...new Set(nearby.filter((value) => value > 0 && value !== fact.product))]
  const distractors = [...shuffle(candidates, rng), ...fallback.filter((value) => !candidates.includes(value))]
    .slice(0, VERSE_CHOICE_COUNT - 1)
    .map(productWords)
  return shuffle([fact.tail, ...distractors], rng)
}

const buildQuestion = (fact, type, rng = Math.random) => {
  const swapped = rng() < 0.5
  const [left, right] = swapped ? [fact.large, fact.small] : [fact.small, fact.large]
  if (type === QUESTION_TYPES.VERSE) {
    return { id: `${fact.key}-verse`, fact, type, head: fact.head, choices: verseChoicesOf(fact, rng), answer: fact.tail }
  }
  if (type === QUESTION_TYPES.FACTOR) {
    const blankLeft = rng() < 0.5
    return {
      id: `${fact.key}-factor`,
      fact,
      type,
      tokens: [blankLeft ? '' : String(left), '×', blankLeft ? String(right) : '', '=', String(fact.product)],
      answer: String(blankLeft ? left : right)
    }
  }
  return { id: `${fact.key}-product`, fact, type, tokens: [String(left), '×', String(right), '=', ''], answer: String(fact.product) }
}

// Every 口诀 of the row shows up twice: once as a sum to work out, once as a verse or a missing factor.
const buildTrainingQueue = (row, rng = Math.random) => {
  const facts = factsOfRow(row)
  const secondTypes = [QUESTION_TYPES.VERSE, QUESTION_TYPES.FACTOR]
  const questions = facts.flatMap((fact, index) => [
    buildQuestion(fact, QUESTION_TYPES.PRODUCT, rng),
    buildQuestion(fact, row === 1 ? QUESTION_TYPES.VERSE : secondTypes[index % secondTypes.length], rng)
  ])
  return shuffle(questions, rng)
}

// A missed 口诀 comes back a few questions later, so it gets practised again while still fresh.
const requeueMissed = (queue, currentIndex, question, rng = Math.random) => {
  const retry = buildQuestion(question.fact, question.type, rng)
  const insertAt = Math.min(currentIndex + 1 + RETRY_GAP, queue.length)
  return [...queue.slice(0, insertAt), { ...retry, id: `${retry.id}-retry${currentIndex}` }, ...queue.slice(insertAt)]
}

const starsOf = (mistakes) => {
  if (mistakes === 0) return 3
  if (mistakes <= 2) return 2
  return 1
}

// Exams lean on the harder rows (6–9) where children slip most, and never repeat a 口诀 back to back.
const HARD_ROW_FROM = 6
const HARD_ROW_WEIGHT = 2

const buildExam = (rng = Math.random, count = EXAM_QUESTION_COUNT) => {
  const weighted = ALL_FACTS.flatMap((fact) => (fact.large >= HARD_ROW_FROM ? Array(HARD_ROW_WEIGHT).fill(fact) : [fact]))
  const types = Object.values(QUESTION_TYPES)
  const questions = []
  const usedKeys = new Set()
  while (questions.length < count) {
    const fact = weighted[Math.floor(rng() * weighted.length)]
    if (usedKeys.has(fact.key) && usedKeys.size < ALL_FACTS.length) continue
    usedKeys.add(fact.key)
    const question = buildQuestion(fact, types[Math.floor(rng() * types.length)], rng)
    questions.push({ ...question, id: `${question.id}-exam${questions.length}` })
  }
  return questions
}

module.exports = {
  ROW_COUNT,
  TECHNIQUES,
  REALMS,
  GRANDMASTER_REALM,
  QUESTION_TYPES,
  EXAM_QUESTION_COUNT,
  EXAM_LIVES,
  ALL_FACTS,
  productWords,
  factOf,
  factsOfRow,
  techniqueOf,
  realmOf,
  buildQuestion,
  buildTrainingQueue,
  requeueMissed,
  starsOf,
  buildExam
}
