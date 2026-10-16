const { db } = require('./cloud')
const { isItemType } = require('./items')
const { isGameType } = require('./games')

const RULES_DOC_ID = 'game_rules'

const IDIOM_BASELINE_TITLES = [
  { name: '蒙童', minSolved: 0 },
  { name: '童生', minSolved: 10 },
  { name: '秀才', minSolved: 30 },
  { name: '廪生', minSolved: 60 },
  { name: '贡生', minSolved: 100 },
  { name: '举人', minSolved: 150 },
  { name: '解元', minSolved: 220 },
  { name: '贡士', minSolved: 300 },
  { name: '会元', minSolved: 400 },
  { name: '进士', minSolved: 500 },
  { name: '探花', minSolved: 600 },
  { name: '榜眼', minSolved: 700 },
  { name: '状元', minSolved: 800 },
  { name: '翰林', minSolved: 900 },
  { name: '大学士', minSolved: 1000 }
]

const POETRY_BASELINE_TITLES = [
  { name: '学童', minSolved: 0 },
  { name: '诗童', minSolved: 10 },
  { name: '吟者', minSolved: 30 },
  { name: '诗友', minSolved: 60 },
  { name: '诗客', minSolved: 100 },
  { name: '词人', minSolved: 160 },
  { name: '诗家', minSolved: 240 },
  { name: '诗翁', minSolved: 320 },
  { name: '诗仙', minSolved: 400 },
  { name: '诗圣', minSolved: 500 }
]

const XIEHOUYU_BASELINE_TITLES = [
  { name: '听众', minSolved: 0 },
  { name: '学徒', minSolved: 5 },
  { name: '票友', minSolved: 15 },
  { name: '说书人', minSolved: 30 },
  { name: '评书家', minSolved: 50 },
  { name: '名角', minSolved: 75 },
  { name: '曲艺大师', minSolved: 100 },
  { name: '相声小明星', minSolved: 140 },
  { name: '歇后语百事通', minSolved: 180 },
  { name: '语言小魔术师', minSolved: 239 }
]

const TYPO_BASELINE_TITLES = [
  { name: '书童', minSolved: 0 },
  { name: '识字郎', minSolved: 10 },
  { name: '校对员', minSolved: 30 },
  { name: '小编辑', minSolved: 60 },
  { name: '编辑', minSolved: 100 },
  { name: '主编', minSolved: 160 },
  { name: '总编', minSolved: 240 },
  { name: '活字典', minSolved: 350 },
  { name: '字圣', minSolved: 500 }
]

const HANZI_BASELINE_TITLES = [
  { name: '识字娃娃', minSolved: 0 },
  { name: '小书童', minSolved: 10 },
  { name: '识字小星', minSolved: 30 },
  { name: '识字能手', minSolved: 60 },
  { name: '小小读书郎', minSolved: 100 },
  { name: '识字小博士', minSolved: 160 },
  { name: '汉字小达人', minSolved: 240 },
  { name: '识字小状元', minSolved: 320 },
  { name: '汉字小字典', minSolved: 400 },
  { name: '汉字小书法家', minSolved: 550 },
  { name: '识字小行家', minSolved: 700 },
  { name: '汉字大侦探', minSolved: 850 },
  { name: '汉字小宗师', minSolved: 1000 },
  { name: '识字大将军', minSolved: 1200 },
  { name: '汉字小神童', minSolved: 1400 },
  { name: '汉字状元郎', minSolved: 1600 }
]

const MATH_BASELINE_TITLES = [
  { name: '口算小兵', minSolved: 0 },
  { name: '口算小将', minSolved: 10 },
  { name: '计算小能手', minSolved: 30 },
  { name: '速算小达人', minSolved: 60 },
  { name: '口算小博士', minSolved: 100 },
  { name: '数学小状元', minSolved: 160 },
  { name: '口算大王', minSolved: 240 },
  { name: '数学小天才', minSolved: 360 },
  { name: '口算宗师', minSolved: 500 },
  { name: '口算小神童', minSolved: 600 },
  { name: '闪电计算王', minSolved: 700 },
  { name: '数字魔法师', minSolved: 800 },
  { name: '口算大将军', minSolved: 900 },
  { name: '口算状元郎', minSolved: 999 }
]

const RIDDLE_BASELINE_TITLES = [
  { name: '小机灵', minSolved: 0 },
  { name: '点子多', minSolved: 10 },
  { name: '转得快', minSolved: 30 },
  { name: '鬼点子', minSolved: 60 },
  { name: '脑洞大', minSolved: 100 },
  { name: '智多星', minSolved: 150 },
  { name: '奇思王', minSolved: 210 },
  { name: '妙想大师', minSolved: 280 }
]
const MIYU_BASELINE_TITLES = [
  { name: '小谜童', minSolved: 0 },
  { name: '猜谜手', minSolved: 10 },
  { name: '谜语通', minSolved: 40 },
  { name: '谜语大王', minSolved: 100 },
  { name: '谜中高手', minSolved: 180 },
  { name: '谜坛宗师', minSolved: 260 }
]
const BASELINE_TITLES_BY_GAME = {
  idiom: IDIOM_BASELINE_TITLES,
  poetry: POETRY_BASELINE_TITLES,
  xiehouyu: XIEHOUYU_BASELINE_TITLES,
  riddle: RIDDLE_BASELINE_TITLES,
  miyu: MIYU_BASELINE_TITLES,
  typo: TYPO_BASELINE_TITLES,
  hanzi: HANZI_BASELINE_TITLES,
  math: MATH_BASELINE_TITLES
}

const DEFAULT_RULES = {
  signupItems: { hint: 8, stamina: 50 },
  checkinRewards: [
    { type: 'hint', amount: 1 },
    { type: 'stamina', amount: 5 }
  ],
  // 每日挑战: paid once a day for finishing (any score); flowers come from honors.flowers.perEvent.
  daily: {
    rewards: [{ type: 'stamina', amount: 5 }]
  },
  ad: {
    enabled: false,
    adUnitId: '',
    rewards: { hint: 2, stamina: 10 },
    dailyLimits: { hint: 10, stamina: 10 }
  },
  level: {
    staminaCost: 1,
    maxWrongAttempts: 3
  },
  levelByGame: {
    typo: { maxWrongAttempts: 1 },
    // Four choices: one more try than 找错字's eight, so a single slip does not end a young child's attempt.
    hanzi: { maxWrongAttempts: 2 }
  },
  staminaRecovery: {
    enabled: true,
    intervalMinutes: 30,
    dailyCap: 15
  },
  rescue: {
    dailyLimitPerHelper: 2,
    maxWrongAnswersPerHelper: 3
  },
  milestone: {
    everyLevels: 10,
    // Chest n holds base + step × ⌊(n − 1) / everyChests⌋, at most max. Every bigChest.everyChests-th chest is a big
    // one: its amount is multiplied by bigChest.multiplier, unless the type has its own big rule — then big chests
    // from big.fromChest on hold big.amount instead, and earlier big chests are ordinary.
    // Hints: 1 in each of the first 10 chests (levels 10–100), 2 from the 11th, and 3 in each big chest from then on.
    rewardRules: {
      stamina: { base: 10, step: 2, everyChests: 1, max: 20 },
      hint: { base: 1, step: 1, everyChests: 10, max: 2, big: { fromChest: 11, amount: 3 } }
    },
    bigChest: { everyChests: 5, multiplier: 2 }
  },
  practice: {
    solvedRewards: [
      { every: 20, rewards: [{ type: 'stamina', amount: 2 }] },
      { every: 50, rewards: [{ type: 'hint', amount: 1 }] }
    ],
    streakRewards: {
      milestones: [
        { streak: 10, rewards: [{ type: 'stamina', amount: 2 }] },
        { streak: 20, rewards: [{ type: 'hint', amount: 1 }] },
        { streak: 30, rewards: [{ type: 'stamina', amount: 3 }] },
        { streak: 50, rewards: [{ type: 'hint', amount: 2 }] }
      ],
      repeatEvery: 50,
      repeatRewards: [{ type: 'stamina', amount: 3 }]
    },
    dailyCaps: { stamina: 15, hint: 3 },
    multiplication: {
      rowMastered: [{ type: 'stamina', amount: 5 }],
      rowPerfect: [{ type: 'hint', amount: 1 }],
      grandmaster: [{ type: 'stamina', amount: 10 }, { type: 'hint', amount: 3 }]
    }
  },
  honors: {
    flowers: {
      arithmeticSolvedEvery: 10,
      arithmeticStreaks: [10],
      perEvent: { arithmeticSolved: 1, arithmeticStreak: 1, dailyFirst: 1, rowRecited: 1, rowMastered: 1, rowPerfect: 1, examPerfect: 3, examGreat: 2, examPassed: 1, islandMaster: 5, dailyChallenge: 2, dailyPerfect: 1 },
      // Flowers a child can earn in one Beijing day; the phone reports some events, so this keeps them meaningful.
      dailyCap: 40
    }
  },
  titles: BASELINE_TITLES_BY_GAME,
  maintenance: {
    itemLogRetentionDays: 180,
    dailyRecordRetentionDays: 7
  },
  admin: {
    openids: []
  },
  leaderboard: {
    size: 100
  }
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

const mergeRules = (defaults, overrides) => {
  if (!isPlainObject(overrides)) return defaults
  const merged = { ...defaults }
  Object.keys(overrides).forEach((key) => {
    merged[key] = isPlainObject(defaults[key]) ? mergeRules(defaults[key], overrides[key]) : overrides[key]
  })
  return merged
}

const isBoolean = (value) => typeof value === 'boolean'
const isString = (value) => typeof value === 'string'
const isNonNegativeInteger = (value) => Number.isInteger(value) && value >= 0
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0
const isBigChestRule = (value) => value === undefined || (isPlainObject(value) && isPositiveInteger(value.fromChest) && isNonNegativeInteger(value.amount))
const LEADERBOARD_MAX_SIZE = 1000
const isLeaderboardSize = (value) => isPositiveInteger(value) && value <= LEADERBOARD_MAX_SIZE
const isStringList = (value) => Array.isArray(value) && value.every(isString)
const isRewardList = (value) =>
  Array.isArray(value) &&
  value.every((reward) => isPlainObject(reward) && isItemType(reward.type) && isPositiveInteger(reward.amount))

const isSolvedRewardRules = (value) =>
  Array.isArray(value) && value.every((rule) => isPlainObject(rule) && isPositiveInteger(rule.every) && isRewardList(rule.rewards))
const isStreakMilestones = (value) =>
  Array.isArray(value) &&
  value.every(
    (milestone, index) =>
      isPlainObject(milestone) &&
      isPositiveInteger(milestone.streak) &&
      isRewardList(milestone.rewards) &&
      (index === 0 || milestone.streak > value[index - 1].streak)
  )

const isIncreasingPositiveList = (value) =>
  Array.isArray(value) && value.every((item, index) => isPositiveInteger(item) && (index === 0 || item > value[index - 1]))

// null means no daily limit, so it can be switched between "unlimited" and a number by config alone.
const isOptionalLimit = (value) => value === null || isNonNegativeInteger(value)

const RULE_VALIDATORS = {
  'signupItems.hint': isNonNegativeInteger,
  'signupItems.stamina': isNonNegativeInteger,
  checkinRewards: isRewardList,
  'daily.rewards': isRewardList,
  'ad.enabled': isBoolean,
  'ad.adUnitId': isString,
  'ad.rewards.hint': isNonNegativeInteger,
  'ad.rewards.stamina': isNonNegativeInteger,
  'ad.dailyLimits.hint': isOptionalLimit,
  'ad.dailyLimits.stamina': isOptionalLimit,
  'level.staminaCost': isNonNegativeInteger,
  'level.maxWrongAttempts': isPositiveInteger,
  'staminaRecovery.enabled': isBoolean,
  'staminaRecovery.intervalMinutes': isPositiveInteger,
  'staminaRecovery.dailyCap': isNonNegativeInteger,
  'rescue.dailyLimitPerHelper': isNonNegativeInteger,
  'rescue.maxWrongAnswersPerHelper': isPositiveInteger,
  'milestone.everyLevels': isPositiveInteger,
  'milestone.rewardRules.stamina.base': isNonNegativeInteger,
  'milestone.rewardRules.stamina.step': isNonNegativeInteger,
  'milestone.rewardRules.stamina.everyChests': isPositiveInteger,
  'milestone.rewardRules.stamina.max': isNonNegativeInteger,
  'milestone.rewardRules.hint.base': isNonNegativeInteger,
  'milestone.rewardRules.hint.step': isNonNegativeInteger,
  'milestone.rewardRules.hint.everyChests': isPositiveInteger,
  'milestone.rewardRules.hint.max': isNonNegativeInteger,
  'milestone.rewardRules.hint.big': isBigChestRule,
  'milestone.bigChest.everyChests': isPositiveInteger,
  'milestone.bigChest.multiplier': isPositiveInteger,
  'maintenance.itemLogRetentionDays': isPositiveInteger,
  'maintenance.dailyRecordRetentionDays': isPositiveInteger,
  'practice.solvedRewards': isSolvedRewardRules,
  'practice.streakRewards.milestones': isStreakMilestones,
  'practice.streakRewards.repeatEvery': isNonNegativeInteger,
  'practice.streakRewards.repeatRewards': isRewardList,
  'practice.dailyCaps.hint': isNonNegativeInteger,
  'practice.dailyCaps.stamina': isNonNegativeInteger,
  'practice.multiplication.rowMastered': isRewardList,
  'practice.multiplication.rowPerfect': isRewardList,
  'practice.multiplication.grandmaster': isRewardList,
  'honors.flowers.arithmeticSolvedEvery': isPositiveInteger,
  'honors.flowers.dailyCap': isPositiveInteger,
  'honors.flowers.arithmeticStreaks': isIncreasingPositiveList,
  'honors.flowers.perEvent.arithmeticSolved': isNonNegativeInteger,
  'honors.flowers.perEvent.arithmeticStreak': isNonNegativeInteger,
  'honors.flowers.perEvent.dailyFirst': isNonNegativeInteger,
  'honors.flowers.perEvent.rowRecited': isNonNegativeInteger,
  'honors.flowers.perEvent.rowMastered': isNonNegativeInteger,
  'honors.flowers.perEvent.rowPerfect': isNonNegativeInteger,
  'honors.flowers.perEvent.examPerfect': isNonNegativeInteger,
  'honors.flowers.perEvent.examGreat': isNonNegativeInteger,
  'honors.flowers.perEvent.examPassed': isNonNegativeInteger,
  'honors.flowers.perEvent.islandMaster': isNonNegativeInteger,
  'honors.flowers.perEvent.dailyChallenge': isNonNegativeInteger,
  'honors.flowers.perEvent.dailyPerfect': isNonNegativeInteger,
  'admin.openids': isStringList,
  'leaderboard.size': isLeaderboardSize
}

const readPath = (source, path) => path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), source)

const writePath = (target, path, value) => {
  const keys = path.split('.')
  const parent = keys.slice(0, -1).reduce((node, key) => node[key], target)
  parent[keys[keys.length - 1]] = value
}

const LEVEL_FIELD_VALIDATORS = {
  staminaCost: RULE_VALIDATORS['level.staminaCost'],
  maxWrongAttempts: RULE_VALIDATORS['level.maxWrongAttempts']
}

const sanitizeLevelByGame = (levelByGame, rejected) => {
  if (!isPlainObject(levelByGame)) {
    rejected.push('levelByGame')
    return {}
  }
  const sanitized = {}
  Object.entries(levelByGame).forEach(([gameType, overrides]) => {
    if (!isGameType(gameType) || !isPlainObject(overrides)) {
      rejected.push(`levelByGame.${gameType}`)
      return
    }
    sanitized[gameType] = {}
    const defaults = DEFAULT_RULES.levelByGame[gameType] || {}
    Object.entries(overrides).forEach(([field, value]) => {
      const validator = LEVEL_FIELD_VALIDATORS[field]
      if (validator && validator(value)) {
        sanitized[gameType][field] = value
        return
      }
      rejected.push(`levelByGame.${gameType}.${field}`)
      if (field in defaults) sanitized[gameType][field] = defaults[field]
    })
  })
  return sanitized
}

const replaceInvalidFields = (rules) => {
  const validated = JSON.parse(JSON.stringify(rules))
  const rejected = Object.keys(RULE_VALIDATORS).filter((path) => !RULE_VALIDATORS[path](readPath(validated, path)))
  rejected.forEach((path) => writePath(validated, path, JSON.parse(JSON.stringify(readPath(DEFAULT_RULES, path)))))
  validated.levelByGame = sanitizeLevelByGame(validated.levelByGame, rejected)
  if (validated.ad.enabled && !validated.ad.adUnitId) {
    validated.ad.enabled = false
    rejected.push('ad.enabled (adUnitId is empty)')
  }
  if (rejected.length) {
    console.error('[rules] invalid config fields fell back to defaults:', rejected.join(', '))
  }
  return validated
}

const isSameTitle = (left, right) => left.name === right.name && left.minSolved === right.minSolved

const isAppendOnlyExtension = (titles, baseline) => {
  if (!Array.isArray(titles) || titles.length < baseline.length) return false
  if (!baseline.every((title, index) => isSameTitle(title, titles[index]))) return false
  const names = new Set(titles.map((title) => title.name))
  const thresholdsIncrease = titles.every(
    (title, index) => index === 0 || (Number.isInteger(title.minSolved) && title.minSolved > titles[index - 1].minSolved)
  )
  return names.size === titles.length && thresholdsIncrease
}

// A configured list that is just the start of the baseline (an older copy, from before titles were added in code)
// means nothing was customised: the baseline is used without a complaint.
const isBaselinePrefix = (titles, baseline) =>
  Array.isArray(titles) && titles.length <= baseline.length && titles.every((title, index) => isSameTitle(title, baseline[index]))

const resolveTitles = (titlesByGame) => {
  const configured = isPlainObject(titlesByGame) ? titlesByGame : {}
  return Object.fromEntries(
    Object.entries(BASELINE_TITLES_BY_GAME).map(([gameType, baseline]) => {
      const titles = configured[gameType]
      if (isAppendOnlyExtension(titles, baseline)) return [gameType, titles]
      if (titles !== baseline && !isBaselinePrefix(titles, baseline)) {
        console.error(`[rules] titles.${gameType} rejected: keep the baseline unchanged and only append higher tiers`, titles)
      }
      return [gameType, baseline]
    })
  )
}

const loadRules = async () => {
  try {
    const { data } = await db.collection('app_config').doc(RULES_DOC_ID).get()
    const rules = replaceInvalidFields(mergeRules(DEFAULT_RULES, data))
    return { ...rules, titles: resolveTitles(rules.titles) }
  } catch (error) {
    console.error('[rules] game_rules unavailable, using defaults:', error.message)
    return DEFAULT_RULES
  }
}

const rulesForGame = (rules, gameType) => ({
  ...rules,
  level: { ...rules.level, ...((rules.levelByGame || {})[gameType] || {}) }
})

const loadRulesForGame = async (gameType) => rulesForGame(await loadRules(), gameType)

const sumRewardsByType = (rewards) =>
  rewards.reduce((totals, reward) => {
    totals[reward.type] = (totals[reward.type] || 0) + reward.amount
    return totals
  }, {})

const toClientRules = (rules) => ({
  checkinRewards: rules.checkinRewards,
  daily: { rewards: rules.daily.rewards },
  ad: {
    enabled: rules.ad.enabled,
    adUnitId: rules.ad.adUnitId,
    rewards: rules.ad.rewards,
    dailyLimits: rules.ad.dailyLimits
  },
  level: rules.level,
  levelByGame: rules.levelByGame,
  staminaRecovery: rules.staminaRecovery,
  rescue: rules.rescue,
  milestone: {
    everyLevels: rules.milestone.everyLevels,
    bigChest: rules.milestone.bigChest,
    firstChestRewards: Object.entries(rules.milestone.rewardRules)
      .map(([type, rule]) => ({ type, amount: Math.min(rule.max, rule.base) }))
      .filter((reward) => reward.amount > 0)
  },
  practice: {
    dailyCaps: rules.practice.dailyCaps
  }
})

module.exports = { loadRules, loadRulesForGame, rulesForGame, sumRewardsByType, toClientRules, DEFAULT_RULES }
