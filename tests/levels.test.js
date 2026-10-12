const path = require('path')
const fs = require('fs')

const LEVELS_DIR = process.argv[2] || path.join(__dirname, '..', 'database', 'levels')
const DEFAULT_BOARD_SIZE = 24
const BLANK_MARK = '□'

const GAME_CHECKS = {
  idiom: {
    answerLength: (length) => length === 4,
    requiredFields: ['clue', 'explanation', 'pinyin'],
    clueProblem: (level) => {
      const visible = new Set([...level.answer].filter((char) => level.clue.includes(char)))
      return visible.size > 2 ? `clue reveals ${[...visible].join('')}` : ''
    }
  },
  poetry: {
    answerLength: (length) => length >= 2 && length <= 7,
    requiredFields: ['clue', 'verse', 'poemTitle', 'author', 'stage'],
    clueProblem: (level) => {
      const blanks = (level.clue.match(new RegExp(BLANK_MARK, 'g')) || []).length
      if (blanks !== level.answer.length) return `clue has ${blanks} blanks for a ${level.answer.length}-char answer`
      return level.clue.replace(new RegExp(`${BLANK_MARK}+`), level.answer) + '。' === level.verse ? '' : 'clue + answer does not rebuild the verse'
    }
  },
  xiehouyu: {
    answerLength: (length) => length >= 2 && length <= 7,
    requiredFields: ['clue', 'riddle', 'stage'],
    clueProblem: (level) => (level.clue.includes(level.answer) ? 'clue contains the answer' : '')
  },
  typo: {
    boardSize: 8,
    answerLength: (length) => length === 1,
    requiredFields: ['clue', 'idiom', 'wrongChar', 'explanation', 'stage'],
    clueProblem: (level) => {
      const differing = [...level.idiom].filter((char, index) => char !== level.clue[index]).length
      if (differing !== 1) return `clue differs from idiom in ${differing} places`
      if (level.idiom[level.wrongPosition] !== level.answer || level.clue[level.wrongPosition] !== level.wrongChar) return 'wrongPosition mismatch'
      const answerIndex = level.board.indexOf(level.answer)
      if (level.eliminationOrder.includes(answerIndex) || level.eliminationOrder.length !== level.board.length - 1) return 'bad eliminationOrder'
      if (level.board.includes(level.wrongChar)) return 'board contains the wrong char'
      return ''
    }
  }
}

const countChars = (chars) =>
  chars.reduce((counts, char) => {
    counts[char] = (counts[char] || 0) + 1
    return counts
  }, {})

const boardContainsAnswer = (board, answer) => {
  const boardCounts = countChars(board)
  return Object.entries(countChars([...answer])).every(([char, count]) => (boardCounts[char] || 0) >= count)
}

const checkGame = (gameType, levels) => {
  const checks = GAME_CHECKS[gameType]
  const seenAnswers = new Set()
  const seenStages = []
  let failedCount = 0
  levels.forEach((level, index) => {
    const problems = []
    const expectedLevelNo = index + 1
    if (level.levelNo !== expectedLevelNo) problems.push(`levelNo ${level.levelNo}, expected ${expectedLevelNo}`)
    if (level._id !== `${gameType}_${level.levelNo}`) problems.push(`_id ${level._id} does not match`)
    if (level.gameType !== gameType) problems.push(`gameType ${level.gameType}`)
    if (!checks.answerLength([...level.answer].length)) problems.push(`answer length ${level.answer.length}`)
    if (gameType === 'idiom' && seenAnswers.has(level.answer)) problems.push(`duplicate answer ${level.answer}`)
    const boardSize = checks.boardSize || DEFAULT_BOARD_SIZE
    if (level.board.length !== boardSize) problems.push(`board size ${level.board.length}`)
    if (!boardContainsAnswer(level.board, level.answer)) problems.push('board is missing answer characters')
    checks.requiredFields.filter((fieldName) => !level[fieldName]).forEach((fieldName) => problems.push(`missing ${fieldName}`))
    const clueProblem = checks.clueProblem(level)
    if (clueProblem) problems.push(clueProblem)
    if (level.stage && seenStages[seenStages.length - 1] !== level.stage) {
      if (seenStages.includes(level.stage)) problems.push(`stage ${level.stage} is not contiguous`)
      seenStages.push(level.stage)
    }
    seenAnswers.add(level.answer)
    if (problems.length) {
      failedCount += 1
      console.log(`FAIL ${gameType} level ${expectedLevelNo} ${level.answer}: ${problems.join('; ')}`)
    }
  })
  const stageText = seenStages.length ? `, stages ${seenStages.join(' → ')}` : ''
  console.log(`${gameType}: ${levels.length} levels checked, ${failedCount} with problems${stageText}`)
  return failedCount
}

let totalFailed = 0
Object.keys(GAME_CHECKS).forEach((gameType) => {
  const file = path.join(LEVELS_DIR, `${gameType}.jsonl`)
  if (!fs.existsSync(file)) {
    console.log(`FAIL ${gameType}: ${file} missing`)
    totalFailed += 1
    return
  }
  const levels = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse)
  totalFailed += checkGame(gameType, levels)
})
process.exitCode = totalFailed ? 1 : 0
