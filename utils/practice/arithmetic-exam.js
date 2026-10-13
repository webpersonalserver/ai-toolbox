const { generateQuestion } = require('./arithmetic')

const EXAM_QUESTION_COUNT = 20
const POINTS_PER_QUESTION = 5
const UNLOCK_SCORE = 80
const WARNING_SECONDS = 10

// Seconds allowed per tier and level. Level 1 leaves plenty of room (~1.8× a normal pace),
// level 2 needs fluency (~1.2×), level 3 is a challenge for quick children (~0.75×).
const EXAM_LEVELS = [
  { level: 1, name: '初级', stars: '⭐' },
  { level: 2, name: '中级', stars: '⭐⭐' },
  { level: 3, name: '高级', stars: '⭐⭐⭐' }
]
const TIME_LIMIT_SECONDS = {
  10: { 1: 180, 2: 120, 3: 80 },
  20: { 1: 240, 2: 180, 3: 120 },
  100: { 1: 420, 2: 300, 3: 210 }
}

const GRADES = [
  { minScore: 100, name: '满分小状元', mascot: '👑' },
  { minScore: 90, name: '优秀', mascot: '🌟' },
  { minScore: 80, name: '良好', mascot: '👍' },
  { minScore: 60, name: '及格', mascot: '😊' },
  { minScore: 0, name: '再练练', mascot: '💪' }
]

const OPERATOR_SYMBOLS = { '+': '+', '-': '−' }

const gradeOf = (score) => GRADES.find((grade) => score >= grade.minScore)

const levelOf = (level) => EXAM_LEVELS.find((candidate) => candidate.level === level)

const describeSeconds = (seconds) => {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (!minutes) return `${rest} 秒`
  return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分钟`
}

const formatClock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

// Turns an arithmetic question into the shape the shared question component shows.
const toExamQuestion = (question, index) => {
  const cell = (field) => (question.blank === field ? '' : String(question[field]))
  const equation = `${question.left} ${OPERATOR_SYMBOLS[question.operation]} ${question.right} = ${question.result}`
  return {
    id: `${question.key}-${index}`,
    key: question.key,
    type: 'equation',
    tokens: [cell('left'), OPERATOR_SYMBOLS[question.operation], cell('right'), '=', cell('result')],
    answer: String(question.answer),
    equation,
    revealText: `正确答案：${equation}`
  }
}

const buildExamPaper = (tier, rng = Math.random) => {
  const questions = []
  let previousKey = ''
  const usedEquations = new Set()
  while (questions.length < EXAM_QUESTION_COUNT) {
    const question = toExamQuestion(generateQuestion(tier, { rng, previousKey }), questions.length)
    if (usedEquations.has(question.equation)) continue
    usedEquations.add(question.equation)
    previousKey = question.key
    questions.push(question)
  }
  return questions
}

module.exports = {
  EXAM_QUESTION_COUNT,
  POINTS_PER_QUESTION,
  UNLOCK_SCORE,
  WARNING_SECONDS,
  EXAM_LEVELS,
  TIME_LIMIT_SECONDS,
  gradeOf,
  levelOf,
  describeSeconds,
  formatClock,
  buildExamPaper
}
