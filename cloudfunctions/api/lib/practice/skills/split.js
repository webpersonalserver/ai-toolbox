// Copied from utils/practice by scripts/sync_cloud_practice.js — edit the original, then run the script.
// Skill: 分与合 (number bonds within 10). Two kittens share some sweets: "7 分成 3 和 ?" or "3 和 4 合成 ?".
// Shown as a bond: the whole on top, its two parts below; one of the three is the blank.
const { randomInt, pick, framePicture, twoColorFrames, step, isWholeNumber } = require('./shared')

const BLANKS = ['left', 'right', 'total']
const THEMES = [
  { icon: '🍬', thing: '糖', unit: '颗' },
  { icon: '🐟', thing: '小鱼干', unit: '条' },
  { icon: '🍓', thing: '草莓', unit: '颗' },
  { icon: '🎈', thing: '气球', unit: '个' }
]
const MIN_TOTAL = 2

const storyOf = ({ total, left, right, blank, theme }) => {
  const { icon, thing, unit } = THEMES[theme]
  if (blank === 'total') return `${icon} 一只小猫有 ${left} ${unit}${thing}，另一只有 ${right} ${unit}，合起来有几${unit}？`
  const known = blank === 'left' ? right : left
  return `${icon} ${total} ${unit}${thing}分给两只小猫，一只拿 ${known} ${unit}，另一只拿几${unit}？`
}

const buildQuestion = (facts) => {
  const { total, left, right, blank } = facts
  const cell = (field) => (blank === field ? '' : String(facts[field]))
  // "合" reads whole-last (3 和 4 合成 ?), "分" reads whole-first (7 分成 3 和 ?). bond: token index of each circle.
  const isJoin = blank === 'total'
  return {
    key: `s${total}:${left}:${blank}`,
    ...facts,
    answer: String(facts[blank]),
    tokens: isJoin ? [cell('left'), '和', cell('right'), '合成', ''] : [cell('total'), '分成', cell('left'), '和', cell('right')],
    equation: isJoin ? `${left} 和 ${right} 合成 ${total}` : `${total} 分成 ${left} 和 ${right}`,
    layout: 'bond',
    bond: isJoin ? { top: 4, left: 0, right: 2 } : { top: 0, left: 2, right: 4 },
    story: storyOf(facts),
    maxDigits: 2
  }
}

/** options: { max } (largest whole). */
const generate = (options, { rng = Math.random, previousKey = '' } = {}) => {
  let question = null
  do {
    const total = randomInt(rng, MIN_TOTAL, options.max)
    const left = randomInt(rng, 1, total - 1)
    question = buildQuestion({ total, left, right: total - left, blank: pick(rng, BLANKS), theme: randomInt(rng, 0, THEMES.length - 1) })
  } while (question.key === previousKey)
  return question
}

const check = (question, input) => input !== '' && input === question.answer

// Dots under every number that is shown: the whole in one colour, each part in its own.
const visual = (question) =>
  question.tokens.map((token, index) => {
    if (token === '') return null
    if (index === question.bond.top) return framePicture([{ count: question.total, tone: 'a' }])
    if (index === question.bond.left) return framePicture([{ count: question.left, tone: 'a' }])
    if (index === question.bond.right) return framePicture([{ count: question.right, tone: 'b' }])
    return null
  })

const explain = (question) => {
  const { total, left, right, blank, theme } = question
  const { thing, unit } = THEMES[theme]
  const finalStep = step(`所以问号是 ${question.answer}！分与合是一对好朋友喵～`, question.equation, twoColorFrames(left, right))
  if (blank === 'total') {
    return [
      step(`把 ${left} ${unit}和 ${right} ${unit}${thing}放到一起，一个一个数～`, `${left} 和 ${right} 合起来`, twoColorFrames(left, right)),
      step(`一共是 ${total} ${unit}！`, `${left} + ${right} = ${total}`, twoColorFrames(left, right)),
      finalStep
    ]
  }
  const known = blank === 'left' ? right : left
  const answer = total - known
  return [
    step(`先摆出 ${total} ${unit}${thing}喵～`, `${total}`, framePicture([{ count: total, tone: 'a' }])),
    step(`给第一只小猫 ${known} ${unit}，剩下的涂成绿色`, `${total} 分走 ${known}`, twoColorFrames(known, answer)),
    step(`数一数绿色的：${answer} ${unit}！`, `${total} − ${known} = ${answer}`, twoColorFrames(known, answer)),
    finalStep
  ]
}

const toMistake = ({ total, left, right, blank, theme }) => ({ total, left, right, blank, theme })

const fromMistake = (data, options) => {
  const valid =
    BLANKS.includes(data.blank) &&
    isWholeNumber(data.theme, 0, THEMES.length - 1) &&
    isWholeNumber(data.total, MIN_TOTAL, options.max) &&
    isWholeNumber(data.left, 1) &&
    isWholeNumber(data.right, 1) &&
    data.left + data.right === data.total
  return valid ? buildQuestion(data) : null
}

module.exports = { generate, check, visual, explain, toMistake, fromMistake }
