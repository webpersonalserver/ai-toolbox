const { ITEM_TYPES, describeAmount, describeRewards } = require('./items')
const { hintTextsOf, gameConfigOf } = require('./games')
const { isSwitchOn } = require('./switches')

// How far hints go, following 提示不能直接给出答案 in 控制中心.
const hintReachText = () => (isSwitchOn('hintKeepLastStep') ? '最后一个字（或最后两个选项）要自己完成' : '用到底就能直接揭开答案')

const levelRulesOf = (rules, gameType) => ({ ...rules.level, ...((rules.levelByGame || {})[gameType] || {}) })

const describeLevelOverrides = (rules) =>
  Object.entries(rules.levelByGame || {})
    .filter(([, overrides]) => overrides.maxWrongAttempts !== undefined && overrides.maxWrongAttempts !== rules.level.maxWrongAttempts)
    .map(([gameType, overrides]) => `${gameConfigOf(gameType).name}有 ${overrides.maxWrongAttempts} 颗❤️`)

const buildRuleSections = (rules) => {
  const sections = [
    {
      title: '闯关',
      text: [`每关用 ${rules.level.staminaCost} 点体力，有 ${rules.level.maxWrongAttempts} 颗❤️，答错一次少一颗；❤️ 用完再来一次要重新用体力`]
        .concat(describeLevelOverrides(rules))
        .join('；')
    },
    { title: '每日打卡', text: `每天领取 ${describeRewards(rules.checkinRewards)}` }
  ]
  if (rules.staminaRecovery.enabled) {
    sections.push({ title: '体力恢复', text: `每 ${rules.staminaRecovery.intervalMinutes} 分钟恢复 1 点，每天最多恢复 ${rules.staminaRecovery.dailyCap} 点，恢复的体力自动到账` })
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
    text: `每闯过 ${everyLevels} 关开一个宝箱，第一个就有 ${describeRewards(firstChestRewards)}，越往后越多；每第 ${bigChest.everyChests} 个是大宝箱，奖励更多。没开的宝箱可以在「我的宝箱」里打开`
  })
  if (rules.practice) {
    const { dailyCaps } = rules.practice
    sections.push({
      title: '趣味练习',
      text: `体力不够时去「趣味」练一练：数理乐园答对题数、连对数达标得宝箱（每天最多 ${describeAmount(ITEM_TYPES.STAMINA, dailyCaps.stamina)}、${describeAmount(ITEM_TYPES.HINT, dailyCaps.hint)}）；九九神功每练成一重也有宝箱`
    })
  }
  sections.push({ title: '提示与求助', text: `提示不限次数，每次消耗 1 个提示道具，${hintReachText()}；卡关可免费求助好友，同一位好友每天最多帮你 ${rules.rescue.dailyLimitPerHelper} 次` })
  return sections
}

const describeStaminaSources = (rules) => {
  const checkin = `每天打卡可领 ${describeRewards(rules.checkinRewards)}`
  if (!rules.staminaRecovery.enabled) return checkin
  return `体力每 ${rules.staminaRecovery.intervalMinutes} 分钟恢复 1 点，${checkin}`
}

// First-run guide for a 6-10 year old: three short lines with an icon each, the detail in small print below.
// There is deliberately no "挑战失败" line; losing all hearts is explained gently on the play page when it happens.
const buildGuideSections = (rules, gameConfig) => {
  const { staminaCost, maxWrongAttempts } = levelRulesOf(rules, gameConfig.gameType)
  const { hintEffect, keptAfterFailure } = hintTextsOf(gameConfig)
  return [
    { title: `⚡ 开一关用 ${staminaCost} 点体力`, text: describeStaminaSources(rules) },
    { title: `❤️ 有 ${maxWrongAttempts} 颗❤️，答错少一颗`, text: `用完了就再来一次，${keptAfterFailure}会帮你留着` },
    { title: '💡 卡住了？用提示，或者求助好友', text: `提示能${hintEffect}，不限次数，${hintReachText()}；好友答对，你就直接过关` }
  ]
}

module.exports = { buildRuleSections, buildGuideSections, levelRulesOf }
