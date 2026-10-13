const path = require('path')
const kungfu = require(path.join(__dirname, '..', 'utils', 'practice', 'multiplication'))

let failed = 0
const check = (condition, label, detail) => {
  if (condition) return
  failed += 1
  console.log('FAIL', label, detail === undefined ? '' : JSON.stringify(detail))
}

const seededRng = (seed) => {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648
    return state / 2147483648
  }
}

const EXPECTED_VERSES = {
  '1x1': '一一得一', '2x5': '二五一十', '3x4': '三四十二', '4x5': '四五二十', '2x9': '二九十八',
  '5x5': '五五二十五', '6x6': '六六三十六', '7x7': '七七四十九', '8x8': '六十四', '4x9': '四九三十六', '9x9': '九九八十一', '1x9': '一九得九'
}
check(kungfu.ALL_FACTS.length === 45, '45 口诀 in the table', kungfu.ALL_FACTS.length)
Object.entries(EXPECTED_VERSES).forEach(([key, verse]) => {
  const fact = kungfu.ALL_FACTS.find((candidate) => candidate.key === key)
  check(fact && fact.verse.endsWith(verse), `verse ${key}`, fact && fact.verse)
})
check(kungfu.ALL_FACTS.every((fact) => fact.small <= fact.large && fact.product === fact.small * fact.large), 'facts are small × large')
check(new Set(kungfu.ALL_FACTS.map((fact) => fact.verse)).size === 45, 'verses unique')

for (let row = 1; row <= kungfu.ROW_COUNT; row += 1) {
  const rng = seededRng(row * 31)
  const queue = kungfu.buildTrainingQueue(row, rng)
  check(queue.length === row * 2, `row ${row} queue has two questions per 口诀`, queue.length)
  check(queue.every((question) => question.fact.large === row), `row ${row} queue stays in its row`)
  check(new Set(queue.map((question) => question.id)).size === queue.length, `row ${row} question ids unique`)
}

const validate = (question, label) => {
  const { fact } = question
  if (question.type === 'verse') {
    check(question.choices.length === 3 && question.choices.includes(fact.tail) && new Set(question.choices).size === 3, `${label} verse choices`, question.choices)
    return
  }
  const blankIndex = question.tokens.indexOf('')
  check(question.tokens.filter((token) => token === '').length === 1, `${label} one blank`, question.tokens)
  const values = question.tokens.map((token, index) => (index === blankIndex ? Number(question.answer) : Number(token)))
  check(values[0] * values[2] === values[4], `${label} equation holds`, { tokens: question.tokens, answer: question.answer })
  check(question.answer.length <= 2, `${label} answer fits the keypad`, question.answer)
}

const rng = seededRng(7)
for (let round = 0; round < 400; round += 1) {
  const exam = kungfu.buildExam(rng)
  check(exam.length === kungfu.EXAM_QUESTION_COUNT, 'exam size', exam.length)
  check(new Set(exam.map((question) => question.fact.key)).size === exam.length, 'exam never repeats a 口诀', exam.map((question) => question.fact.key))
  exam.forEach((question, index) => validate(question, `exam ${round}.${index}`))
}

const queue = kungfu.buildTrainingQueue(3, seededRng(3))
const requeued = kungfu.requeueMissed(queue, 0, queue[0], seededRng(4))
check(requeued.length === queue.length + 1 && requeued[4].fact.key === queue[0].fact.key && requeued[4].id !== queue[0].id, 'missed question comes back 3 later with a new id', requeued.map((question) => question.id))
const nearEnd = kungfu.requeueMissed(queue, queue.length - 1, queue[queue.length - 1], seededRng(5))
check(nearEnd[nearEnd.length - 1].fact.key === queue[queue.length - 1].fact.key, 'missed last question goes to the end')

check(kungfu.starsOf(0) === 3 && kungfu.starsOf(2) === 2 && kungfu.starsOf(3) === 1, 'stars by mistakes')
check(kungfu.realmOf(0, false) === '初入江湖' && kungfu.realmOf(3, false) === '小有所成' && kungfu.realmOf(9, false) === '登峰造极' && kungfu.realmOf(2, true) === '神功大成', 'realms')

console.log(failed ? `${failed} checks failed` : 'all multiplication checks passed')
process.exitCode = failed ? 1 : 0
