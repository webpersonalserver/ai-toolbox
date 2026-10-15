const { db } = require('../lib/cloud')
const { ERROR_CODES, BusinessError } = require('../lib/response')
const { loadRules } = require('../lib/rules')
const { computeClearStats } = require('../lib/stats')
const { parseGameType } = require('../lib/games')
const { recentAdStats } = require('../lib/ad-stats')
const { DEFAULT_SWITCHES, NUMBER_RANGES, loadSwitches, parseSwitchPatch, saveSwitches } = require('../lib/switches')

const RECENT_COMPLETION_LIMIT = 20
const DAILY_HISTORY_LIMIT = 30
const AD_STATS_DAYS = 7

const isAdmin = (rules, openid) => rules.admin.openids.includes(openid)

const assertAdmin = async (openid) => {
  const rules = await loadRules()
  if (!isAdmin(rules, openid)) {
    throw new BusinessError(ERROR_CODES.FORBIDDEN, '没有权限')
  }
}

const stats = async ({ openid, payload }) => {
  await assertAdmin(openid)
  const gameType = parseGameType(payload)
  const [current, { data: recentCompletions }, { data: dailyHistory }, adStats] = await Promise.all([
    computeClearStats(gameType),
    db.collection('completions').where({ gameType }).orderBy('completedAt', 'desc').limit(RECENT_COMPLETION_LIMIT).get(),
    db.collection('stats_daily').where({ gameType }).orderBy('date', 'desc').limit(DAILY_HISTORY_LIMIT).get(),
    recentAdStats(AD_STATS_DAYS)
  ])
  return {
    current,
    recentCompletions: recentCompletions.map((completion) => ({
      nickname: completion.nickname,
      openid: completion.openid,
      totalLevels: completion.totalLevels,
      date: completion.date
    })),
    dailyHistory: dailyHistory.map((snapshot) => ({
      date: snapshot.date,
      totalUsers: snapshot.totalUsers,
      clearedUsers: snapshot.clearedUsers,
      clearRate: snapshot.clearRate,
      totalLevels: snapshot.totalLevels,
      completionsToday: snapshot.completionsToday
    })),
    adStats
  }
}

// 控制中心: read and flip the feature switches (lib/switches.js). Admins only. Defaults and number ranges go along,
// so the page does not keep its own copy.
const switchesView = (values) => ({ switches: values, defaults: DEFAULT_SWITCHES, ranges: NUMBER_RANGES })

const switches = async ({ openid }) => {
  await assertAdmin(openid)
  return switchesView(await loadSwitches())
}

const updateSwitches = async ({ openid, payload }) => {
  await assertAdmin(openid)
  const patch = parseSwitchPatch(payload.switches)
  if (!patch) throw new BusinessError(ERROR_CODES.BAD_REQUEST, '开关参数不正确')
  return switchesView(await saveSwitches(patch))
}

module.exports = { stats, switches, updateSwitches, isAdmin }
