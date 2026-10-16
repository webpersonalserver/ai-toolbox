const path = require('path')
const fs = require('fs')

const LEVELS_DIR = process.argv[2] || path.join(__dirname, '..', 'database', 'levels')
const DEFAULT_BOARD_SIZE = 24
const BLANK_MARK = '□'

const GAME_CHECKS = {
  idiom: {
    answerLength: (length) => length === 4,
    requiredFields: ['clue', 'explanation', 'pinyin', 'answerPinyin'],
    clueProblem: (level) => {
      const visible = new Set([...level.answer].filter((char) => level.clue.includes(char)))
      return visible.size > 2 ? `clue reveals ${[...visible].join('')}` : ''
    }
  },
  poetry: {
    answerLength: (length) => length >= 2 && length <= 7,
    requiredFields: ['clue', 'verse', 'poemTitle', 'author', 'stage', 'answerPinyin'],
    clueProblem: (level) => {
      const blanks = (level.clue.match(new RegExp(BLANK_MARK, 'g')) || []).length
      if (blanks !== level.answer.length) return `clue has ${blanks} blanks for a ${level.answer.length}-char answer`
      return level.clue.replace(new RegExp(`${BLANK_MARK}+`), level.answer) + '。' === level.verse ? '' : 'clue + answer does not rebuild the verse'
    }
  },
  xiehouyu: {
    answerLength: (length) => length >= 2 && length <= 7,
    requiredFields: ['clue', 'riddle', 'stage', 'meaning', 'answerPinyin'],
    // The meaning is shown before answering: no two answer characters in a row, at most half of them at all
    // (same rule as scripts/level_builders/xiehouyu.py).
    clueProblem: (level) => {
      if (level.clue.includes(level.answer)) return 'clue contains the answer'
      const answer = level.answer
      const pairs = [...answer].slice(0, -1).map((char, index) => answer.slice(index, index + 2)).filter((pair) => level.meaning.includes(pair))
      if (pairs.length) return `meaning repeats ${pairs.join('、')}`
      const shared = new Set([...answer].filter((char) => level.meaning.includes(char)))
      return shared.size * 2 > new Set(answer).size ? `meaning uses too many answer characters (${[...shared].join('')})` : ''
    }
  },
  riddle: {
    answerLength: (length) => length >= 1 && length <= 5,
    requiredFields: ['clue', 'why', 'stage'],
    clueProblem: (level) => (level.why.length < 6 ? 'the「为什么」is too short to explain anything' : '')
  },
  miyu: {
    answerLength: (length) => length >= 1 && length <= 4,
    requiredFields: ['clue', 'category', 'why', 'stage'],
    clueProblem: (level) => {
      if (!/^打一[\u4e00-\u9fff]{1,4}$/.test(level.category)) return `odd category ${level.category}`
      if (level.category !== '打一字' && [...level.answer].some((char) => level.clue.includes(char))) return 'the riddle uses a character of the answer'
      return level.why.length < 8 ? 'the explanation is too short' : ''
    }
  },
  hanzi: {
    boardSize: 4,
    answerLength: (length) => length === 1,
    requiredFields: ['clue', 'kind', 'prompt', 'char', 'pinyin', 'stage'],
    clueProblem: (level) => {
      if (!['picture', 'pinyin', 'radical', 'word'].includes(level.kind)) return `unknown kind ${level.kind}`
      if (new Set(level.board).size !== level.board.length) return 'board repeats a choice'
      const answerIndex = level.board.indexOf(level.answer)
      if (level.eliminationOrder.includes(answerIndex) || level.eliminationOrder.length !== level.board.length - 1) return 'bad eliminationOrder'
      if (level.kind === 'radical' && (level.clue !== level.char || level.answer !== level.radical)) return 'radical question must ask for the character\'s own radical'
      if (level.kind !== 'radical' && level.answer !== level.char) return 'answer must be the character being taught'
      if (level.kind === 'word' && (level.clue.split('□').length !== 2 || level.clue.replace('□', level.answer) !== level.word)) return 'word clue does not rebuild the word'
      return ''
    }
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
    // 拼音辅助: exactly one syllable over each answer cell.
    if (level.answerPinyin && (level.answerPinyin.length !== [...level.answer].length || !level.answerPinyin.every((syllable) => /^[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]+$/.test(syllable)))) problems.push(`answerPinyin ${level.answerPinyin}`)
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
  const file = path.join(LEVELS_DIR, `${gameType}.json`)
  if (!fs.existsSync(file)) {
    console.log(`FAIL ${gameType}: ${file} missing`)
    totalFailed += 1
    return
  }
  const levels = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse)
  totalFailed += checkGame(gameType, levels)
})
process.exitCode = totalFailed ? 1 : 0
