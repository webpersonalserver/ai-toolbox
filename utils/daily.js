// 每日挑战: 10 questions, 汉字 and 算术 taking turns. The cloud picks the 5 汉字 levels; the 5 sums are made here from
// the same Beijing date, so everyone gets the same challenge that day.
const { unitOf } = require('./practice/catalog')
const { skillOf } = require('./practice/skills/index')

// One sum from each, easiest first: 分与合, 20 以内进退位, 连加连减, 比大小, 100 以内加减.
const MATH_UNIT_IDS = ['split-10', 'add-sub-20', 'chain-add-sub', 'compare', 'add-sub-100']

// Same generator as the cloud (handlers/daily.js): mulberry32 seeded from the text.
const seededRandom = (seedText) => {
  let state = [...seedText].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 2654435761) >>> 0, 2166136261)
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const mathQuestionsOf = (dateKey, count) => {
  const rng = seededRandom(`math:${dateKey}`)
  return MATH_UNIT_IDS.slice(0, count).map((unitId, index) => {
    const unit = unitOf(unitId)
    const question = skillOf(unit.skill).generate(unit.options, { rng })
    return {
      ...question,
      id: `math-${index}`,
      subject: 'math',
      type: 'equation',
      revealText: `正确答案：${question.equation}`,
      reviewText: question.equation
    }
  })
}

const toHanziQuestion = (question) => ({
  ...question,
  subject: 'hanzi',
  reviewText: question.kind === 'word' ? `${question.clue} → ${question.word}` : `${question.clue} → ${question.answer}`
})

// 字, 算, 字, 算 … so neither kind comes in a long run.
const buildChallenge = ({ dateKey, hanzi, mathCount }) => {
  const words = hanzi.map(toHanziQuestion)
  const sums = mathQuestionsOf(dateKey, mathCount)
  const length = Math.max(words.length, sums.length)
  return Array.from({ length }, (_, index) => [words[index], sums[index]]).flat().filter(Boolean)
}

const describeSeconds = (seconds) => {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (!minutes) return `${rest} 秒`
  return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分钟`
}

module.exports = { MATH_UNIT_IDS, seededRandom, mathQuestionsOf, buildChallenge, describeSeconds }
