const GAME_TYPES = {
  IDIOM: 'idiom',
  POETRY: 'poetry',
  XIEHOUYU: 'xiehouyu',
  TYPO: 'typo'
}

const DEFAULT_BOARD_COLUMNS = 6
const TYPO_BOARD_COLUMNS = 4

const GAME_ORDER = [GAME_TYPES.IDIOM, GAME_TYPES.TYPO, GAME_TYPES.POETRY, GAME_TYPES.XIEHOUYU]

const GAME_CONFIGS = {
  [GAME_TYPES.IDIOM]: {
    gameType: GAME_TYPES.IDIOM,
    name: '猜成语',
    icon: '成',
    intro: '看释义，拼出四字成语',
    clueLabel: '释义',
    bookName: '成语本',
    bookUnit: '个成语',
    boardColumns: DEFAULT_BOARD_COLUMNS
  },
  [GAME_TYPES.POETRY]: {
    gameType: GAME_TYPES.POETRY,
    name: '诗词填空',
    icon: '诗',
    intro: '从幼儿园到高中，补全经典诗句',
    clueLabel: '补全诗句',
    bookName: '诗词本',
    bookUnit: '句诗词',
    boardColumns: DEFAULT_BOARD_COLUMNS
  },
  [GAME_TYPES.XIEHOUYU]: {
    gameType: GAME_TYPES.XIEHOUYU,
    name: '歇后语',
    icon: '歇',
    intro: '听前半句，猜出后半句',
    clueLabel: '歇后语',
    bookName: '歇后语本',
    bookUnit: '条歇后语',
    boardColumns: DEFAULT_BOARD_COLUMNS
  },
  [GAME_TYPES.TYPO]: {
    gameType: GAME_TYPES.TYPO,
    name: '成语找错字',
    icon: '错',
    intro: '揪出成语里的错别字',
    clueLabel: '找出并改正标红的错字',
    bookName: '错字本',
    bookUnit: '个易错成语',
    hintEffect: '排除 2 个错误选项',
    keptAfterFailure: '已排除的选项',
    boardColumns: TYPO_BOARD_COLUMNS
  }
}

const DEFAULT_HINT_EFFECT = '揭开一个字'
const DEFAULT_KEPT_AFTER_FAILURE = '已揭开的字'

const hintTextsOf = (gameConfig) => ({
  hintEffect: gameConfig.hintEffect || DEFAULT_HINT_EFFECT,
  keptAfterFailure: gameConfig.keptAfterFailure || DEFAULT_KEPT_AFTER_FAILURE
})

const gameConfigOf = (gameType) => GAME_CONFIGS[gameType] || GAME_CONFIGS[GAME_TYPES.IDIOM]

const splitTypoClue = (clue, wrongPosition) =>
  [...(clue || '')].map((char, index) => ({ char, wrong: index === wrongPosition }))

const describePoemSource = (source) => {
  if (!source || !source.poemTitle) return ''
  const dynasty = source.dynasty ? `〔${source.dynasty}〕` : ''
  return `${dynasty}${source.author}《${source.poemTitle}》`
}

module.exports = { GAME_TYPES, GAME_ORDER, GAME_CONFIGS, gameConfigOf, hintTextsOf, describePoemSource, splitTypoClue }
