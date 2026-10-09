const path = require('path')
const fs = require('fs')
const Module = require('module')

const FAKE_SDK_PATH = path.join(__dirname, 'support', 'fake-wx-server-sdk.js')
const API_ROOT = path.join(__dirname, '..', 'cloudfunctions', 'api')
const LEVELS_FILE = process.argv[2] || path.join(__dirname, '..', 'database', 'levels.jsonl')
const LOADED_LEVEL_COUNT = 30

const resolveFilename = Module._resolveFilename
Module._resolveFilename = function resolveWithFakeSdk(request, ...rest) {
  return request === 'wx-server-sdk' ? FAKE_SDK_PATH : resolveFilename.call(this, request, ...rest)
}

const sdk = require('wx-server-sdk')
const { main } = require(path.join(API_ROOT, 'index'))
const { DEFAULT_RULES } = require(path.join(API_ROOT, 'lib', 'rules'))

const levels = fs.readFileSync(LEVELS_FILE, 'utf8').trim().split('\n').map(JSON.parse)
const S = sdk.testing.store
S.levels = Object.fromEntries(levels.slice(0, LOADED_LEVEL_COUNT).map((level) => [level._id, level]))

let passed = 0
let failed = 0
const call = async (openid, action, payload) => {
  sdk.testing.actAs(openid)
  return main({ action, payload })
}
const assert = (condition, name, detail) => {
  if (condition) {
    passed += 1
    console.log('ok  ', name)
  } else {
    failed += 1
    console.log('FAIL', name, JSON.stringify(detail))
  }
}
const MIN = 60000
const startedAttempt = { active: true, wrongCount: 0 }

;(async () => {
  let r = await call('u1', 'account.login')
  assert(r.code === 0 && r.data.items.hint === 10 && r.data.items.stamina === 25 && r.data.items.rescue === undefined, 'signup items hint10 stamina25', r)
  assert(r.data.rules.rescue.dailyLimitPerHelper === 2, 'rescue limit exposed', r.data)
  r = await call('u1', 'account.login'); assert(!r.data.isNewUser && r.data.items.hint === 10, 'relogin no double grant', r)
  r = await call('u1', 'idiom.getLevel', { levelNo: 1 }); assert(r.data.puzzle === null && !r.data.attempt.active && r.data.staminaCost === 1, 'puzzle hidden before start', r)
  r = await call('u1', 'idiom.submit', { levelNo: 1, answer: 'x' }); assert(r.code === 40010, 'submit needs active attempt', r)
  r = await call('u1', 'idiom.useHint', { levelNo: 1 }); assert(r.code === 40010, 'hint needs active attempt', r)
  r = await call('u1', 'idiom.startAttempt', { levelNo: 1 }); assert(r.code === 0 && r.data.items.stamina === 24 && r.data.puzzle.board.length === 24 && !r.data.puzzle.answer && r.data.attempt.attemptsLeft === 3, 'start costs 1 stamina', r)
  r = await call('u1', 'idiom.startAttempt', { levelNo: 1 }); assert(r.data.items === null && S.users.u1.items.stamina === 24, 're-enter active attempt is free', r)
  r = await call('u1', 'idiom.useHint', { levelNo: 1 }); assert(r.code === 0 && r.data.items.hint === 9 && r.data.revealed.join('') === levels[0].answer[0], 'hint', r)
  r = await call('u1', 'idiom.submit', { levelNo: 1, answer: '一一一一' }); assert(r.data.correct === false && r.data.attempt.attemptsLeft === 2, 'wrong -1 heart', r)
  await call('u1', 'idiom.submit', { levelNo: 1, answer: '一一一一' })
  r = await call('u1', 'idiom.submit', { levelNo: 1, answer: '一一一一' }); assert(r.data.attempt.failed && !r.data.attempt.active, '3 wrong -> failed', r)
  r = await call('u1', 'idiom.submit', { levelNo: 1, answer: levels[0].answer }); assert(r.code === 40010, 'no submit after fail', r)
  r = await call('u1', 'idiom.getLevel', { levelNo: 1 }); assert(r.data.attempt.failed && r.data.puzzle === null, 'failed state persisted', r)
  r = await call('u1', 'idiom.startAttempt', { levelNo: 1 }); assert(r.data.items.stamina === 23 && r.data.attempt.attemptsLeft === 3 && r.data.puzzle.revealed.join('') === levels[0].answer[0], 'retry costs stamina, revealed kept', r)
  r = await call('u1', 'idiom.submit', { levelNo: 1, answer: levels[0].answer }); assert(r.data.correct && r.data.nextLevelNo === 2, 'solve', r)
  r = await call('u1', 'idiom.getLevel', { levelNo: 1 }); assert(r.data.solved && r.data.solution.answer === levels[0].answer, 'solved review free', r)
  r = await call('u1', 'idiom.startAttempt', { levelNo: 1 }); assert(r.code === 40004, 'no start on solved', r)
  // stamina exhaustion & next steps
  S.users.u1.items.stamina = 0; S.users.u1.staminaAnchorAt = Date.now()
  r = await call('u1', 'idiom.startAttempt', { levelNo: 2 }); assert(r.code === 40001 && r.data.itemType === 'stamina' && r.data.next === 'checkin' && r.data.checkinReward === 5, 'no stamina -> checkin', r)
  r = await call('u1', 'account.checkin'); assert(r.code === 0 && r.data.items.stamina === 5 && r.data.items.hint === 12, 'checkin grants hint+stamina', r)
  r = await call('u1', 'account.checkin'); assert(r.code === 40002, 'checkin once', r)
  S.users.u1.items.stamina = 0; S.users.u1.staminaAnchorAt = Date.now()
  r = await call('u1', 'idiom.startAttempt', { levelNo: 2 }); assert(r.data.next === 'waitRecovery', 'ad off -> wait recovery', r)
  S.users.u1.staminaAnchorAt = Date.now() - 65 * MIN
  r = await call('u1', 'account.login'); assert(r.data.items.stamina === 2 && r.data.items.nextStaminaAt > Date.now(), 'recovers 2 after 65min', r.data.items)
  S.users.u1.staminaAnchorAt = Date.now() - 100 * 30 * MIN
  r = await call('u1', 'account.login'); assert(r.data.items.stamina === 10 && r.data.items.nextStaminaAt === null, 'recovery capped at 10', r.data.items)
  r = await call('u1', 'idiom.startAttempt', { levelNo: 2 }); assert(r.data.items.stamina === 9 && r.data.items.nextStaminaAt > Date.now() + 29 * MIN, 'spend from cap restarts timer', r.data.items)
  S.app_config = { game_rules: { _id: 'game_rules', ad: { enabled: true, adUnitId: 'adunit-test', dailyLimits: { stamina: 1 } }, staminaRecovery: { enabled: false }, level: { staminaCost: 2 } } }
  S.users.u1.items.stamina = 0
  r = await call('u1', 'idiom.startAttempt', { levelNo: 3 }); assert(r.code === 40003, 'level 3 locked', r)
  await call('u1', 'idiom.submit', { levelNo: 2, answer: levels[1].answer })
  r = await call('u1', 'idiom.startAttempt', { levelNo: 3 }); assert(r.data.next === 'ad' && r.data.adReward === 3, 'ad enabled -> ad (deep-merged config)', r)
  r = await call('u1', 'account.grantAdReward', { itemType: 'stamina' }); assert(r.code === 0 && r.data.items.stamina === 3 && r.data.adRemaining === 0, 'ad grants stamina', r)
  r = await call('u1', 'account.grantAdReward', { itemType: 'stamina' }); assert(r.code === 40006, 'ad per-item daily limit', r)
  r = await call('u1', 'account.grantAdReward', { itemType: 'hint' }); assert(r.code === 0, 'hint ad limit separate', r)
  r = await call('u1', 'account.grantAdReward', { itemType: 'rescue' }); assert(r.code === 40006, 'rescue is not an item', r)
  r = await call('u1', 'idiom.startAttempt', { levelNo: 3 }); assert(r.data.items.stamina === 1, 'configurable stamina cost 2', r)
  S.users.u1.items.stamina = 0
  r = await call('u1', 'idiom.startAttempt', { levelNo: 4 }); assert(r.code === 40003, 'locked 4', r)
  S.app_config.game_rules.staminaRecovery = { enabled: false }
  // hint exhaustion -> rescue
  S.users.u1.items.hint = 0
  r = await call('u1', 'idiom.useHint', { levelNo: 3 }); assert(r.code === 40001 && r.data.next === 'ad', 'no hint -> ad (hint ad left)', r)
  S.app_config.game_rules.ad.enabled = false
  r = await call('u1', 'idiom.useHint', { levelNo: 3 }); assert(r.data.next === 'rescue', 'no hint, no ad -> rescue', r)
  // rescue
  r = await call('u1', 'rescue.create', { levelNo: 3 }); const rescueId = r.data.rescueId; assert(r.code === 0 && rescueId && !rescueId.includes('u1'), 'rescue create, openid not exposed', r)
  r = await call('u1', 'rescue.create', { levelNo: 3 }); assert(r.data.rescueId === rescueId, 'same level reuse', r)
  r = await call('u1', 'rescue.answer', { rescueId, answer: 'x' }); assert(r.code === 40009, 'self help blocked', r)
  await call('u2', 'account.login')
  r = await call('u2', 'rescue.view', { rescueId }); assert(r.code === 0 && !r.data.isOwner && !r.data.puzzle.answer && !r.data.helperLimitReached, 'friend views', r)
  r = await call('u2', 'rescue.answer', { rescueId, answer: 'xxxx' }); assert(r.data.correct === false, 'friend wrong', r)
  r = await call('u2', 'rescue.answer', { rescueId, answer: levels[2].answer }); assert(r.data.correct, 'friend solves', r)
  await call('u3', 'account.login'); r = await call('u3', 'rescue.answer', { rescueId, answer: levels[2].answer }); assert(r.code === 40008, 'second helper closed', r)
  r = await call('u1', 'idiom.levelList'); assert(r.data.currentLevel === 4 && r.data.rescueNotices.length === 1, 'requester advanced + notice', r)
  r = await call('u1', 'idiom.getLevel', { levelNo: 3 }); assert(r.data.solved && !r.data.attempt.active, 'rescued level attempt closed', r)
  S.progress['u1_idiom'].currentLevel = 5
  S.progress['u1_idiom'].attempts['4'] = { ...startedAttempt }
  S.progress['u1_idiom'].attempts['5'] = { ...startedAttempt }
  r = await call('u1', 'rescue.create', { levelNo: 4 }); const rescue4 = r.data.rescueId
  r = await call('u2', 'rescue.answer', { rescueId: rescue4, answer: levels[3].answer }); assert(r.data.correct, 'u2 helps u1 2nd time', r)
  r = await call('u1', 'rescue.create', { levelNo: 5 }); const rescue5 = r.data.rescueId; assert(r.code === 0, 'requester can keep asking', r)
  r = await call('u2', 'rescue.view', { rescueId: rescue5 }); assert(r.data.helperLimitReached && r.data.helperLimitMessage.includes('2'), 'view shows helper limit', r)
  r = await call('u2', 'rescue.answer', { rescueId: rescue5, answer: levels[4].answer }); assert(r.code === 40011, 'same helper 3rd time blocked', r)
  r = await call('u3', 'rescue.answer', { rescueId: rescue5, answer: levels[4].answer }); assert(r.data.correct, 'different helper ok', r)
  await call('u4', 'account.login'); await call('u4', 'idiom.startAttempt', { levelNo: 1 }); await call('u4', 'rescue.create', { levelNo: 1 })
  S.progress['u4_idiom'] = S.progress['u4_idiom'] || {}
  const r4 = Object.values(S.rescues).find((x) => x.requesterOpenid === 'u4')
  r = await call('u2', 'rescue.answer', { rescueId: r4._id, answer: levels[0].answer }); assert(r.data.correct, 'u2 limit is per requester', r)
  // achievements
  S.app_config = {}
  await call('u5', 'account.login')
  r = await call('u5', 'idiom.summary'); assert(r.data.achievement.title.name === '蒙童' && r.data.achievement.title.nextName === '童生' && r.data.achievement.title.nextMinSolved === 10 && r.data.achievement.milestone.levelsToNextChest === 10, 'initial title + milestone', r)
  r = await call('u5', 'idiom.claimMilestones'); assert(r.code === 40012, 'nothing to claim', r)
  S.progress['u5_idiom'].solved = [1,2,3,4,5,6,7,8,9]; S.progress['u5_idiom'].currentLevel = 10
  S.app_config = {}
  await call('u5', 'idiom.startAttempt', { levelNo: 10 })
  r = await call('u5', 'idiom.submit', { levelNo: 10, answer: levels[9].answer }); assert(r.data.correct && r.data.titleUpgrade === '童生' && r.data.achievement.milestone.pendingChests === 1, 'solve 10th -> title upgrade + chest', r)
  const before = { ...S.users.u5.items }
  r = await call('u5', 'idiom.claimMilestones'); assert(r.code === 0 && r.data.chestCount === 1 && r.data.items.hint === before.hint + 2 && r.data.items.stamina === before.stamina + 3, 'claim chest', r)
  r = await call('u5', 'idiom.claimMilestones'); assert(r.code === 40012, 'chest claimed once', r)
  S.progress['u5_idiom'].solved = Array.from({ length: 29 }, (_, i) => i + 1)
  r = await call('u5', 'idiom.levelList'); assert(r.data.achievement.milestone.pendingChests === 1 && r.data.achievement.milestone.levelsToNextChest === 1, 'pending after more solves', r.data.achievement)
  S.progress['u5_idiom'].solved.push(30)
  r = await call('u5', 'idiom.claimMilestones'); assert(r.data.chestCount === 2 && r.data.rewards.find((x) => x.type === 'hint').amount === 4, 'claim multiple chests at once', r)
  r = await call('u5', 'idiom.solvedBook', { page: 1 }); assert(r.data.total === 30 && r.data.entries.length === 20 && r.data.entries[0].levelNo === 1 && r.data.entries[0].answer === levels[0].answer && r.data.hasMore, 'book page 1', r.data.total)
  r = await call('u5', 'idiom.solvedBook', { page: 2 }); assert(r.data.entries.length === 10 && !r.data.hasMore, 'book page 2', r.data.entries.length)
  const baseline = DEFAULT_RULES.titles
  S.app_config = { game_rules: { _id: 'game_rules', titles: [...baseline, { name: '尚书', minSolved: 1200 }] } }
  S.progress['u5_idiom'].solved = Array.from({ length: 1000 }, (_, i) => i + 1)
  r = await call('u5', 'idiom.summary'); assert(r.data.achievement.title.name === '大学士' && r.data.achievement.title.nextName === '尚书' && r.data.achievement.title.nextMinSolved === 1200, 'appended title accepted', r.data.achievement.title)
  const inserted = [...baseline.slice(0, 3), { name: '插队', minSolved: 40 }, ...baseline.slice(3)]
  S.app_config.game_rules.titles = inserted
  S.progress['u5_idiom'].solved = Array.from({ length: 45 }, (_, i) => i + 1)
  r = await call('u5', 'idiom.summary'); assert(r.data.achievement.title.name === '秀才', 'inserted-in-middle title rejected -> baseline', r.data.achievement.title)
  S.app_config.game_rules.titles = baseline.map((t) => (t.name === '举人' ? { ...t, minSolved: 300 } : t))
  S.progress['u5_idiom'].solved = Array.from({ length: 160 }, (_, i) => i + 1)
  r = await call('u5', 'idiom.summary'); assert(r.data.achievement.title.name === '举人', 'retuned threshold rejected -> baseline', r.data.achievement.title)
  S.app_config.game_rules.titles = [...baseline, { name: '尚书', minSolved: 900 }]
  S.progress['u5_idiom'].solved = Array.from({ length: 1000 }, (_, i) => i + 1)
  r = await call('u5', 'idiom.summary'); assert(r.data.achievement.title.name === '大学士' && r.data.achievement.title.nextName === null, 'non-increasing append rejected -> baseline', r.data.achievement.title)
  // P0: rescue hardening
  S.app_config = {}
  r = await call('u6', 'account.login'); const u6AvatarDir = r.data.profile.avatarUploadDir
  r = await call('u6', 'rescue.create', { levelNo: 1 }); assert(r.code === 40013, 'rescue requires a started attempt', r)
  await call('u6', 'idiom.startAttempt', { levelNo: 1 })
  r = await call('u6', 'rescue.create', { levelNo: 1 }); const rescueU6 = r.data.rescueId; assert(r.code === 0, 'rescue after starting attempt', r)
  await call('u7', 'account.login')
  r = await call('u7', 'rescue.view', { rescueId: rescueU6 }); assert(r.data.helperAttemptsLeft === 3 && r.data.maxWrongAnswersPerHelper === 3, 'helper starts with 3 tries', r.data)
  for (const left of [2, 1, 0]) {
    r = await call('u7', 'rescue.answer', { rescueId: rescueU6, answer: 'xxxx' }); assert(r.data.correct === false && r.data.attemptsLeft === left, `helper wrong -> ${left} left`, r)
  }
  r = await call('u7', 'rescue.answer', { rescueId: rescueU6, answer: levels[0].answer }); assert(r.code === 40014, 'helper locked after 3 wrong answers', r)
  r = await call('u7', 'rescue.view', { rescueId: rescueU6 }); assert(r.data.helperAttemptsLeft === 0, 'view shows helper locked', r.data)
  r = await call('u6', 'account.updateProfile', { nickname: `有${sdk.testing.RISKY_KEYWORD}词`, avatarUrl: '' }); assert(r.code === 40015, 'risky nickname rejected', r)
  r = await call('u6', 'account.updateProfile', { nickname: '小明', avatarUrl: 'cloud://env/avatars/someone-else/a.png' }); assert(r.code === 40000, 'foreign avatar path rejected', r)
  const firstAvatar = `cloud://env.123/${u6AvatarDir}/first.png`
  r = await call('u6', 'account.updateProfile', { nickname: '小明', avatarUrl: firstAvatar }); assert(r.code === 0, 'profile saved', r)
  r = await call('u8', 'rescue.view', { rescueId: rescueU6 }); assert(r.data.requester.nickname === '小明' && r.data.requester.avatarUrl === firstAvatar, 'rescue shows live requester profile', r.data.requester)
  r = await call('u6', 'account.updateProfile', { nickname: '小明', avatarUrl: `cloud://env.123/${u6AvatarDir}/second.png` }); assert(r.code === 0 && sdk.testing.deletedFiles.includes(firstAvatar), 'replaced avatar file deleted', sdk.testing.deletedFiles)
  r = await call('u6', 'idiom.submit', { levelNo: 1, answer: levels[0].answer }); assert(r.data.correct, 'requester solves by self', r)
  r = await call('u8', 'rescue.view', { rescueId: rescueU6 }); assert(r.data.status === 'closedByRequester', 'rescue closed when requester self-solves', r.data.status)
  r = await call('u8', 'rescue.answer', { rescueId: rescueU6, answer: levels[0].answer }); assert(r.code === 40008 && r.message.includes('自己解开'), 'closed rescue cannot be answered', r)
  // P1: config validation
  S.app_config = { game_rules: { _id: 'game_rules', level: { staminaCost: '2' }, signupItems: { hint: 7 } } }
  const staminaBefore = S.users.u6.items.stamina
  r = await call('u6', 'idiom.startAttempt', { levelNo: 2 }); assert(r.data.items.stamina === staminaBefore - 1, 'string staminaCost falls back to default 1', r.data.items)
  await call('u9', 'account.login'); assert(S.users.u9.items.hint === 7, 'valid sibling field still applied', S.users.u9.items)
  S.app_config = {}
  // P2: scheduled cleanup
  const DAY = 24 * 60 * MIN
  S.item_logs.oldLog = { _id: 'oldLog', openid: 'u1', createdAt: new Date(Date.now() - 200 * DAY).toISOString() }
  S.daily.oldDaily = { _id: 'oldDaily', date: '20200101' }
  S.rescue_help_pairs.oldPair = { _id: 'oldPair', date: '20200101' }
  const recentLogCount = Object.keys(S.item_logs).length - 1
  S.item_logs.spoofProbe = { _id: 'spoofProbe', openid: 'u1', createdAt: new Date(Date.now() - 200 * DAY).toISOString() }
  r = await call('u1', 'account.login', {}); sdk.testing.actAs('u1')
  r = await main({ Type: 'Timer', TriggerName: 'cleanupExpiredRecords', action: 'account.login' }); assert(r.code === 0 && r.data.isNewUser === false && S.item_logs.spoofProbe, 'client cannot spoof a timer trigger', r)
  delete S.item_logs.spoofProbe
  sdk.testing.actAs('')
  r = await main({ Type: 'Timer', TriggerName: 'cleanupExpiredRecords' }); assert(r.code === 0 && r.data.item_logs === 1 && r.data.daily === 1 && r.data.rescue_help_pairs === 1, 'cleanup removes expired records', r)
  assert(Object.keys(S.item_logs).length === recentLogCount && !S.daily.oldDaily, 'recent records kept', Object.keys(S.item_logs).length)
  r = await main({ Type: 'Timer', TriggerName: 'nope' }); assert(r.code === 40000, 'unknown timer rejected', r)
  r = await main({ action: 'account.login' }); assert(r.code === 40000, 'call without user identity rejected', r)
  console.log('logs:', Object.values(S.item_logs).filter((l) => l.openid === 'u1').map((l) => `${l.reason}:${l.itemType}${l.delta > 0 ? '+' : ''}${l.delta}`).join(' '))
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exitCode = failed ? 1 : 0
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
