const { ITEM_TYPES, describeAmount, describeRewards } = require('./items')

const buildRuleLines = (rules) => {
  const lines = [
    `每关消耗 ${rules.level.staminaCost} 点体力，答错 ${rules.level.maxWrongAttempts} 次挑战失败，再来一次需重新消耗体力`,
    `每天打卡领取 ${describeRewards(rules.checkinRewards)}`
  ]
  if (rules.staminaRecovery.enabled) {
    lines.push(`体力每 ${rules.staminaRecovery.intervalMinutes} 分钟恢复 1 点，最多自动恢复到 ${rules.staminaRecovery.cap} 点`)
  }
  if (rules.ad.enabled) {
    const adRewards = Object.values(ITEM_TYPES)
      .filter((itemType) => rules.ad.rewards[itemType] > 0)
      .map((itemType) => describeAmount(itemType, rules.ad.rewards[itemType]))
    lines.push(`道具不足时，看完一段视频可得 ${adRewards.join(' 或 ')}`)
  }
  lines.push(`每通过 ${rules.milestone.everyLevels} 关可开一个宝箱，获得 ${describeRewards(rules.milestone.rewards)}`)
  lines.push(`每关最多提示 ${rules.level.maxHints} 次；卡关可免费求助好友，同一位好友每天最多帮你 ${rules.rescue.dailyLimitPerHelper} 次`)
  return lines
}

const describeStaminaSources = (rules) => {
  const checkin = `每天打卡可领 ${describeRewards(rules.checkinRewards)}`
  if (!rules.staminaRecovery.enabled) return checkin
  return `体力每 ${rules.staminaRecovery.intervalMinutes} 分钟恢复 1 点，${checkin}`
}

const buildGuideSections = (rules) => {
  const { staminaCost, maxWrongAttempts, maxHints } = rules.level
  return [
    { title: '开始挑战', text: `每次挑战消耗 ${staminaCost} 点体力，有 ${maxWrongAttempts} 次答错机会` },
    { title: '挑战失败', text: `答错 ${maxWrongAttempts} 次即失败，再来一次需要重新消耗体力，已揭开的字会保留` },
    { title: '卡住了', text: `用提示揭开一个字（每关最多 ${maxHints} 次），或者免费求助好友，好友答对你直接过关` },
    { title: '补充体力', text: describeStaminaSources(rules) }
  ]
}

module.exports = { buildRuleLines, buildGuideSections }
