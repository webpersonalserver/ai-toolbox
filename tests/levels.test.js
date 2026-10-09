const path = require('path')
const fs = require('fs')

const LEVELS_FILE = process.argv[2] || path.join(__dirname, '..', 'database', 'levels.jsonl')
const GAME_TYPE = 'idiom'
const ANSWER_LENGTH = 4
const BOARD_SIZE = 24
const MAX_VISIBLE_ANSWER_CHARS = 2

const countChars = (chars) =>
  chars.reduce((counts, char) => {
    counts[char] = (counts[char] || 0) + 1
    return counts
  }, {})

const boardContainsAnswer = (board, answer) => {
  const boardCounts = countChars(board)
  return Object.entries(countChars([...answer])).every(([char, count]) => (boardCounts[char] || 0) >= count)
}

const problemsOf = (level, index, seenAnswers) => {
  const problems = []
  const expectedLevelNo = index + 1
  if (level.levelNo !== expectedLevelNo) problems.push(`levelNo ${level.levelNo}, expected ${expectedLevelNo}`)
  if (level._id !== `${GAME_TYPE}_${level.levelNo}`) problems.push(`_id ${level._id} does not match levelNo`)
  if (level.gameType !== GAME_TYPE) problems.push(`gameType ${level.gameType}`)
  if ([...level.answer].length !== ANSWER_LENGTH) problems.push(`answer length ${level.answer.length}`)
  if (seenAnswers.has(level.answer)) problems.push(`duplicate answer ${level.answer}`)
  if (level.board.length !== BOARD_SIZE) problems.push(`board size ${level.board.length}`)
  if (!boardContainsAnswer(level.board, level.answer)) problems.push('board is missing answer characters')
  const visibleAnswerChars = new Set([...level.answer].filter((char) => level.clue.includes(char)))
  if (visibleAnswerChars.size > MAX_VISIBLE_ANSWER_CHARS) problems.push(`clue reveals ${[...visibleAnswerChars].join('')}`)
  if (!level.clue || !level.explanation || !level.pinyin) problems.push('missing clue/explanation/pinyin')
  return problems
}

const levels = fs.readFileSync(LEVELS_FILE, 'utf8').trim().split('\n').map(JSON.parse)
const seenAnswers = new Set()
let failedCount = 0
levels.forEach((level, index) => {
  const problems = problemsOf(level, index, seenAnswers)
  seenAnswers.add(level.answer)
  if (problems.length) {
    failedCount += 1
    console.log(`FAIL level ${index + 1} ${level.answer}: ${problems.join('; ')}`)
  }
})
console.log(`${levels.length} levels checked, ${failedCount} with problems`)
process.exitCode = failedCount ? 1 : 0
