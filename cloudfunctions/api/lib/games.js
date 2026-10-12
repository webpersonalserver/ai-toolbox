const { ERROR_CODES, BusinessError } = require('./response')

const GAME_TYPES = {
  IDIOM: 'idiom',
  POETRY: 'poetry',
  XIEHOUYU: 'xiehouyu',
  TYPO: 'typo'
}

const HINT_STRATEGIES = {
  REVEAL: 'reveal',
  ELIMINATE: 'eliminate'
}

const ELIMINATED_PER_HINT = 2
const ELIMINATE_KEEP_AT_LEAST = 2

const HINT_STRATEGY_BY_GAME = {
  [GAME_TYPES.TYPO]: HINT_STRATEGIES.ELIMINATE
}

const hintStrategyOf = (gameType) => HINT_STRATEGY_BY_GAME[gameType] || HINT_STRATEGIES.REVEAL

const ALL_GAME_TYPES = Object.values(GAME_TYPES)

const SOLUTION_FIELDS_BY_GAME = {
  [GAME_TYPES.IDIOM]: ['pinyin', 'explanation', 'derivation'],
  [GAME_TYPES.POETRY]: ['verse', 'poemTitle', 'author', 'dynasty'],
  [GAME_TYPES.XIEHOUYU]: ['riddle', 'note'],
  [GAME_TYPES.TYPO]: ['idiom', 'wrongChar', 'wrongPosition', 'pinyin', 'explanation']
}

const PUZZLE_FIELDS_BY_GAME = {
  [GAME_TYPES.IDIOM]: [],
  [GAME_TYPES.POETRY]: ['poemTitle', 'author', 'dynasty'],
  [GAME_TYPES.XIEHOUYU]: [],
  [GAME_TYPES.TYPO]: ['wrongPosition', 'clueHint']
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
  isGameType,
  parseGameType,
  pickFields
}
