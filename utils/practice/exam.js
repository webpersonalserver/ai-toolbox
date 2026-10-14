// Timed exams shared by every 数理乐园 unit with a skill: 20 questions, 5 points each, three levels.
// Per-unit time limits live in catalog.js (examSeconds).
const { skillOf } = require('./skills/index')

const EXAM_QUESTION_COUNT = 20
const POINTS_PER_QUESTION = 5
const UNLOCK_SCORE = 80
const WARNING_SECONDS = 10

const EXAM_LEVELS = [
  { level: 1, name: '初级', stars: '⭐' },
  { level: 2, name: '中级', stars: '⭐⭐' },
  { level: 3, name: '高级', stars: '⭐⭐⭐' }
]
const GRADES = [
  { minScore: 100, name: '满分小状元', mascot: '👑' },
  // Kid-friendly praise instead of school marks: even the lowest band sounds like a next step, not a verdict.
  { minScore: 90, name: '超级棒', mascot: '🌟' },
  { minScore: 80, name: '真不错', mascot: '👍' },
  { minScore: 60, name: '有进步', mascot: '😊' },
  { minScore: 0, name: '加油练练', mascot: '💪' }
]

const gradeOf = (score) => GRADES.find((grade) => score >= grade.minScore)

const levelOf = (level) => EXAM_LEVELS.find((candidate) => candidate.level === level)

const describeSeconds = (seconds) => {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (!minutes) return `${rest} 秒`
  return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分钟`
}

const formatClock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

// A paper never repeats an equation; each question gets an id for the question component and the answer it reveals.
const buildExamPaper = (unit, rng = Math.random) => {
  const skill = skillOf(unit.skill)
  const questions = []
  const usedEquations = new Set()
  let previousKey = ''
  while (questions.length < EXAM_QUESTION_COUNT) {
    const question = skill.generate(unit.options, { rng, previousKey })
    if (usedEquations.has(question.equation)) continue
    usedEquations.add(question.equation)
    previousKey = question.key
    questions.push({ ...question, id: `${question.key}-${questions.length}`, type: 'equation', revealText: `正确答案：${question.equation}` })
  }
  return questions
}

module.exports = {
  EXAM_QUESTION_COUNT,
  POINTS_PER_QUESTION,
  UNLOCK_SCORE,
  WARNING_SECONDS,
  EXAM_LEVELS,
  gradeOf,
  levelOf,
  describeSeconds,
  formatClock,
  buildExamPaper
}
