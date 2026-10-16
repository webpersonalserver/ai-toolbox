const { ERROR_CODES, BusinessError } = require('./response')

const GAME_TYPES = {
  IDIOM: 'idiom',
  POETRY: 'poetry',
  XIEHOUYU: 'xiehouyu',
  TYPO: 'typo',
  HANZI: 'hanzi',
  // 脑筋急转弯: read the question, spell the answer; the「为什么」shows after passing.
  RIDDLE: 'riddle',
  // 猜谜语: a riddle with its category (打一水果…); the explanation goes clue by clue.
  MIYU: 'miyu',
  // 口算闯关: levels are made in the cloud (lib/math-challenge.js), not stored; played through handlers/math.js.
  MATH: 'math'
}

const HINT_STRATEGIES = {
  REVEAL: 'reveal',
  ELIMINATE: 'eliminate'
}

const ELIMINATED_PER_HINT = 2
// With 提示不能直接给出答案 on, eliminating stops while this many choices are left.
const ELIMINATE_KEEP_AT_LEAST = 2

const HINT_STRATEGY_BY_GAME = {
  [GAME_TYPES.TYPO]: HINT_STRATEGIES.ELIMINATE,
  [GAME_TYPES.HANZI]: HINT_STRATEGIES.ELIMINATE
}

const hintStrategyOf = (gameType) => HINT_STRATEGY_BY_GAME[gameType] || HINT_STRATEGIES.REVEAL

const ALL_GAME_TYPES = Object.values(GAME_TYPES)

const SOLUTION_FIELDS_BY_GAME = {
  [GAME_TYPES.IDIOM]: ['pinyin', 'explanation', 'derivation'],
  [GAME_TYPES.POETRY]: ['verse', 'poemTitle', 'author', 'dynasty'],
  [GAME_TYPES.XIEHOUYU]: ['riddle', 'note', 'meaning'],
  [GAME_TYPES.TYPO]: ['idiom', 'wrongChar', 'wrongPosition', 'pinyin', 'explanation'],
  [GAME_TYPES.HANZI]: ['char', 'pinyin', 'radical', 'radicalName', 'word'],
  [GAME_TYPES.RIDDLE]: ['clue', 'why'],
  [GAME_TYPES.MIYU]: ['clue', 'category', 'why']
}

// answerPinyin (拼音辅助) is not listed here: toPuzzle adds it only while the switch is on (lib/switches.js).
const PUZZLE_FIELDS_BY_GAME = {
  [GAME_TYPES.IDIOM]: [],
  [GAME_TYPES.POETRY]: ['poemTitle', 'author', 'dynasty'],
  // meaning: what the saying means, in plain words, shown before answering (it never spells out the answer).
  [GAME_TYPES.XIEHOUYU]: ['meaning'],
  [GAME_TYPES.TYPO]: ['wrongPosition', 'clueHint'],
  // kind: picture / pinyin / radical / word decides how the clue is shown; prompt is the question in words.
  [GAME_TYPES.HANZI]: ['kind', 'prompt'],
  [GAME_TYPES.RIDDLE]: [],
  [GAME_TYPES.MIYU]: ['category']
}

// Boards are stored with 24 characters; children are shown 12 (3 rows of 4): every answer character plus the first
// distractors in stored order, so a level always shows the same board. Answers are checked as text, never by cell.
const SHOWN_BOARD_SIZE = 12

const shownBoardOf = (level) => {
  if (level.board.length <= SHOWN_BOARD_SIZE) return level.board
  const answerLeft = level.answer.split('')
  let distractorsLeft = SHOWN_BOARD_SIZE - answerLeft.length
  return level.board.filter((char) => {
    const answerIndex = answerLeft.indexOf(char)
    if (answerIndex !== -1) {
      answerLeft.splice(answerIndex, 1)
      return true
    }
    if (distractorsLeft <= 0) return false
    distractorsLeft -= 1
    return true
  })
}

const isGameType = (value) => ALL_GAME_TYPES.includes(value)

const parseGameType = (payload) => {
  const gameType = payload && payload.gameType
  if (!isGameType(gameType)) {
    throw new BusinessError(ERROR_CODES.BAD_REQUEST, '玩法参数错误')
  }
  return gameType
}

const pickFields = (source, fieldNames) =>
  Object.fromEntries(fieldNames.filter((fieldName) => source[fieldName] !== undefined).map((fieldName) => [fieldName, source[fieldName]]))

module.exports = {
  GAME_TYPES,
  HINT_STRATEGIES,
  ELIMINATED_PER_HINT,
  ELIMINATE_KEEP_AT_LEAST,
  hintStrategyOf,
  ALL_GAME_TYPES,
  SOLUTION_FIELDS_BY_GAME,
  PUZZLE_FIELDS_BY_GAME,
  SHOWN_BOARD_SIZE,
  shownBoardOf,
  isGameType,
  parseGameType,
  pickFields
}
