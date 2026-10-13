const ROW_COUNT = 9
const MAX_STARS = 3
const MAX_COUNTER = 1000000
const CLOCK_SKEW_MS = 24 * 60 * 60 * 1000

const isBoolean = (value) => typeof value === 'boolean'
const isCounter = (value) => Number.isInteger(value) && value >= 0 && value <= MAX_COUNTER
const rowKeyOf = (row) => `row${row}`
const ROWS = Array.from({ length: ROW_COUNT }, (_, index) => index + 1)

const emptyRow = () => ({ studied: false, mastered: false, stars: 0 })
const emptyExam = () => ({ passed: false, passCount: 0, attempts: 0, bestCorrect: 0, fastestSeconds: 0, passedAt: 0 })
const emptyProgress = () => ({ rows: Object.fromEntries(ROWS.map((row) => [rowKeyOf(row), emptyRow()])), exam: emptyExam() })

const isRowProgress = (value) =>
  value !== null &&
  typeof value === 'object' &&
  isBoolean(value.studied) &&
  isBoolean(value.mastered) &&
  Number.isInteger(value.stars) &&
  value.stars >= 0 &&
  value.stars <= MAX_STARS

const isExamProgress = (value, now) =>
  value !== null &&
  typeof value === 'object' &&
  isBoolean(value.passed) &&
  ['passCount', 'attempts', 'bestCorrect', 'fastestSeconds'].every((field) => isCounter(value[field])) &&
  Number.isInteger(value.passedAt) &&
  value.passedAt >= 0 &&
  value.passedAt <= now + CLOCK_SKEW_MS

// Client rows are keyed by row number (1–9); missing rows count as untouched.
const parseClientProgress = (progress, now) => {
  if (progress === null || typeof progress !== 'object' || progress.rows === null || typeof progress.rows !== 'object') return null
  const unknownRow = Object.keys(progress.rows).some((row) => !ROWS.includes(Number(row)))
  if (unknownRow || !isExamProgress(progress.exam, now)) return null
  const rows = {}
  for (const row of ROWS) {
    const rowProgress = progress.rows[row] === undefined ? emptyRow() : progress.rows[row]
    if (!isRowProgress(rowProgress)) return null
    rows[rowKeyOf(row)] = { studied: rowProgress.studied, mastered: rowProgress.mastered, stars: rowProgress.stars }
  }
  return { rows, exam: { ...progress.exam } }
}

const earlierNonZero = (left, right) => {
  if (!left) return right
  if (!right) return left
  return Math.min(left, right)
}

// Progress only ever moves forward, so merging two devices keeps the best of each.
const mergeProgress = (left, right) => ({
  rows: Object.fromEntries(
    ROWS.map((row) => {
      const key = rowKeyOf(row)
      const a = left.rows[key] || emptyRow()
      const b = right.rows[key] || emptyRow()
      return [key, { studied: a.studied || b.studied, mastered: a.mastered || b.mastered, stars: Math.max(a.stars, b.stars) }]
    })
  ),
  exam: {
    passed: left.exam.passed || right.exam.passed,
    passCount: Math.max(left.exam.passCount, right.exam.passCount),
    attempts: Math.max(left.exam.attempts, right.exam.attempts),
    bestCorrect: Math.max(left.exam.bestCorrect, right.exam.bestCorrect),
    fastestSeconds: earlierNonZero(left.exam.fastestSeconds, right.exam.fastestSeconds),
    passedAt: earlierNonZero(left.exam.passedAt, right.exam.passedAt)
  }
})

const milestonesOf = (progress) => [
  ...ROWS.flatMap((row) => {
    const rowProgress = progress.rows[rowKeyOf(row)]
    return [
      ...(rowProgress.mastered ? [{ type: 'rowMastered', row }] : []),
      ...(rowProgress.stars === MAX_STARS ? [{ type: 'rowPerfect', row }] : [])
    ]
  }),
  ...(progress.exam.passed ? [{ type: 'grandmaster' }] : [])
]

const toClientProgress = (progress) => ({
  rows: Object.fromEntries(ROWS.map((row) => [row, progress.rows[rowKeyOf(row)]])),
  exam: progress.exam
})

module.exports = { emptyProgress, parseClientProgress, mergeProgress, milestonesOf, toClientProgress }
