const { ITEM_TYPES, describeAmount, describeRewards } = require('./items')
const { hintTextsOf, gameConfigOf } = require('./games')

const levelRulesOf = (rules, gameType) => ({ ...rules.level, ...((rules.levelByGame || {})[gameType] || {}) })

const describeLevelOverrides = (rules) =>
  Object.entries(rules.levelByGame || {})
    .filter(([, overrides]) => overrides.maxWrongAttempts !== undefined && overrides.maxWrongAttempts !== rules.level.maxWrongAttempts)
    .map(([gameType, overrides]) => `${gameConfigOf(gameType).name}答错 ${overrides.maxWrongAttempts} 次即失败`)

const buildRuleSections = (rules) => {
  const sections = [
    {
      title: '闯关',
      text: [`每关消耗 ${rules.level.staminaCost} 点体力，答错 ${rules.level.maxWrongAttempts} 次挑战失败，再来一次需重新消耗体力`]
        .concat(describeLevelOverrides(rules))
        .join('；')
    },
    { title: '每日打卡', text: `每天领取 ${describeRewards(rules.checkinRewards)}` }
  ]
  if (rules.staminaRecovery.enabled) {
    sections.push({ title: '体力恢复', text: `每 ${rules.staminaRecovery.intervalMinutes} 分钟恢复 1 点，最多自动恢复到 ${rules.staminaRecovery.cap} 点` })
  }
  if (rules.ad.enabled) {
    const adRewards = Object.values(ITEM_TYPES)
      .filter((itemType) => rules.ad.rewards[itemType] > 0)
      .map((itemType) => describeAmount(itemType, rules.ad.rewards[itemType]))
    sections.push({ title: '看视频', text: `道具不足时，看完一段视频可得 ${adRewards.join(' 或 ')}` })
  }
  const { everyLevels, bigChest, firstChestRewards } = rules.milestone
  sections.push({
    title: '宝箱',
    text: `每通过 ${everyLevels} 关开一个宝箱，第一个就有 ${describeRewards(firstChestRewards)}，越往后越多；每第 ${bigChest.everyChests} 个是大宝箱，奖励翻 ${bigChest.multiplier} 倍。没领的宝箱可以在大厅的「福利袋」里领`
  })
  if (rules.practice) {
    const { dailyCaps } = rules.practice
    sections.push({
      title: '趣味练习',
      text: `体力不够时去「趣味」练一练：加减运算答对题数、连对数达标得宝箱（每天最多 ${describeAmount(ITEM_TYPES.STAMINA, dailyCaps.stamina)}、${describeAmount(ITEM_TYPES.HINT, dailyCaps.hint)}）；九九神功每练成一重也有宝箱`
    })
  }
  sections.push({ title: '提示与求助', text: `每关最多提示 ${rules.level.maxHints} 次；卡关可免费求助好友，同一位好友每天最多帮你 ${rules.rescue.dailyLimitPerHelper} 次` })
  return sections
}

const describeStaminaSources = (rules) => {
  const checkin = `每天打卡可领 ${describeRewards(rules.checkinRewards)}`
  if (!rules.staminaRecovery.enabled) return checkin
  return `体力每 ${rules.staminaRecovery.intervalMinutes} 分钟恢复 1 点，${checkin}`
}

const buildGuideSections = (rules, gameConfig, maxHints) => {
  const { staminaCost, maxWrongAttempts } = levelRulesOf(rules, gameConfig.gameType)
  const { hintEffect, keptAfterFailure } = hintTextsOf(gameConfig)
  return [
    { title: '开始挑战', text: `每次挑战消耗 ${staminaCost} 点体力，有 ${maxWrongAttempts} 次答错机会` },
    { title: '挑战失败', text: `答错 ${maxWrongAttempts} 次即失败，再来一次需要重新消耗体力，${keptAfterFailure}会保留` },
    { title: '卡住了', text: `用提示${hintEffect}（每关最多 ${maxHints} 次），或者免费求助好友，好友答对你直接过关` },
    { title: '补充体力', text: describeStaminaSources(rules) }
  ]
}

module.exports = { buildRuleSections, buildGuideSections, levelRulesOf }
