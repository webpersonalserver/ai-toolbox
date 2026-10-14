// Skill: 表内除法 ("24 ÷ 4 = ?", "? ÷ 4 = 6", "24 ÷ ? = 6"). Little animals share food evenly (平均分) or food is
// packed a few at a time (包含). Explained with the multiplication verse children already know (四六二十四).
const { randomInt, pick, step, isWholeNumber } = require('./shared')
const { factOf } = require('../multiplication')

const BLANKS = ['result', 'result', 'result', 'result', 'left', 'right']
const KINDS = ['share', 'pack']
const THEMES = [
  { icon: '🍑', thing: '桃子', animal: '小猴', box: '盘' },
  { icon: '🥕', thing: '胡萝卜', animal: '小兔', box: '筐' },
  { icon: '🍪', thing: '饼干', animal: '小熊', box: '袋' }
]
const MIN_DIVISOR = 2
const MAX_FACTOR = 9
const SAME_QUOTIENT_RATIO = 0.1

const storyOf = ({ dividend, divisor, quotient, blank, kind, theme }) => {
  const { icon, thing, animal, box } = THEMES[theme]
  if (blank === 'left') return `${icon} 一些${thing}平均分给 ${divisor} 只${animal}，每只分到 ${quotient} 个，原来有几个？`
  if (blank === 'right') return `${icon} ${dividend} 个${thing}平均分，每只${animal}分到 ${quotient} 个，分给了几只${animal}？`
  if (kind === 'pack') return `${icon} ${dividend} 个${thing}，每 ${divisor} 个装一${box}，能装几${box}？`
  return `${icon} ${dividend} 个${thing}，平均分给 ${divisor} 只${animal}，每只分几个？`
}

const buildQuestion = (facts) => {
  const { dividend, divisor, quotient, blank } = facts
  const values = { left: dividend, right: divisor, result: quotient }
  const cell = (field) => (blank === field ? '' : String(values[field]))
  return {
    key: `${dividend}/${divisor}:${blank}`,
    ...facts,
    answer: String(values[blank]),
    tokens: [cell('left'), '÷', cell('right'), '=', cell('result')],
    equation: `${dividend} ÷ ${divisor} = ${quotient}`,
    story: storyOf(facts),
    maxDigits: 2
  }
}

const generate = (options, { rng = Math.random, previousKey = '' } = {}) => {
  let question = null
  do {
    const divisor = randomInt(rng, MIN_DIVISOR, MAX_FACTOR)
    // Dividing by itself (4 ÷ 4) is kept rare: it teaches little.
    const quotient = rng() < SAME_QUOTIENT_RATIO ? 1 : randomInt(rng, 2, MAX_FACTOR)
    question = buildQuestion({
      dividend: divisor * quotient,
      divisor,
      quotient,
      blank: pick(rng, BLANKS),
      kind: pick(rng, KINDS),
      theme: randomInt(rng, 0, THEMES.length - 1)
    })
  } while (question.key === previousKey)
  return question
}

const check = (question, input) => input !== '' && input === question.answer

const visual = (question) => question.tokens.map(() => null)

// Food in groups: `count` groups of `size` dots each.
const groupsPicture = (count, size) => ({ type: 'groups', groups: Array.from({ length: count }, () => size) })

const explain = (question) => {
  const { dividend, divisor, quotient, blank, kind, theme } = question
  const { thing, animal, box } = THEMES[theme]
  const verse = factOf(Math.min(divisor, quotient), Math.max(divisor, quotient)).verse
  const picture = kind === 'pack' && blank === 'result' ? groupsPicture(quotient, divisor) : groupsPicture(divisor, quotient)
  const finalStep = step(`所以问号是 ${question.answer}，你已经会啦！`, question.equation, picture)
  if (blank === 'left') {
    return [
      step(`${divisor} 只${animal}，每只 ${quotient} 个，就是 ${divisor} 个 ${quotient} 合起来喵～`, `${divisor} × ${quotient} = ?`, picture),
      step(`想口诀：${verse}！一共 ${dividend} 个`, `${divisor} × ${quotient} = ${dividend}`, picture),
      finalStep
    ]
  }
  if (blank === 'right') {
    return [
      step(`每只分 ${quotient} 个，${dividend} 里面有几个 ${quotient}，就分给了几只喵～`, `? × ${quotient} = ${dividend}`, null),
      step(`想口诀：${verse}！是 ${divisor} 只${animal}`, `${divisor} × ${quotient} = ${dividend}`, picture),
      finalStep
    ]
  }
  const ask =
    kind === 'pack'
      ? `每 ${divisor} 个装一${box}，${dividend} 里面有几个 ${divisor}？`
      : `${dividend} 个${thing}平均分成 ${divisor} 份，每份几个？`
  return [
    step(`${ask}想想：${divisor} 乘几等于 ${dividend} 喵～`, `${divisor} × ? = ${dividend}`, null),
    step(`想口诀：${verse}！所以是 ${quotient}`, `${divisor} × ${quotient} = ${dividend}`, picture),
    finalStep
  ]
}

const toMistake = ({ dividend, divisor, quotient, blank, kind, theme }) => ({ dividend, divisor, quotient, blank, kind, theme })

const fromMistake = (data) => {
  const valid =
    BLANKS.includes(data.blank) &&
    KINDS.includes(data.kind) &&
    isWholeNumber(data.theme, 0, THEMES.length - 1) &&
    isWholeNumber(data.divisor, MIN_DIVISOR, MAX_FACTOR) &&
    isWholeNumber(data.quotient, 1, MAX_FACTOR) &&
    data.dividend === data.divisor * data.quotient
  return valid ? buildQuestion(data) : null
}

module.exports = { generate, check, visual, explain, toMistake, fromMistake }
