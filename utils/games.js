const GAME_TYPES = {
  IDIOM: 'idiom',
  POETRY: 'poetry',
  XIEHOUYU: 'xiehouyu',
  TYPO: 'typo',
  HANZI: 'hanzi'
}

// Boards show 12 characters (see shownBoardOf in the cloud), in 3 rows of 4 big cells.
const DEFAULT_BOARD_COLUMNS = 4
const TYPO_BOARD_COLUMNS = 4

// 汉字闯关 first: most players are in grades 1-2.
const GAME_ORDER = [GAME_TYPES.HANZI, GAME_TYPES.IDIOM, GAME_TYPES.TYPO, GAME_TYPES.POETRY, GAME_TYPES.XIEHOUYU]

const GAME_CONFIGS = {
  [GAME_TYPES.HANZI]: {
    gameType: GAME_TYPES.HANZI,
    name: '汉字闯关',
    shortName: '汉字',
    icon: '字',
    intro: '看图识字、拼音选字、认偏旁、选字组词',
    clueLabel: '汉字闯关',
    bookName: '生字本',
    bookUnit: '个生字',
    hintEffect: '排除 2 个错误选项',
    keptAfterFailure: '已排除的选项',
    boardColumns: TYPO_BOARD_COLUMNS
  },
  [GAME_TYPES.IDIOM]: {
    gameType: GAME_TYPES.IDIOM,
    name: '猜成语',
    shortName: '成语',
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
    shortName: '诗词',
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
    shortName: '歇后语',
    icon: '歇',
    intro: '看前半句和意思，猜出后半句',
    clueLabel: '歇后语',
    bookName: '歇后语本',
    bookUnit: '条歇后语',
    boardColumns: DEFAULT_BOARD_COLUMNS
  },
  [GAME_TYPES.TYPO]: {
    gameType: GAME_TYPES.TYPO,
    name: '成语找错字',
    shortName: '找错字',
    icon: '错',
    intro: '揪出成语里的错别字',
    clueLabel: '找出并改正标红的错字',
    // When 标出错字 is off in 控制中心 the wrong character is not marked.
    clueLabelUnmarked: '成语里有一个错字，找出来并选出正确的字',
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

// What the clue card asks: 汉字闯关 brings its own prompt; 成语找错字 words it differently when the wrong character is
// not marked (标出错字 off in 控制中心, so the puzzle has no wrongPosition); other games use their fixed label.
const clueLabelOf = (gameConfig, puzzle) => {
  if (puzzle.prompt) return puzzle.prompt
  if (gameConfig.clueLabelUnmarked && puzzle.wrongPosition === undefined) return gameConfig.clueLabelUnmarked
  return gameConfig.clueLabel
}

const splitTypoClue = (clue, wrongPosition) =>
  [...(clue || '')].map((char, index) => ({ char, wrong: index === wrongPosition }))

const describePoemSource = (source) => {
  if (!source || !source.poemTitle) return ''
  const dynasty = source.dynasty ? `〔${source.dynasty}〕` : ''
  return `${dynasty}${source.author}《${source.poemTitle}》`
}

module.exports = { GAME_TYPES, GAME_ORDER, GAME_CONFIGS, gameConfigOf, hintTextsOf, clueLabelOf, describePoemSource, splitTypoClue }
