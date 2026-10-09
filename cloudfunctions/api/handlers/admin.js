const { db } = require('../lib/cloud')
const { ERROR_CODES, BusinessError } = require('../lib/response')
const { loadRules } = require('../lib/rules')
const { computeClearStats } = require('../lib/stats')
const { GAME_TYPE } = require('./idiom')

const RECENT_COMPLETION_LIMIT = 20
const DAILY_HISTORY_LIMIT = 30

const isAdmin = (rules, openid) => rules.admin.openids.includes(openid)

const assertAdmin = async (openid) => {
  const rules = await loadRules()
  if (!isAdmin(rules, openid)) {
    throw new BusinessError(ERROR_CODES.FORBIDDEN, '没有权限')
  }
}

const stats = async ({ openid }) => {
  await assertAdmin(openid)
  const [current, { data: recentCompletions }, { data: dailyHistory }] = await Promise.all([
    computeClearStats(GAME_TYPE),
    db.collection('completions').where({ gameType: GAME_TYPE }).orderBy('completedAt', 'desc').limit(RECENT_COMPLETION_LIMIT).get(),
    db.collection('stats_daily').where({ gameType: GAME_TYPE }).orderBy('date', 'desc').limit(DAILY_HISTORY_LIMIT).get()
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
    }))
  }
}

module.exports = { stats, isAdmin }
