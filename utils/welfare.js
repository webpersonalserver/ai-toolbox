const { gameConfigOf } = require('./games')
const { describeRewards, ITEM_META } = require('./items')

// Unopened chests from every game and practice; they are all opened in 我的宝箱, so the welfare page shows one total.
const countPendingChests = (games, practices = []) => {
  const levelChests = games.reduce((total, summary) => total + summary.achievement.milestone.pendingChests, 0)
  const practiceChests = practices.reduce((total, summary) => total + (summary.pendingChestCount || 0), 0)
  return levelChests + practiceChests
}

const countUnclaimedWelfare = (session, games, practices = []) => {
  const checkin = session.today.checkedIn ? 0 : 1
  return checkin + countPendingChests(games, practices)
}

const TASK_ACTIONS = {
  CHECKIN: 'checkin',
  DAILY: 'daily',
  RECOVERY: 'recovery',
  AD_STAMINA: 'ad-stamina',
  AD_HINT: 'ad-hint',
  PRACTICE: 'practice',
  KUNGFU: 'kungfu',
  LEVELS: 'levels'
}
const AD_ACTION_BY_ITEM = { stamina: TASK_ACTIONS.AD_STAMINA, hint: TASK_ACTIONS.AD_HINT }
const KUNGFU_ROWS = 9
const ITEM_ICONS = { stamina: '/assets/icons/stamina.png', hint: '/assets/icons/hint.png' }

const taskRow = (row) => ({ icon: '', iconText: '', statusText: '', actionText: '', done: false, ...row })

const recoveryTask = (session) => {
  const { items, rules } = session
  const { dailyCap, intervalMinutes } = rules.staminaRecovery
  const progressText = `每 ${intervalMinutes} 分钟 +1，今天已恢复 ${items.recoveredToday || 0} / ${dailyCap} 点`
  const base = { key: TASK_ACTIONS.RECOVERY, icon: ITEM_ICONS.stamina, name: '自动恢复体力', progressText }
  if ((items.recoveredToday || 0) >= dailyCap) return taskRow({ ...base, done: true, statusText: '今天送完啦' })
  return taskRow({ ...base, statusText: '恢复中' })
}

const adTasks = (session) => {
  const { ad } = session.rules
  if (!ad.enabled || !ad.adUnitId) return []
  return ['stamina', 'hint']
    .filter((itemType) => ad.rewards[itemType] > 0)
    .map((itemType) => {
      const limit = (ad.dailyLimits || {})[itemType]
      const remaining = ((session.today && session.today.adRemaining) || {})[itemType]
      const isUnlimited = limit === null || remaining === null
      const done = !isUnlimited && remaining <= 0
      return taskRow({
        key: AD_ACTION_BY_ITEM[itemType],
        icon: ITEM_ICONS[itemType],
        name: `看视频得${ITEM_META[itemType].label} +${ad.rewards[itemType]}`,
        progressText: isUnlimited ? '不限次数' : `今天已看 ${limit - remaining} / ${limit} 次`,
        actionText: done ? '' : '去看',
        statusText: done ? '今天已看满' : '',
        done
      })
    })
}

const practiceTask = (session, practiceEarnedToday) => {
  const caps = session.rules.practice ? session.rules.practice.dailyCaps : null
  if (!caps) return null
  const earned = { stamina: 0, hint: 0, ...(practiceEarnedToday || {}) }
  const done = earned.stamina >= caps.stamina && earned.hint >= caps.hint
  return taskRow({
    key: TASK_ACTIONS.PRACTICE,
    iconText: '算',
    name: '去「趣味」答题攒宝箱',
    progressText: `今天已攒 体力 ${earned.stamina} / ${caps.stamina}、提示 ${earned.hint} / ${caps.hint}`,
    actionText: done ? '' : '去趣味',
    statusText: done ? '今天已攒满' : '',
    done
  })
}

const kungfuTask = (practices) => {
  const summary = (practices || []).find((practice) => practice.practiceId === 'multiplication')
  const masteredRows = summary ? summary.masteredRows : 0
  const done = masteredRows >= KUNGFU_ROWS
  return taskRow({
    key: TASK_ACTIONS.KUNGFU,
    iconText: '乘',
    name: '修炼九九神功',
    progressText: `已练成 ${masteredRows} / ${KUNGFU_ROWS} 重，每练成一重得体力宝箱`,
    actionText: done ? '' : '去修炼',
    statusText: done ? '九重全练成！' : '',
    done
  })
}

// The level chest that is closest to opening, across every game the player has.
const levelsTask = (games) => {
  const nearest = [...games].sort((left, right) => left.achievement.milestone.levelsToNextChest - right.achievement.milestone.levelsToNextChest)[0]
  if (!nearest) return null
  const { milestone } = nearest.achievement
  return taskRow({
    key: TASK_ACTIONS.LEVELS,
    iconText: '闯',
    name: '闯关开宝箱',
    progressText: `${gameConfigOf(nearest.gameType).name}再过 ${milestone.levelsToNextChest} 关开${milestone.nextChestIsBig ? '大' : ''}宝箱`,
    actionText: '去闯关'
  })
}

/**
 * Every way to earn stamina and hints, with today's progress. Rows that hit today's limit stay visible but greyed out.
 */
// 今日挑战: 10 questions once a day; the row greys out once it is done.
const dailyTask = (session) => {
  const result = session.today.dailyChallenge
  const rewards = (session.rules.daily && session.rules.daily.rewards) || []
  return taskRow({
    key: TASK_ACTIONS.DAILY,
    iconText: '挑',
    name: '今日挑战',
    progressText: result ? `今天答对 ${result.correct} / ${result.total} 题` : `10 道题，完成送${describeRewards(rewards)}`,
    actionText: result ? '' : '去挑战',
    statusText: result ? '今天已完成' : '',
    done: Boolean(result)
  })
}

// Finished rows sink to the bottom (keeping their order) so what is still open is seen first.
const doneLast = (rows) => [...rows.filter((row) => !row.done), ...rows.filter((row) => row.done)]

const buildTaskRows = ({ session, games, practices, practiceEarnedToday }) =>
  doneLast([
    taskRow({
      key: TASK_ACTIONS.CHECKIN,
      iconText: '签',
      name: '每日打卡',
      progressText: describeRewards(session.rules.checkinRewards),
      actionText: session.today.checkedIn ? '' : '打卡',
      statusText: session.today.checkedIn ? '今天已打卡' : '',
      done: session.today.checkedIn
    }),
    dailyTask(session),
    recoveryTask(session),
    ...adTasks(session),
    practiceTask(session, practiceEarnedToday),
    kungfuTask(practices),
    levelsTask(games)
  ].filter(Boolean))

const countOpenTasks = (taskRows) => taskRows.filter((row) => !row.done && row.actionText).length

module.exports = { TASK_ACTIONS, countPendingChests, countUnclaimedWelfare, buildTaskRows, countOpenTasks }
