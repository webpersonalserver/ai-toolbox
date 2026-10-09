const { db } = require('./cloud')
const { isItemType } = require('./items')

const RULES_DOC_ID = 'game_rules'

const BASELINE_TITLES = [
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

const DEFAULT_RULES = {
  signupItems: { hint: 10, stamina: 25 },
  checkinRewards: [
    { type: 'hint', amount: 3 },
    { type: 'stamina', amount: 5 }
  ],
  ad: {
    enabled: false,
    adUnitId: '',
    rewards: { hint: 2, stamina: 3 },
    dailyLimits: { hint: 5, stamina: 5 }
  },
  level: {
    staminaCost: 1,
    maxWrongAttempts: 3,
    maxHints: 3
  },
  staminaRecovery: {
    enabled: true,
    intervalMinutes: 30,
    cap: 10
  },
  rescue: {
    dailyLimitPerHelper: 2,
    maxWrongAnswersPerHelper: 3
  },
  milestone: {
    everyLevels: 10,
    rewards: [
      { type: 'hint', amount: 2 },
      { type: 'stamina', amount: 3 }
    ]
  },
  titles: BASELINE_TITLES,
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
const LEADERBOARD_MAX_SIZE = 1000
const isLeaderboardSize = (value) => isPositiveInteger(value) && value <= LEADERBOARD_MAX_SIZE
const isStringList = (value) => Array.isArray(value) && value.every(isString)
const isRewardList = (value) =>
  Array.isArray(value) &&
  value.every((reward) => isPlainObject(reward) && isItemType(reward.type) && isPositiveInteger(reward.amount))

const RULE_VALIDATORS = {
  'signupItems.hint': isNonNegativeInteger,
  'signupItems.stamina': isNonNegativeInteger,
  checkinRewards: isRewardList,
  'ad.enabled': isBoolean,
  'ad.adUnitId': isString,
  'ad.rewards.hint': isNonNegativeInteger,
  'ad.rewards.stamina': isNonNegativeInteger,
  'ad.dailyLimits.hint': isNonNegativeInteger,
  'ad.dailyLimits.stamina': isNonNegativeInteger,
  'level.staminaCost': isNonNegativeInteger,
  'level.maxWrongAttempts': isPositiveInteger,
  'level.maxHints': isNonNegativeInteger,
  'staminaRecovery.enabled': isBoolean,
  'staminaRecovery.intervalMinutes': isPositiveInteger,
  'staminaRecovery.cap': isNonNegativeInteger,
  'rescue.dailyLimitPerHelper': isNonNegativeInteger,
  'rescue.maxWrongAnswersPerHelper': isPositiveInteger,
  'milestone.everyLevels': isPositiveInteger,
  'milestone.rewards': isRewardList,
  'maintenance.itemLogRetentionDays': isPositiveInteger,
  'maintenance.dailyRecordRetentionDays': isPositiveInteger,
  'admin.openids': isStringList,
  'leaderboard.size': isLeaderboardSize
}

const readPath = (source, path) => path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), source)

const writePath = (target, path, value) => {
  const keys = path.split('.')
  const parent = keys.slice(0, -1).reduce((node, key) => node[key], target)
  parent[keys[keys.length - 1]] = value
}

const replaceInvalidFields = (rules) => {
  const validated = JSON.parse(JSON.stringify(rules))
  const rejected = Object.keys(RULE_VALIDATORS).filter((path) => !RULE_VALIDATORS[path](readPath(validated, path)))
  rejected.forEach((path) => writePath(validated, path, JSON.parse(JSON.stringify(readPath(DEFAULT_RULES, path)))))
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

const isAppendOnlyExtension = (titles) => {
  if (!Array.isArray(titles) || titles.length < BASELINE_TITLES.length) return false
  if (!BASELINE_TITLES.every((title, index) => isSameTitle(title, titles[index]))) return false
  const names = new Set(titles.map((title) => title.name))
  const thresholdsIncrease = titles.every(
    (title, index) => index === 0 || (Number.isInteger(title.minSolved) && title.minSolved > titles[index - 1].minSolved)
  )
  return names.size === titles.length && thresholdsIncrease
}

const resolveTitles = (titles) => {
  if (isAppendOnlyExtension(titles)) return titles
  console.error('[rules] titles config rejected: keep the baseline unchanged and only append higher tiers', titles)
  return BASELINE_TITLES
}

const loadRules = async () => {
  try {
    const { data } = await db.collection('app_config').doc(RULES_DOC_ID).get()
    const rules = replaceInvalidFields(mergeRules(DEFAULT_RULES, data))
    return { ...rules, titles: resolveTitles(rules.titles) }
  } catch (error) {
    return DEFAULT_RULES
  }
}

const sumRewardsByType = (rewards) =>
  rewards.reduce((totals, reward) => {
    totals[reward.type] = (totals[reward.type] || 0) + reward.amount
    return totals
  }, {})

const toClientRules = (rules) => ({
  checkinRewards: rules.checkinRewards,
  ad: {
    enabled: rules.ad.enabled,
    adUnitId: rules.ad.adUnitId,
    rewards: rules.ad.rewards
  },
  level: rules.level,
  staminaRecovery: rules.staminaRecovery,
  rescue: rules.rescue,
  milestone: rules.milestone
})

module.exports = { loadRules, sumRewardsByType, toClientRules, DEFAULT_RULES }
