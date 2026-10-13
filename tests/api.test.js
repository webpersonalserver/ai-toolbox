const path = require('path')
const fs = require('fs')
const Module = require('module')

const FAKE_SDK_PATH = path.join(__dirname, 'support', 'fake-wx-server-sdk.js')
const API_ROOT = path.join(__dirname, '..', 'cloudfunctions', 'api')
const LEVELS_DIR = process.argv[2] || path.join(__dirname, '..', 'database', 'levels')
const LOADED_LEVEL_COUNT = 30

const resolveFilename = Module._resolveFilename
Module._resolveFilename = function resolveWithFakeSdk(request, ...rest) {
  return request === 'wx-server-sdk' ? FAKE_SDK_PATH : resolveFilename.call(this, request, ...rest)
}

const sdk = require('wx-server-sdk')
const { main } = require(path.join(API_ROOT, 'index'))
const { DEFAULT_RULES } = require(path.join(API_ROOT, 'lib', 'rules'))
const { ALL_GAME_TYPES } = require(path.join(API_ROOT, 'lib', 'games'))

const readLevels = (gameType) => fs.readFileSync(path.join(LEVELS_DIR, `${gameType}.json`), 'utf8').trim().split('\n').map(JSON.parse)
const levels = readLevels('idiom')
const poetryLevels = readLevels('poetry')
const xiehouyuLevels = readLevels('xiehouyu')
const typoLevels = readLevels('typo')
const S = sdk.testing.store
S.levels = Object.fromEntries(
  [levels, poetryLevels, xiehouyuLevels, typoLevels].flatMap((gameLevels) => gameLevels.slice(0, LOADED_LEVEL_COUNT)).map((level) => [level._id, level])
)

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
  assert(r.code === 0 && r.data.items.hint === 10 && r.data.items.stamina === 50 && r.data.items.rescue === undefined, 'signup items hint10 stamina50', r)
  assert(r.data.rules.rescue.dailyLimitPerHelper === 2, 'rescue limit exposed', r.data)
  r = await call('u1', 'account.login'); assert(!r.data.isNewUser && r.data.items.hint === 10, 'relogin no double grant', r)
  r = await call('u1', 'game.getLevel', { gameType: 'idiom', levelNo: 1 }); assert(r.data.puzzle === null && !r.data.attempt.active && r.data.staminaCost === 1, 'puzzle hidden before start', r)
  r = await call('u1', 'game.submit', { gameType: 'idiom', levelNo: 1, answer: 'x' }); assert(r.code === 40010, 'submit needs active attempt', r)
  r = await call('u1', 'game.useHint', { gameType: 'idiom', levelNo: 1 }); assert(r.code === 40010, 'hint needs active attempt', r)
  r = await call('u1', 'game.startAttempt', { gameType: 'idiom', levelNo: 1 }); assert(r.code === 0 && r.data.items.stamina === 49 && r.data.puzzle.board.length === 24 && !r.data.puzzle.answer && r.data.attempt.attemptsLeft === 3, 'start costs 1 stamina', r)
  r = await call('u1', 'game.startAttempt', { gameType: 'idiom', levelNo: 1 }); assert(r.data.items === null && S.users.u1.items.stamina === 49, 're-enter active attempt is free', r)
  r = await call('u1', 'game.useHint', { gameType: 'idiom', levelNo: 1 }); assert(r.code === 0 && r.data.items.hint === 9 && r.data.revealed.join('') === levels[0].answer[0], 'hint', r)
  r = await call('u1', 'game.submit', { gameType: 'idiom', levelNo: 1, answer: '一一一一' }); assert(r.data.correct === false && r.data.attempt.attemptsLeft === 2, 'wrong -1 heart', r)
  await call('u1', 'game.submit', { gameType: 'idiom', levelNo: 1, answer: '一一一一' })
  r = await call('u1', 'game.submit', { gameType: 'idiom', levelNo: 1, answer: '一一一一' }); assert(r.data.attempt.failed && !r.data.attempt.active, '3 wrong -> failed', r)
  r = await call('u1', 'game.submit', { gameType: 'idiom', levelNo: 1, answer: levels[0].answer }); assert(r.code === 40010, 'no submit after fail', r)
  r = await call('u1', 'game.getLevel', { gameType: 'idiom', levelNo: 1 }); assert(r.data.attempt.failed && r.data.puzzle === null, 'failed state persisted', r)
  r = await call('u1', 'game.startAttempt', { gameType: 'idiom', levelNo: 1 }); assert(r.data.items.stamina === 48 && r.data.attempt.attemptsLeft === 3 && r.data.puzzle.revealed.join('') === levels[0].answer[0], 'retry costs stamina, revealed kept', r)
  r = await call('u1', 'game.submit', { gameType: 'idiom', levelNo: 1, answer: levels[0].answer }); assert(r.data.correct && r.data.nextLevelNo === 2, 'solve', r)
  r = await call('u1', 'game.getLevel', { gameType: 'idiom', levelNo: 1 }); assert(r.data.solved && r.data.solution.answer === levels[0].answer, 'solved review free', r)
  r = await call('u1', 'game.startAttempt', { gameType: 'idiom', levelNo: 1 }); assert(r.code === 40004, 'no start on solved', r)
  // stamina exhaustion & next steps
  S.users.u1.items.stamina = 0; S.users.u1.staminaAnchorAt = Date.now()
  r = await call('u1', 'game.startAttempt', { gameType: 'idiom', levelNo: 2 }); assert(r.code === 40001 && r.data.itemType === 'stamina' && r.data.next === 'checkin' && r.data.checkinReward === 5, 'no stamina -> checkin', r)
  r = await call('u1', 'account.checkin'); assert(r.code === 0 && r.data.items.stamina === 5 && r.data.items.hint === 12, 'checkin grants hint+stamina', r)
  r = await call('u1', 'account.checkin'); assert(r.code === 40002, 'checkin once', r)
  S.users.u1.items.stamina = 0; S.users.u1.staminaAnchorAt = Date.now()
  r = await call('u1', 'game.startAttempt', { gameType: 'idiom', levelNo: 2 }); assert(r.data.next === 'practice' && r.data.practiceStaminaRoom === 15, 'ad off -> earn stamina by practice', r)
  S.progress['u1_idiom'].solved = [1, ...Array.from({ length: 9 }, (_, i) => i + 3)]
  r = await call('u1', 'game.startAttempt', { gameType: 'idiom', levelNo: 2 }); assert(r.data.next === 'openChests' && r.data.welfareChests === 1, 'unopened chest in the welfare bag -> open it first', r.data)
  S.progress['u1_idiom'].solved = [1]
  S.daily[Object.keys(S.daily).find((id) => id.startsWith('u1_'))].practiceEarned = { stamina: 15, hint: 0 }
  r = await call('u1', 'game.startAttempt', { gameType: 'idiom', levelNo: 2 }); assert(r.data.next === 'waitRecovery', 'practice capped, ad off -> wait recovery', r)
  S.users.u1.staminaAnchorAt = Date.now() - 65 * MIN
  r = await call('u1', 'account.login'); assert(r.data.items.stamina === 0 && r.data.items.staminaPending === 2 && r.data.items.nextStaminaAt > Date.now(), 'recovered stamina waits as pending (2 after 65min)', r.data.items)
  S.users.u1.items.stamina = 40
  S.users.u1.staminaPending = 0
  S.users.u1.staminaAnchorAt = Date.now() - 65 * MIN
  r = await call('u1', 'account.login'); assert(r.data.items.stamina === 40 && r.data.items.staminaPending === 2, 'recovery no longer stops when holding plenty of stamina', r.data.items)
  S.users.u1.items.stamina = 0
  S.users.u1.staminaPending = 10
  S.users.u1.staminaAnchorAt = Date.now() - 10 * MIN
  S.users.u1.staminaRecoveredDate = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
  S.users.u1.staminaRecoveredCount = 15
  r = await call('u1', 'account.login'); assert(r.data.items.staminaPending === 10 && r.data.items.recoveryLeftToday === 0 && r.data.items.nextStaminaAt === null, "today's 15 recovered: countdown stops until tomorrow", r.data.items)
  r = await call('u1', 'game.startAttempt', { gameType: 'idiom', levelNo: 2 }); assert(r.code === 40001 && r.data.next === 'claimRecovery' && r.data.pendingStamina === 10, 'no stamina but pending -> suggest claiming', r)
  r = await call('u1', 'account.claimRecoveredStamina'); assert(r.code === 0 && r.data.claimed === 10 && r.data.items.stamina === 10 && r.data.items.staminaPending === 0, 'claim moves pending into stamina', r.data)
  r = await call('u1', 'account.claimRecoveredStamina'); assert(r.code === 40016, 'nothing left to claim', r)
  S.users.u1.staminaRecoveredCount = 3
  r = await call('u1', 'game.startAttempt', { gameType: 'idiom', levelNo: 2 }); assert(r.data.items.stamina === 9 && r.data.items.recoveryLeftToday === 12 && r.data.items.nextStaminaAt > Date.now(), 'below the daily cap the countdown keeps running', r.data.items)
  S.app_config = { game_rules: { _id: 'game_rules', ad: { enabled: true, adUnitId: 'adunit-test', dailyLimits: { stamina: 1 } }, staminaRecovery: { enabled: false }, level: { staminaCost: 2 } } }
  S.users.u1.items.stamina = 0
  r = await call('u1', 'game.startAttempt', { gameType: 'idiom', levelNo: 3 }); assert(r.code === 40003, 'level 3 locked', r)
  await call('u1', 'game.submit', { gameType: 'idiom', levelNo: 2, answer: levels[1].answer })
  r = await call('u1', 'game.startAttempt', { gameType: 'idiom', levelNo: 3 }); assert(r.data.next === 'ad' && r.data.adReward === 10, 'ad enabled -> ad (deep-merged config)', r)
  r = await call('u1', 'account.grantAdReward', { itemType: 'stamina' }); assert(r.code === 0 && r.data.items.stamina === 10 && r.data.adRemaining === 0, 'ad grants 10 stamina', r)
  r = await call('u1', 'account.grantAdReward', { itemType: 'stamina' }); assert(r.code === 40006, 'ad per-item daily limit', r)
  r = await call('u1', 'account.grantAdReward', { itemType: 'hint' }); assert(r.code === 0, 'hint ad limit separate', r)
  r = await call('u1', 'account.grantAdReward', { itemType: 'rescue' }); assert(r.code === 40006, 'rescue is not an item', r)
  r = await call('u1', 'game.startAttempt', { gameType: 'idiom', levelNo: 3 }); assert(r.data.items.stamina === 8, 'configurable stamina cost 2', r)
  S.users.u1.items.stamina = 0
  r = await call('u1', 'game.startAttempt', { gameType: 'idiom', levelNo: 4 }); assert(r.code === 40003, 'locked 4', r)
  S.app_config.game_rules.staminaRecovery = { enabled: false }
  // hint exhaustion -> rescue
  S.users.u1.items.hint = 0
  r = await call('u1', 'game.useHint', { gameType: 'idiom', levelNo: 3 }); assert(r.code === 40001 && r.data.next === 'ad', 'no hint -> ad (hint ad left)', r)
  S.app_config.game_rules.ad.enabled = false
  r = await call('u1', 'game.useHint', { gameType: 'idiom', levelNo: 3 }); assert(r.data.next === 'rescue', 'no hint, no ad -> rescue', r)
  // rescue
  r = await call('u1', 'rescue.create', { gameType: 'idiom', levelNo: 3 }); const rescueId = r.data.rescueId; assert(r.code === 0 && rescueId && !rescueId.includes('u1'), 'rescue create, openid not exposed', r)
  r = await call('u1', 'rescue.create', { gameType: 'idiom', levelNo: 3 }); assert(r.data.rescueId === rescueId, 'same level reuse', r)
  r = await call('u1', 'rescue.answer', { rescueId, answer: 'x' }); assert(r.code === 40009, 'self help blocked', r)
  await call('u2', 'account.login')
  r = await call('u2', 'rescue.view', { rescueId }); assert(r.code === 0 && !r.data.isOwner && !r.data.puzzle.answer && !r.data.helperLimitReached, 'friend views', r)
  r = await call('u2', 'rescue.answer', { rescueId, answer: 'xxxx' }); assert(r.data.correct === false, 'friend wrong', r)
  r = await call('u2', 'rescue.answer', { rescueId, answer: levels[2].answer }); assert(r.data.correct, 'friend solves', r)
  await call('u3', 'account.login'); r = await call('u3', 'rescue.answer', { rescueId, answer: levels[2].answer }); assert(r.code === 40008, 'second helper closed', r)
  r = await call('u1', 'game.levelList', { gameType: 'idiom' }); assert(r.data.currentLevel === 4 && r.data.rescueNotices.length === 1, 'requester advanced + notice', r)
  r = await call('u1', 'game.getLevel', { gameType: 'idiom', levelNo: 3 }); assert(r.data.solved && !r.data.attempt.active, 'rescued level attempt closed', r)
  S.progress['u1_idiom'].currentLevel = 5
  S.progress['u1_idiom'].attempts['4'] = { ...startedAttempt }
  S.progress['u1_idiom'].attempts['5'] = { ...startedAttempt }
  r = await call('u1', 'rescue.create', { gameType: 'idiom', levelNo: 4 }); const rescue4 = r.data.rescueId
  r = await call('u2', 'rescue.answer', { rescueId: rescue4, answer: levels[3].answer }); assert(r.data.correct, 'u2 helps u1 2nd time', r)
  r = await call('u1', 'rescue.create', { gameType: 'idiom', levelNo: 5 }); const rescue5 = r.data.rescueId; assert(r.code === 0, 'requester can keep asking', r)
  r = await call('u2', 'rescue.view', { rescueId: rescue5 }); assert(r.data.helperLimitReached && r.data.helperLimitMessage.includes('2'), 'view shows helper limit', r)
  r = await call('u2', 'rescue.answer', { rescueId: rescue5, answer: levels[4].answer }); assert(r.code === 40011, 'same helper 3rd time blocked', r)
  r = await call('u3', 'rescue.answer', { rescueId: rescue5, answer: levels[4].answer }); assert(r.data.correct, 'different helper ok', r)
  await call('u4', 'account.login'); await call('u4', 'game.startAttempt', { gameType: 'idiom', levelNo: 1 }); await call('u4', 'rescue.create', { gameType: 'idiom', levelNo: 1 })
  S.progress['u4_idiom'] = S.progress['u4_idiom'] || {}
  const r4 = Object.values(S.rescues).find((x) => x.requesterOpenid === 'u4')
  r = await call('u2', 'rescue.answer', { rescueId: r4._id, answer: levels[0].answer }); assert(r.data.correct, 'u2 limit is per requester', r)
  // achievements
  S.app_config = {}
  await call('u5', 'account.login')
  r = await call('u5', 'game.summary', { gameType: 'idiom' }); assert(r.data.achievement.title.name === '蒙童' && r.data.achievement.title.nextName === '童生' && r.data.achievement.title.nextMinSolved === 10 && r.data.achievement.milestone.levelsToNextChest === 10, 'initial title + milestone', r)
  r = await call('u5', 'game.claimMilestones', { gameType: 'idiom' }); assert(r.code === 40012, 'nothing to claim', r)
  S.progress['u5_idiom'].solved = [1,2,3,4,5,6,7,8,9]; S.progress['u5_idiom'].currentLevel = 10
  S.app_config = {}
  await call('u5', 'game.startAttempt', { gameType: 'idiom', levelNo: 10 })
  r = await call('u5', 'game.submit', { gameType: 'idiom', levelNo: 10, answer: levels[9].answer }); assert(r.data.correct && r.data.titleUpgrade === '童生' && r.data.achievement.milestone.pendingChests === 1, 'solve 10th -> title upgrade + chest', r)
  const before = { ...S.users.u5.items }
  r = await call('u5', 'game.claimMilestones', { gameType: 'idiom' }); assert(r.code === 0 && r.data.chestCount === 1 && r.data.items.hint === before.hint + 1 && r.data.items.stamina === before.stamina + 10 && r.data.chests[0].chestNo === 1, 'first chest: 10 stamina + 1 hint', r.data)
  r = await call('u5', 'game.claimMilestones', { gameType: 'idiom' }); assert(r.code === 40012, 'chest claimed once', r)
  S.progress['u5_idiom'].solved = Array.from({ length: 29 }, (_, i) => i + 1)
  r = await call('u5', 'game.levelList', { gameType: 'idiom' }); assert(r.data.achievement.milestone.pendingChests === 1 && r.data.achievement.milestone.levelsToNextChest === 1, 'pending after more solves', r.data.achievement)
  S.progress['u5_idiom'].solved.push(30)
  r = await call('u5', 'game.claimMilestones', { gameType: 'idiom' }); assert(r.data.chestCount === 2 && r.data.rewards.find((x) => x.type === 'hint').amount === 2 && r.data.rewards.find((x) => x.type === 'stamina').amount === 26, 'chests 2 and 3 summed (12 + 14 stamina)', r.data)
  r = await call('u5', 'game.solvedBook', { gameType: 'idiom', page: 1 }); assert(r.data.total === 30 && r.data.entries.length === 20 && r.data.entries[0].levelNo === 1 && r.data.entries[0].answer === levels[0].answer && r.data.hasMore, 'book page 1', r.data.total)
  r = await call('u5', 'game.solvedBook', { gameType: 'idiom', page: 2 }); assert(r.data.entries.length === 10 && !r.data.hasMore, 'book page 2', r.data.entries.length)
  const baseline = DEFAULT_RULES.titles.idiom
  S.app_config = { game_rules: { _id: 'game_rules', titles: { idiom: [...baseline, { name: '尚书', minSolved: 1200 }] } } }
  S.progress['u5_idiom'].solved = Array.from({ length: 1000 }, (_, i) => i + 1)
  r = await call('u5', 'game.summary', { gameType: 'idiom' }); assert(r.data.achievement.title.name === '大学士' && r.data.achievement.title.nextName === '尚书' && r.data.achievement.title.nextMinSolved === 1200, 'appended title accepted', r.data.achievement.title)
  const inserted = [...baseline.slice(0, 3), { name: '插队', minSolved: 40 }, ...baseline.slice(3)]
  S.app_config.game_rules.titles = { idiom: inserted }
  S.progress['u5_idiom'].solved = Array.from({ length: 45 }, (_, i) => i + 1)
  r = await call('u5', 'game.summary', { gameType: 'idiom' }); assert(r.data.achievement.title.name === '秀才', 'inserted-in-middle title rejected -> baseline', r.data.achievement.title)
  S.app_config.game_rules.titles = { idiom: baseline.map((t) => (t.name === '举人' ? { ...t, minSolved: 300 } : t)) }
  S.progress['u5_idiom'].solved = Array.from({ length: 160 }, (_, i) => i + 1)
  r = await call('u5', 'game.summary', { gameType: 'idiom' }); assert(r.data.achievement.title.name === '举人', 'retuned threshold rejected -> baseline', r.data.achievement.title)
  S.app_config.game_rules.titles = { idiom: [...baseline, { name: '尚书', minSolved: 900 }] }
  S.progress['u5_idiom'].solved = Array.from({ length: 1000 }, (_, i) => i + 1)
  r = await call('u5', 'game.summary', { gameType: 'idiom' }); assert(r.data.achievement.title.name === '大学士' && r.data.achievement.title.nextName === null, 'non-increasing append rejected -> baseline', r.data.achievement.title)
  // P0: rescue hardening
  S.app_config = {}
  r = await call('u6', 'account.login'); const u6AvatarDir = r.data.profile.avatarUploadDir
  r = await call('u6', 'rescue.create', { gameType: 'idiom', levelNo: 1 }); assert(r.code === 40013, 'rescue requires a started attempt', r)
  await call('u6', 'game.startAttempt', { gameType: 'idiom', levelNo: 1 })
  r = await call('u6', 'rescue.create', { gameType: 'idiom', levelNo: 1 }); const rescueU6 = r.data.rescueId; assert(r.code === 0, 'rescue after starting attempt', r)
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
  r = await call('u6', 'game.submit', { gameType: 'idiom', levelNo: 1, answer: levels[0].answer }); assert(r.data.correct, 'requester solves by self', r)
  r = await call('u8', 'rescue.view', { rescueId: rescueU6 }); assert(r.data.status === 'closedByRequester', 'rescue closed when requester self-solves', r.data.status)
  r = await call('u8', 'rescue.answer', { rescueId: rescueU6, answer: levels[0].answer }); assert(r.code === 40008 && r.message.includes('自己解开'), 'closed rescue cannot be answered', r)
  // P1: config validation
  S.app_config = { game_rules: { _id: 'game_rules', level: { staminaCost: '2' }, signupItems: { hint: 7 } } }
  const staminaBefore = S.users.u6.items.stamina
  r = await call('u6', 'game.startAttempt', { gameType: 'idiom', levelNo: 2 }); assert(r.data.items.stamina === staminaBefore - 1, 'string staminaCost falls back to default 1', r.data.items)
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
  // all-clear, completions, stats, admin
  S.app_config = {}
  const total = LOADED_LEVEL_COUNT
  await call('c1', 'account.login'); await call('c1', 'game.summary', { gameType: 'idiom' })
  S.progress['c1_idiom'].solved = Array.from({ length: total - 1 }, (_, i) => i + 1)
  S.progress['c1_idiom'].currentLevel = total
  await call('c1', 'game.startAttempt', { gameType: 'idiom', levelNo: total })
  r = await call('c1', 'game.submit', { gameType: 'idiom', levelNo: total, answer: levels[total - 1].answer })
  assert(r.data.correct && r.data.allCleared && r.data.nextLevelNo === null && r.data.totalLevels === total, 'solving the last level reports all cleared', r.data)
  assert(Object.values(S.completions).filter((c) => c.openid === 'c1' && c.totalLevels === total).length === 1, 'completion recorded once', S.completions)
  r = await call('c1', 'game.levelList', { gameType: 'idiom' }); assert(r.data.allCleared && r.data.currentLevel === total, 'level list all cleared', r.data.allCleared)
  r = await call('c1', 'game.summary', { gameType: 'idiom' }); assert(r.data.allCleared, 'summary all cleared', r.data)
  r = await call('c1', 'admin.stats', { gameType: 'idiom' }); assert(r.code === 40300, 'non-admin cannot read stats', r)
  r = await call('c1', 'account.login'); assert(r.data.isAdmin === false && r.data.openid === 'c1', 'login exposes own openid and admin flag', r.data)
  S.app_config = { game_rules: { _id: 'game_rules', admin: { openids: ['c1'] } } }
  r = await call('c1', 'account.login'); assert(r.data.isAdmin === true, 'admin flag from config', r.data.isAdmin)
  r = await call('c1', 'admin.stats', { gameType: 'idiom' })
  const clearedNow = Object.values(S.progress).filter((p) => p.gameType === 'idiom' && (p.solvedCount || 0) >= total).length
  assert(r.code === 0 && r.data.current.totalLevels === total && r.data.current.clearedUsers === clearedNow && r.data.current.totalUsers === Object.keys(S.users).length, 'admin stats counts', r.data.current)
  assert(r.data.current.clearRate === Math.round((clearedNow / Object.keys(S.users).length) * 10000) / 10000 && r.data.recentCompletions[0].openid === 'c1', 'clear rate and recent completions', r.data)
  sdk.testing.actAs('')
  r = await main({ Type: 'Timer', TriggerName: 'snapshotStats' }); assert(r.code === 0 && r.data.length === ALL_GAME_TYPES.length && S.stats_daily[`idiom_${r.data[0].date}`].clearedUsers === clearedNow, 'hourly snapshot written for every game', r)
  r = await main({ Type: 'Timer', TriggerName: 'snapshotStats' }); assert(Object.keys(S.stats_daily).filter((id) => !id.startsWith('ads_')).length === ALL_GAME_TYPES.length, 'snapshot overwrites same day', Object.keys(S.stats_daily))
  r = await call('c1', 'admin.stats', { gameType: 'idiom' }); assert(r.data.dailyHistory.length === 1 && r.data.dailyHistory[0].clearedUsers === clearedNow, 'admin sees daily history', r.data.dailyHistory)
  S.app_config = { game_rules: { _id: 'game_rules', admin: { openids: 'c1' } } }
  r = await call('c1', 'admin.stats', { gameType: 'idiom' }); assert(r.code === 40300, 'malformed admin list falls back to no admins', r)
  // leaderboard
  S.app_config = { game_rules: { _id: 'game_rules', leaderboard: { size: 2 } } }
  Object.values(S.progress).forEach((p) => { p.solvedCount = p.openid === 'c1' ? p.solved.length : 0 })
  S.progress['c1_idiom'].lastSolvedAt = new Date(Date.now() - 10 * MIN).toISOString()
  for (const id of ['l1', 'l2']) { await call(id, 'account.login'); await call(id, 'game.summary', { gameType: 'idiom' }) }
  S.progress['l1_idiom'].solved = Array.from({ length: total }, (_, i) => i + 1); S.progress['l1_idiom'].solvedCount = total; S.progress['l1_idiom'].lastSolvedAt = new Date(Date.now() - 5 * MIN).toISOString()
  S.progress['l2_idiom'].solved = [1]; S.progress['l2_idiom'].solvedCount = 1; S.progress['l2_idiom'].lastSolvedAt = new Date().toISOString()
  S.users.l1.nickname = '榜一'
  r = await call('l2', 'leaderboard.list', { gameType: 'idiom' })
  assert(r.code === 0 && r.data.entries.length === 2 && r.data.entries[0].solvedCount === total && r.data.entries[0].rank === 1, 'top list ordered by solved count', r.data.entries)
  assert(r.data.entries[0].nickname !== '榜一' && r.data.entries[1].nickname === '榜一', 'tie broken by who got there first', r.data.entries.map((e) => e.nickname))
  assert(r.data.entries.every((e) => e.openid === undefined), 'leaderboard does not expose openid', r.data.entries)
  const expectedL2Rank = Object.values(S.progress).filter((p) => p.gameType === 'idiom' && (p.solvedCount || 0) > 1).length + 1
  assert(r.data.me.rank === expectedL2Rank && !r.data.me.inTop && r.data.me.solvedCount === 1, 'self rank outside top', r.data.me)
  r = await call('l1', 'leaderboard.list', { gameType: 'idiom' }); assert(r.data.me.inTop && r.data.me.rank === 2 && r.data.entries[1].isMe, 'self inside top marked', r.data.me)
  await call('l3', 'account.login'); r = await call('l3', 'leaderboard.list', { gameType: 'idiom' }); assert(r.data.me.rank === null && r.data.me.solvedCount === 0, 'zero solved not ranked', r.data.me)
  // multiple games
  S.app_config = {}
  await call('g1', 'account.login')
  r = await call('g1', 'game.levelList', { gameType: 'chess' }); assert(r.code === 40000, 'unknown game type rejected', r)
  r = await call('g1', 'game.levelList', {}); assert(r.code === 40000, 'missing game type rejected', r)
  r = await call('g1', 'game.levelList', { gameType: 'poetry' })
  assert(r.code === 0 && r.data.total === LOADED_LEVEL_COUNT && r.data.stages.length >= 1 && r.data.stages[0].name === '幼儿园' && r.data.stages[0].firstLevelNo === 1, 'poetry stages from level data', r.data.stages)
  r = await call('g1', 'game.levelList', { gameType: 'idiom' }); assert(Array.isArray(r.data.stages) && r.data.stages.length === 0, 'idiom has no stages', r.data.stages)
  r = await call('g1', 'game.summary', { gameType: 'poetry' }); assert(r.data.achievement.title.name === '学童' && r.data.achievement.title.nextName === '诗童', 'poetry has its own titles', r.data.achievement.title)
  r = await call('g1', 'game.summary', { gameType: 'xiehouyu' }); assert(r.data.achievement.title.name === '听众', 'xiehouyu has its own titles', r.data.achievement.title)
  const staminaBeforePoetry = S.users.g1.items.stamina
  r = await call('g1', 'game.startAttempt', { gameType: 'poetry', levelNo: 1 })
  const poetry1 = poetryLevels[0]
  assert(r.code === 0 && r.data.puzzle.clue === poetry1.clue && r.data.puzzle.poemTitle === poetry1.poemTitle && r.data.puzzle.answerLength === poetry1.answer.length && r.data.puzzle.stage === '幼儿园', 'poetry puzzle carries poem info and stage', r.data.puzzle)
  assert(r.data.items.stamina === staminaBeforePoetry - 1, 'stamina shared across games', r.data.items)
  r = await call('g1', 'game.useHint', { gameType: 'poetry', levelNo: 1 }); assert(r.code === 0 && r.data.revealed.join('') === poetry1.answer[0], 'poetry hint reveals first blank char', r.data)
  r = await call('g1', 'game.submit', { gameType: 'poetry', levelNo: 1, answer: poetry1.answer })
  assert(r.data.correct && r.data.solution.verse === poetry1.verse && r.data.solution.author === poetry1.author && r.data.solution.pinyin === undefined, 'poetry solution has poetry fields only', r.data.solution)
  r = await call('g1', 'game.getLevel', { gameType: 'idiom', levelNo: 2 }); assert(r.code === 40003, 'progress is separate per game', r)
  r = await call('g1', 'game.startAttempt', { gameType: 'xiehouyu', levelNo: 1 })
  const xiehouyu1 = xiehouyuLevels[0]
  assert(r.data.puzzle.clue === xiehouyu1.clue && r.data.puzzle.answerLength === xiehouyu1.answer.length, 'xiehouyu puzzle', r.data.puzzle)
  r = await call('g1', 'game.submit', { gameType: 'xiehouyu', levelNo: 1, answer: xiehouyu1.answer }); assert(r.data.correct && r.data.solution.riddle === xiehouyu1.riddle && 'note' in r.data.solution, 'xiehouyu solution', r.data.solution)
  r = await call('g1', 'game.solvedBook', { gameType: 'poetry', page: 1 }); assert(r.data.total === 1 && r.data.entries[0].verse === poetry1.verse, 'poetry book', r.data)
  await call('g1', 'game.startAttempt', { gameType: 'poetry', levelNo: 2 })
  r = await call('g1', 'rescue.create', { gameType: 'poetry', levelNo: 2 }); const poetryRescue = r.data.rescueId
  await call('g2', 'account.login')
  r = await call('g2', 'rescue.view', { rescueId: poetryRescue }); assert(r.data.gameType === 'poetry' && r.data.puzzle.clue === poetryLevels[1].clue && r.data.puzzle.poemTitle === poetryLevels[1].poemTitle, 'poetry rescue shows poetry puzzle', r.data)
  r = await call('g2', 'rescue.answer', { rescueId: poetryRescue, answer: poetryLevels[1].answer }); assert(r.data.correct, 'friend solves poetry rescue', r)
  r = await call('g1', 'game.levelList', { gameType: 'poetry' }); assert(r.data.solved.includes(2) && r.data.rescueNotices.length === 1, 'poetry rescue advances poetry progress', r.data)
  S.progress['g1_poetry'].lastSolvedAt = new Date(Date.now() - MIN).toISOString()
  r = await call('g1', 'leaderboard.list', { gameType: 'poetry' }); assert(r.data.me.rank === 1 && r.data.me.solvedCount === 2 && r.data.me.titleName === '学童', 'poetry leaderboard is separate', r.data.me)
  S.app_config = { game_rules: { _id: 'game_rules', titles: { poetry: [...DEFAULT_RULES.titles.poetry, { name: '诗神', minSolved: 900 }] } } }
  r = await call('g1', 'game.summary', { gameType: 'poetry' }); assert(r.data.achievement.title.nextName === '诗童', 'appended poetry title config accepted', r.data.achievement.title)
  S.progress['g1_poetry'].solved = Array.from({ length: 500 }, (_, i) => i + 1)
  r = await call('g1', 'game.summary', { gameType: 'poetry' }); assert(r.data.achievement.title.name === '诗圣' && r.data.achievement.title.nextName === '诗神', 'poetry title extension works', r.data.achievement.title)
  S.app_config = { game_rules: { _id: 'game_rules', titles: [...DEFAULT_RULES.titles.idiom] } }
  r = await call('g1', 'game.summary', { gameType: 'poetry' }); assert(r.data.achievement.title.name === '诗圣' && r.data.achievement.title.nextName === null, 'legacy array titles config falls back to baselines', r.data.achievement.title)
  S.app_config = {}
  // typo game: eliminate-style hints
  S.app_config = {}
  await call('t1', 'account.login')
  const typo1 = typoLevels[0]
  r = await call('t1', 'game.startAttempt', { gameType: 'typo', levelNo: 1 })
  assert(r.code === 0 && r.data.puzzle.clue === typo1.clue && r.data.puzzle.board.length === 8 && r.data.puzzle.answerLength === 1 && r.data.puzzle.wrongPosition === typo1.wrongPosition, 'typo puzzle shows the wrong idiom and 8 candidates', r.data.puzzle)
  assert(r.data.maxHints === 3 && r.data.puzzle.eliminated.length === 0 && r.data.puzzle.revealed.length === 0 && r.data.puzzle.answer === undefined, 'typo hints are eliminations, answer hidden', r.data)
  assert(r.data.puzzle.clueHint === typo1.clueHint, 'primary-school typo level carries the explanation hint', r.data.puzzle.clueHint)
  let eliminated = []
  for (let hint = 1; hint <= 3; hint++) {
    r = await call('t1', 'game.useHint', { gameType: 'typo', levelNo: 1 })
    eliminated = r.data.eliminated
    assert(r.code === 0 && eliminated.length === hint * 2 && eliminated.every((index) => typo1.board[index] !== typo1.answer) && r.data.revealed.length === 0, `typo hint ${hint} eliminates two wrong candidates`, r.data)
  }
  r = await call('t1', 'game.useHint', { gameType: 'typo', levelNo: 1 }); assert(r.code === 40005, 'typo hint limit keeps at least two candidates', r)
  r = await call('t1', 'game.getLevel', { gameType: 'typo', levelNo: 1 }); assert(r.data.puzzle.eliminated.join() === eliminated.join(), 'eliminations persist', r.data.puzzle.eliminated)
  const wrongPick = typo1.board.find((char) => char !== typo1.answer)
  r = await call('t1', 'game.submit', { gameType: 'typo', levelNo: 1, answer: wrongPick })
  assert(r.data.correct === false && r.data.attempt.failed && r.data.attempt.maxWrongAttempts === 1, 'typo fails after one wrong pick (per-game rule)', r.data)
  r = await call('t1', 'game.startAttempt', { gameType: 'typo', levelNo: 1 }); assert(r.data.attempt.attemptsLeft === 1 && r.data.puzzle.eliminated.join() === eliminated.join(), 'retry keeps eliminations', r.data)
  r = await call('t1', 'game.submit', { gameType: 'typo', levelNo: 1, answer: typo1.answer })
  assert(r.data.correct && r.data.solution.idiom === typo1.idiom && r.data.solution.wrongChar === typo1.wrongChar && r.data.solution.explanation, 'typo solution shows the corrected idiom', r.data.solution)
  r = await call('t1', 'game.summary', { gameType: 'typo' }); assert(r.data.achievement.title.name === '书童', 'typo titles', r.data.achievement.title)
  // per-game level rules
  S.app_config = {}
  await call('p1', 'account.login')
  r = await call('p1', 'game.startAttempt', { gameType: 'idiom', levelNo: 1 }); assert(r.data.attempt.maxWrongAttempts === 3, 'idiom keeps the shared 3 wrong attempts', r.data.attempt)
  S.app_config = { game_rules: { _id: 'game_rules', levelByGame: { poetry: { staminaCost: 2, maxHints: 1 }, typo: { maxWrongAttempts: 2 } } } }
  const p1Stamina = S.users.p1.items.stamina
  r = await call('p1', 'game.startAttempt', { gameType: 'poetry', levelNo: 1 })
  assert(r.data.items.stamina === p1Stamina - 2 && r.data.maxHints === 1 && r.data.staminaCost === 2, 'poetry override: stamina cost 2, max 1 hint', r.data)
  r = await call('p1', 'game.startAttempt', { gameType: 'typo', levelNo: 1 }); assert(r.data.attempt.maxWrongAttempts === 2, 'configured typo override replaces the default', r.data.attempt)
  S.app_config = { game_rules: { _id: 'game_rules', levelByGame: { typo: { maxWrongAttempts: 0 }, chess: { maxHints: 9 } } } }
  S.app_config.game_rules.signupItems = { hint: 6 }
  r = await call('p1', 'account.login')
  assert(JSON.stringify(r.data.rules.levelByGame) === '{"typo":{"maxWrongAttempts":1}}', 'invalid override falls back to default, unknown game dropped', r.data.rules.levelByGame)
  await call('p2', 'account.login'); assert(S.users.p2.items.hint === 6, 'one bad override does not discard the rest of the config', S.users.p2.items)
  S.app_config = {}
  // overview: one call for hall and mine
  S.app_config = {}
  r = await call('o1', 'game.overview', {})
  assert(r.code === 0 && r.data.session.isNewUser && r.data.session.items.stamina === 50 && r.data.games.length === ALL_GAME_TYPES.length, 'overview returns session and every game', r.data && r.data.games && r.data.games.map((g) => g.gameType))
  assert(r.data.games.every((g) => g.total === LOADED_LEVEL_COUNT && g.solvedCount === 0 && g.achievement.title.name), 'overview game summaries', r.data.games[0])
  await call('o1', 'game.startAttempt', { gameType: 'poetry', levelNo: 1 })
  await call('o1', 'rescue.create', { gameType: 'poetry', levelNo: 1 })
  const o1Rescue = Object.values(S.rescues).find((x) => x.requesterOpenid === 'o1')
  await call('o2', 'account.login')
  await call('o2', 'rescue.answer', { rescueId: o1Rescue._id, answer: poetryLevels[0].answer })
  r = await call('o1', 'game.overview', {})
  assert(r.data.rescueNotices.length === 1 && r.data.rescueNotices[0].gameType === 'poetry' && r.data.games.find((g) => g.gameType === 'poetry').solvedCount === 1, 'overview collects notices across games', r.data.rescueNotices)
  r = await call('o1', 'game.overview', {}); assert(r.data.rescueNotices.length === 0 && r.data.session.isNewUser === false, 'overview notices shown once', r.data.rescueNotices)
  // generated nickname for new and legacy users
  S.app_config = {}
  r = await call('n1', 'account.login')
  assert(r.data.profile.nickname.length >= 4 && /的小/.test(r.data.profile.nickname) && r.data.profile.customized === false, 'new user gets a generated nickname', r.data.profile)
  const n1Name = r.data.profile.nickname
  r = await call('n1', 'account.login'); assert(r.data.profile.nickname === n1Name, 'generated nickname is stable', r.data.profile.nickname)
  S.users.legacy = { _id: 'legacy', nickname: '', avatarUrl: '', items: { hint: 1, stamina: 1 }, staminaAnchorAt: Date.now() }
  r = await call('legacy', 'account.login'); assert(r.data.profile.nickname && S.users.legacy.nickname === r.data.profile.nickname && r.data.profile.customized === false, 'legacy empty nickname backfilled', r.data.profile)
  r = await call('n1', 'account.updateProfile', { nickname: '真名字', avatarUrl: '' }); assert(r.code === 0 && r.data.customized === true, 'saving profile marks it customized', r.data)
  r = await call('n1', 'account.login'); assert(r.data.profile.customized === true && r.data.profile.nickname === '真名字', 'customized flag persists', r.data.profile)
  // tiered chests: big chest every 5th, configurable rules
  S.app_config = {}
  await call('k1', 'account.login'); await call('k1', 'game.summary', { gameType: 'idiom' })
  S.progress['k1_idiom'].solved = Array.from({ length: 30 }, (_, i) => i + 1)
  S.progress['k1_idiom'].milestoneClaimedSolvedCount = 40
  r = await call('k1', 'game.summary', { gameType: 'idiom' })
  assert(r.data.achievement.milestone.nextChestNo === 5 && r.data.achievement.milestone.nextChestIsBig && r.data.achievement.milestone.nextChestRewards[0].amount === 36, 'next chest preview shows the big chest', r.data.achievement.milestone)
  S.progress['k1_idiom'].solved = Array.from({ length: 50 }, (_, i) => i + 1)
  r = await call('k1', 'game.claimMilestones', { gameType: 'idiom' })
  assert(r.data.chests.length === 1 && r.data.chests[0].isBig && r.data.rewards.find((x) => x.type === 'stamina').amount === 36 && r.data.rewards.find((x) => x.type === 'hint').amount === 2, 'fifth chest is doubled', r.data)
  S.app_config = { game_rules: { _id: 'game_rules', milestone: { rewardRules: { stamina: { base: 20, step: '2' } }, bigChest: { multiplier: 3 } } } }
  S.progress['k1_idiom'].solved = Array.from({ length: 60 }, (_, i) => i + 1)
  r = await call('k1', 'game.claimMilestones', { gameType: 'idiom' })
  assert(r.data.chests[0].chestNo === 6 && r.data.rewards.find((x) => x.type === 'stamina').amount === 20, 'override base 20 + default step 2 (string step rejected), capped at 20', r.data)
  S.app_config = {}
  // practice rewards: earned as chests in the welfare bag, claimed by the user; daily caps apply when earning
  await call('p1', 'account.login')
  const report = (payload) => call('p1', 'practice.report', { practiceId: 'arithmetic', tier: 10, solvedDelta: 0, streak: 0, streakRunId: 'run-a', ...payload })
  const pendingAmount = (stats, type) => (stats.pendingRewards.find((reward) => reward.type === type) || {}).amount || 0
  r = await call('p1', 'practice.stats', { practiceId: 'arithmetic' })
  assert(r.code === 0 && r.data.totalSolved === 0 && r.data.tiers[100].solved === 0 && r.data.pendingChestCount === 0 && r.data.rewardRules.dailyCaps.stamina === 15, 'practice stats start empty with rules', r.data)
  r = await call('p1', 'practice.stats', { practiceId: 'chess' }); assert(r.code === 40000, 'unknown practice rejected', r)
  r = await report({ tier: 30 }); assert(r.code === 40000, 'unknown tier rejected', r)
  r = await report({ solvedDelta: -1 }); assert(r.code === 40000, 'negative solved rejected', r)
  r = await report({ solvedDelta: 501 }); assert(r.code === 40000, 'oversized report rejected', r)
  r = await call('p1', 'practice.claimChests', { practiceId: 'arithmetic' }); assert(r.code === 40016, 'nothing to claim before earning', r)
  const staminaBeforePractice = S.users.p1.items.stamina
  r = await report({ solvedDelta: 19, streak: 9 })
  assert(r.code === 0 && r.data.newChests.length === 0 && r.data.stats.tiers[10].solved === 19 && r.data.stats.tiers[10].bestStreak === 9, '19 solved, streak 9: no chest yet', r.data)
  r = await report({ solvedDelta: 1, streak: 10 })
  assert(r.data.newChests.length === 2 && r.data.newChests.some((chest) => chest.source === 'solved') && r.data.newChests.some((chest) => chest.source === 'streak') && r.data.stats.pendingChestCount === 2 && pendingAmount(r.data.stats, 'stamina') === 4, '20th solved and streak 10 each earn a chest', r.data)
  assert(S.users.p1.items.stamina === staminaBeforePractice, 'chests are not auto-claimed', S.users.p1.items)
  r = await report({ solvedDelta: 0, streak: 10 }); assert(r.data.newChests.length === 0, 'same streak threshold not paid twice in one run', r.data)
  r = await report({ solvedDelta: 0, streak: 10, streakRunId: 'run-b' }); assert(r.data.newChests.length === 1 && r.data.newChests[0].rewards[0].amount === 2, 'new run can earn streak 10 again', r.data)
  r = await report({ tier: 100, solvedDelta: 3, streak: 3, streakRunId: 'run-c' })
  assert(r.data.stats.tiers[100].solved === 3 && r.data.stats.tiers[10].solved === 20 && r.data.stats.totalSolved === 23, 'solved counted per tier and in total', r.data.stats)
  r = await call('p1', 'game.overview')
  assert(r.data.practices.length === 2 && r.data.practices[0].pendingChestCount === 3 && r.data.practices[1].pendingChestCount === 0, 'overview lists pending practice chests for the welfare bag', r.data.practices)
  r = await report({ solvedDelta: 0, streak: 150, streakRunId: 'run-d' })
  assert(r.data.missedByCap && r.data.stats.earnedToday.stamina === 15 && r.data.stats.earnedToday.hint === 3 && pendingAmount(r.data.stats, 'stamina') === 15 && pendingAmount(r.data.stats, 'hint') === 3, 'streak 150 earns up to the daily caps', r.data.stats)
  const chestsAtCap = r.data.stats.pendingChestCount
  r = await report({ solvedDelta: 100, streak: 160, streakRunId: 'run-d' })
  assert(r.data.newChests.length === 0 && r.data.missedByCap && r.data.stats.totalSolved === 123 && r.data.stats.pendingChestCount === chestsAtCap, 'after caps (stamina 15, hint 3): stats still grow, no new chests', r.data)
  const hintBeforeClaim = S.users.p1.items.hint
  r = await call('p1', 'practice.claimChests', { practiceId: 'arithmetic' })
  assert(r.code === 0 && r.data.chestCount === chestsAtCap && r.data.items.stamina === staminaBeforePractice + 15 && r.data.items.hint === hintBeforeClaim + 3, 'claim opens all practice chests at once', r.data)
  r = await call('p1', 'practice.claimChests', { practiceId: 'arithmetic' }); assert(r.code === 40016, 'chests claim only once', r)
  assert(Object.values(S.item_logs).some((log) => log.openid === 'p1' && log.reason === 'practice' && log.practiceId === 'arithmetic'), 'practice rewards logged', null)
  // multiplication: progress lives in the cloud (forward-only merge); each achievement pays one chest, ever
  const emptyExam = { passed: false, passCount: 0, attempts: 0, bestCorrect: 0, fastestSeconds: 0, passedAt: 0 }
  const syncKungfu = (openid, progress) => call(openid, 'practice.syncProgress', { practiceId: 'multiplication', progress })
  r = await syncKungfu('p1', { rows: { 10: { studied: true, mastered: true, stars: 3 } }, exam: emptyExam }); assert(r.code === 40000, 'row out of range rejected', r)
  r = await syncKungfu('p1', { rows: { 1: { studied: true, mastered: true, stars: 4 } }, exam: emptyExam }); assert(r.code === 40000, 'stars above 3 rejected', r)
  r = await syncKungfu('p1', { rows: {}, exam: { ...emptyExam, passedAt: Date.now() + 7 * 24 * 60 * MIN } }); assert(r.code === 40000, 'future pass time rejected', r)
  r = await call('p1', 'practice.syncProgress', { practiceId: 'arithmetic', progress: { rows: {}, exam: emptyExam } }); assert(r.code === 40000, 'progress sync only for multiplication', r)
  r = await syncKungfu('p1', { rows: {}, exam: emptyExam })
  assert(r.code === 0 && r.data.newChests.length === 0 && r.data.progress.rows[5].mastered === false, 'empty progress syncs with no chests', r.data)
  r = await syncKungfu('p1', { rows: { 1: { studied: true, mastered: true, stars: 3 }, 2: { studied: true, mastered: false, stars: 0 } }, exam: { ...emptyExam, attempts: 1 } })
  assert(r.data.newChests.length === 2 && r.data.pendingChestCount === 2, 'first mastery + first 3 stars earn two chests', r.data)
  const passedAt = Date.now() - 60 * MIN
  r = await syncKungfu('p1', { rows: { 1: { studied: true, mastered: true, stars: 1 }, 2: { studied: true, mastered: true, stars: 2 } }, exam: { passed: true, passCount: 1, attempts: 2, bestCorrect: 25, fastestSeconds: 200, passedAt } })
  assert(r.data.newChests.length === 2 && r.data.newChests.some((chest) => chest.source === 'grandmaster') && r.data.pendingChestCount === 4, 'only new achievements pay (row 2 mastered, grandmaster), even past the daily cap', r.data)
  assert(r.data.progress.rows[1].stars === 3 && r.data.progress.rows[1].mastered && r.data.progress.exam.fastestSeconds === 200, 'merge keeps best stars, never downgrades', r.data.progress)
  r = await syncKungfu('p1', { rows: {}, exam: { passed: true, passCount: 1, attempts: 1, bestCorrect: 23, fastestSeconds: 150, passedAt: passedAt + 10 * MIN } })
  assert(r.data.newChests.length === 0 && r.data.progress.rows[2].mastered && r.data.progress.exam.fastestSeconds === 150 && r.data.progress.exam.passedAt === passedAt && r.data.progress.exam.bestCorrect === 25, 'a fresh device gets the cloud progress back; fastest time and first pass merge', r.data.progress.exam)
  r = await call('p1', 'game.overview')
  assert(r.data.practices[1].practiceId === 'multiplication' && r.data.practices[1].pendingChestCount === 4, 'multiplication chests listed for the welfare bag', r.data.practices)
  const staminaBeforeKungfu = S.users.p1.items.stamina
  r = await call('p1', 'practice.claimChests', { practiceId: 'multiplication' })
  assert(r.code === 0 && r.data.chestCount === 4 && r.data.items.stamina === staminaBeforeKungfu + 20, 'claim multiplication chests: 5 + 5 + 10 stamina', r.data)
  // honors: flowers for practice events + daily first practice, medals unlock from cloud stats, day streaks
  const chinaKey = (timestamp) => new Date(timestamp + 8 * 3600000).toISOString().slice(0, 10).replace(/-/g, '')
  await call('h1', 'account.login')
  const reportH = (payload) => call('h1', 'practice.report', { practiceId: 'arithmetic', tier: 10, solvedDelta: 0, streak: 0, streakRunId: 'h-run', ...payload })
  r = await call('h1', 'practice.honors')
  assert(r.code === 0 && r.data.flowers === 0 && r.data.medalCount === 17 && r.data.unlockedCount === 0 && r.data.groups.length === 3, 'honors start empty with 17 medals in 3 groups', r.data)
  r = await reportH({ solvedDelta: 10, streak: 10 })
  const medalIds = (result) => result.data.honors.newMedals.map((medal) => medal.id).sort().join(',')
  assert(r.data.honors.flowersGained === 3 && r.data.honors.flowerReasons.includes('dailyFirst') && r.data.honors.todayFlowers === 3, '10 solved + streak 10 + first practice today = 3 flowers', r.data.honors)
  assert(medalIds(r) === 'arith-first,arith-streak-10', 'first answer and streak 10 medals unlock', r.data.honors.newMedals)
  r = await reportH({ solvedDelta: 5, streak: 15 })
  assert(r.data.honors.flowersGained === 0 && r.data.honors.newMedals.length === 0, 'no daily flower twice, medals unlock once', r.data.honors)
  r = await reportH({ solvedDelta: 0, streak: 0, streakRunId: 'h-run-2' })
  assert(r.data.honors.flowersGained === 0, 'a report with no answers does not count as practising', r.data.honors)
  const honorsDoc = S.practice_stats.h1_honors
  honorsDoc.lastPracticeDate = chinaKey(Date.now() - 24 * 3600000); honorsDoc.dayStreak = 2; honorsDoc.bestDayStreak = 2
  r = await reportH({ solvedDelta: 1, streak: 1, streakRunId: 'h-run-3' })
  assert(r.data.honors.flowerReasons.includes('dailyFirst') && medalIds(r) === 'days-3' && S.practice_stats.h1_honors.dayStreak === 3, 'practising on the next day grows the streak to 3 and unlocks 坚持之星', r.data.honors)
  honorsDoc.lastPracticeDate = chinaKey(Date.now() - 3 * 24 * 3600000)
  r = await call('h1', 'practice.honors'); assert(r.data.dayStreak === 0 && r.data.bestDayStreak === 3, 'missed days show a broken streak, best kept', r.data)
  const kungfuExam = { passed: false, passCount: 0, attempts: 0, bestCorrect: 0, fastestSeconds: 0, passedAt: 0 }
  r = await call('h1', 'practice.syncProgress', { practiceId: 'multiplication', progress: { rows: { 1: { studied: true, recited: true, mastered: true, stars: 3 } }, exam: kungfuExam }, practiced: true })
  assert(r.code === 0 && r.data.honors.flowersGained === 4 && medalIds(r) === 'kungfu-row-1', 'recited + mastered + perfect + first practice after a gap = 4 flowers, 入门弟子 medal', r.data.honors)
  r = await call('h1', 'practice.syncProgress', { practiceId: 'multiplication', progress: { rows: { 1: { studied: true, mastered: true, stars: 3 } }, exam: kungfuExam } })
  assert(r.code === 0 && r.data.honors.flowersGained === 0 && r.data.progress.rows[1].recited, 'old clients without recited still sync; nothing paid twice', r.data)
  r = await call('h1', 'practice.honors')
  const lockedMedal = r.data.groups[0].medals.find((medal) => medal.id === 'arith-solved-100')
  assert(r.data.unlockedCount === 4 && r.data.flowers === 8 && !lockedMedal.unlocked && lockedMedal.current === 16 && lockedMedal.target === 100, 'honor wall shows progress towards locked medals', r.data)
  // timed exams: three levels per tier, 80+ opens the next, scores kept, flowers + exam medals
  await call('e1', 'account.login')
  const exam = (payload) => call('e1', 'practice.reportExam', { practiceId: 'arithmetic', tier: 10, level: 1, correct: 20, seconds: 90, ...payload })
  r = await call('e1', 'practice.stats', { practiceId: 'arithmetic' })
  assert(r.data.tiers[10].exams.length === 3 && r.data.tiers[10].exams[0].unlocked && !r.data.tiers[10].exams[1].unlocked && r.data.tiers[10].exams[0].best === null, 'only level 1 open at first', r.data.tiers[10].exams)
  r = await exam({ level: 2 }); assert(r.code === 40000, 'locked level rejected', r)
  r = await exam({ correct: 21 }); assert(r.code === 40000, 'more than 20 correct rejected', r)
  r = await exam({ seconds: 0 }); assert(r.code === 40000, 'zero seconds rejected', r)
  r = await exam({ correct: 15, seconds: 150 })
  assert(r.code === 0 && r.data.score === 75 && r.data.unlockedLevel === null && !r.data.exams[1].unlocked && r.data.honors.flowerReasons.includes('examPassed'), '75 points: passed flower, level 2 still locked', r.data)
  r = await exam({ correct: 18, seconds: 140 })
  assert(r.data.score === 90 && r.data.unlockedLevel === 2 && r.data.isNewBest && r.data.previousBest === 75 && r.data.honors.flowerReasons[0] === 'examGreat', '90 points opens level 2 and gives 2 flowers', r.data)
  r = await exam({ correct: 10, seconds: 100 })
  assert(r.data.score === 50 && !r.data.isNewBest && r.data.exams[0].best === 90 && r.data.exams[0].attempts === 3 && r.data.honors.flowersGained === 0, 'a low score keeps the best and earns no flower', r.data)
  r = await exam({ level: 2, correct: 20, seconds: 100 })
  assert(r.data.score === 100 && r.data.unlockedLevel === 3 && r.data.honors.newMedals.some((medal) => medal.id === 'exam-full-score'), 'full score opens level 3 and earns 满分小状元', r.data)
  r = await exam({ level: 3, correct: 20, seconds: 70 })
  assert(r.data.honors.newMedals.map((medal) => medal.id).join() === 'exam-lightning', 'full score on the hardest level earns 闪电手', r.data.honors)
  await exam({ tier: 20, correct: 20, seconds: 200 })
  r = await exam({ tier: 100, correct: 20, seconds: 400 })
  assert(r.data.honors.newMedals.some((medal) => medal.id === 'exam-all-tiers'), 'full score in all three tiers earns 三档满分', r.data.honors)
  r = await call('e1', 'practice.stats', { practiceId: 'arithmetic' })
  assert(r.data.tiers[10].exams[2].best === 100 && r.data.tiers[10].exams[2].bestSeconds === 70 && r.data.tiers[20].exams[1].unlocked, 'stats show best score, time and unlocks per tier', r.data.tiers)
  S.app_config = { game_rules: { _id: 'game_rules', honors: { flowers: { arithmeticStreaks: [10, 5], perEvent: { arithmeticSolved: 3 } } } } }
  r = await reportH({ solvedDelta: 4, streak: 2, streakRunId: 'h-run-3' })
  assert(r.data.honors.flowersGained === 3, 'per-event flowers configurable; invalid streak list falls back', r.data.honors)
  S.app_config = {}
  S.app_config = { game_rules: { _id: 'game_rules', practice: { solvedRewards: [{ every: 0, rewards: [] }], dailyCaps: { stamina: 1 } } } }
  r = await call('p1', 'practice.stats', { practiceId: 'arithmetic' })
  assert(r.data.rewardRules.solvedRewards[0].every === 20 && r.data.rewardRules.dailyCaps.stamina === 1, 'invalid practice override falls back, valid cap applies', r.data.rewardRules)
  S.app_config = {}
  // watch a video to double a free claim: single-use token from today's record, only when videos are on
  await call('d1', 'account.login')
  r = await call('d1', 'account.checkin'); assert(r.code === 0 && r.data.doubleToken === '', 'videos off: no double offer', r.data)
  S.app_config = { game_rules: { _id: 'game_rules', ad: { enabled: true, adUnitId: 'adunit-test' } } }
  S.users.d1.staminaPending = 6
  r = await call('d1', 'account.claimRecoveredStamina'); const recoveryToken = r.data.doubleToken
  assert(r.code === 0 && /^[0-9a-f]{16}$/.test(recoveryToken), 'videos on: claiming recovered stamina offers a double', r.data)
  const staminaBeforeDouble = S.users.d1.items.stamina
  r = await call('d1', 'account.claimDoubleReward', { token: recoveryToken })
  assert(r.code === 0 && r.data.items.stamina === staminaBeforeDouble + 6 && r.data.rewards[0].amount === 6, 'double gives the same 6 stamina again', r.data)
  r = await call('d1', 'account.claimDoubleReward', { token: recoveryToken }); assert(r.code === 40006, 'a double token works once', r)
  r = await call('d1', 'account.claimDoubleReward', { token: 'ffffffffffffffff' }); assert(r.code === 40006, 'unknown token rejected', r)
  r = await call('d1', 'account.claimDoubleReward', { token: '../x' }); assert(r.code === 40000, 'malformed token rejected', r)
  S.progress.d1_idiom = { _id: 'd1_idiom', openid: 'd1', gameType: 'idiom', currentLevel: 11, solved: Array.from({ length: 10 }, (_, i) => i + 1), solvedCount: 10, hintsUsed: {}, attempts: {} }
  r = await call('d1', 'game.claimMilestones', { gameType: 'idiom' })
  assert(r.code === 0 && r.data.doubleToken && r.data.rewards.length === 2, 'opening level chests offers a double', r.data)
  const hintBeforeChestDouble = S.users.d1.items.hint
  r = await call('d1', 'account.claimDoubleReward', { token: r.data.doubleToken }); assert(r.code === 0 && r.data.items.hint === hintBeforeChestDouble + 1, 'chest double adds the chest rewards again', r.data)
  S.app_config = {}
  // video stats for the admin page, and no double offer for tiny recovery claims
  S.app_config = { game_rules: { _id: 'game_rules', ad: { enabled: true, adUnitId: 'adunit-test' }, admin: { openids: ['v1'] } } }
  await call('v1', 'account.login'); await call('v2', 'account.login')
  const todayAds = () => S.stats_daily[Object.keys(S.stats_daily).filter((id) => id.startsWith('ads_')).sort().pop()]
  const adsBefore = { ...todayAds().views, viewers: todayAds().viewers }
  await call('v1', 'account.grantAdReward', { itemType: 'stamina' })
  await call('v1', 'account.grantAdReward', { itemType: 'hint' })
  await call('v2', 'account.grantAdReward', { itemType: 'stamina' })
  S.users.v2.staminaPending = 3
  r = await call('v2', 'account.claimRecoveredStamina'); assert(r.code === 0 && r.data.doubleToken === '', 'recovery below 5 points: no double offer', r.data)
  S.users.v2.staminaPending = 5
  r = await call('v2', 'account.claimRecoveredStamina'); assert(/^[0-9a-f]{16}$/.test(r.data.doubleToken), 'recovery of 5 points: double offered', r.data)
  await call('v2', 'account.claimDoubleReward', { token: r.data.doubleToken })
  const adsAfter = todayAds()
  assert(adsAfter.views.stamina === adsBefore.stamina + 2 && adsAfter.views.hint === adsBefore.hint + 1 && adsAfter.views.double === adsBefore.double + 1 && adsAfter.viewers === adsBefore.viewers + 2, 'ad views counted per kind, viewers counted once per person per day', adsAfter)
  r = await call('v1', 'admin.stats', { gameType: 'idiom' })
  assert(r.code === 0 && r.data.adStats.length >= 1 && r.data.adStats[0].views === adsAfter.views.stamina + adsAfter.views.hint + adsAfter.views.double && r.data.adStats[0].viewsPerViewer > 0, 'admin stats include daily video numbers', r.data.adStats)
  S.app_config = {}
  // stamina recovery rules, with fixed clocks: one point per 30 minutes, at most 15 per Beijing day
  const { settleStamina } = require(path.join(API_ROOT, 'lib', 'items'))
  const recovery = { enabled: true, intervalMinutes: 30, dailyCap: 15, pendingCap: 1000 }
  const beijing = (day, hour, minute = 0) => Date.UTC(2026, 9, day, hour - 8, minute)
  let settled = settleStamina({ pending: 0, anchorAt: beijing(13, 8), recoveredDate: '', recoveredCount: 0 }, recovery, beijing(13, 10, 5))
  assert(settled.staminaPending === 4 && settled.recoveredCount === 4 && settled.staminaAnchorAt === beijing(13, 10), '2h05m -> 4 points, clock kept at the last tick', settled)
  settled = settleStamina({ pending: 0, anchorAt: beijing(13, 8), recoveredDate: '', recoveredCount: 0 }, recovery, beijing(13, 23))
  assert(settled.staminaPending === 15 && settled.recoveredCount === 15, 'a whole day stops at 15', settled)
  settled = settleStamina({ pending: 15, anchorAt: settled.staminaAnchorAt, recoveredDate: settled.recoveredDate, recoveredCount: 15 }, recovery, beijing(14, 1))
  assert(settled.staminaPending === 18 && settled.recoveredCount === 3 && settled.recoveredDate === '2026-10-14', 'after midnight the count restarts (23:30 skipped as capped; 00:00, 00:30, 01:00 count)', settled)
  settled = settleStamina({ pending: 0, anchorAt: beijing(10, 12), recoveredDate: '', recoveredCount: 0 }, recovery, beijing(13, 12))
  assert(settled.staminaPending === 15 * 3 + 15 && settled.recoveredDate === '2026-10-13', 'three days away: 15 per day (10th afternoon 15, 11th 15, 12th 15, 13th morning 15)', settled)
  settled = settleStamina({ pending: 0, anchorAt: beijing(10, 12), recoveredDate: '', recoveredCount: 0 }, { ...recovery, pendingCap: 30 }, beijing(13, 12))
  assert(settled.staminaPending === 30, 'unclaimed recovery stops at the pending cap of 30', settled)
  settled = settleStamina({ pending: 30, anchorAt: settled.staminaAnchorAt, recoveredDate: settled.recoveredDate, recoveredCount: settled.recoveredCount }, { ...recovery, pendingCap: 30 }, beijing(13, 14))
  assert(settled.staminaPending === 30 && settled.staminaAnchorAt === beijing(13, 14), 'while pending is full the clock moves on without saving points', settled)
  settled = settleStamina({ pending: 3, anchorAt: beijing(13, 8), recoveredDate: '', recoveredCount: 0 }, { ...recovery, enabled: false }, beijing(13, 20))
  assert(settled.staminaPending === 3, 'recovery off keeps pending as is', settled)
  console.log('logs:', Object.values(S.item_logs).filter((l) => l.openid === 'u1').map((l) => `${l.reason}:${l.itemType}${l.delta > 0 ? '+' : ''}${l.delta}`).join(' '))
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exitCode = failed ? 1 : 0
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
