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
const hanziLevels = readLevels('hanzi')
const S = sdk.testing.store
S.levels = Object.fromEntries(
  [levels, poetryLevels, xiehouyuLevels, typoLevels, hanziLevels].flatMap((gameLevels) => gameLevels.slice(0, LOADED_LEVEL_COUNT)).map((level) => [level._id, level])
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
  assert(r.code === 0 && r.data.items.hint === 8 && r.data.items.stamina === 50 && r.data.items.rescue === undefined, 'signup items hint8 stamina50', r)
  assert(r.data.rules.rescue.dailyLimitPerHelper === 2, 'rescue limit exposed', r.data)
  r = await call('u1', 'account.login'); assert(!r.data.isNewUser && r.data.items.hint === 8, 'relogin no double grant', r)
  r = await call('u1', 'game.getLevel', { gameType: 'idiom', levelNo: 1 }); assert(r.data.puzzle === null && !r.data.attempt.active && r.data.staminaCost === 1, 'puzzle hidden before start', r)
  r = await call('u1', 'game.submit', { gameType: 'idiom', levelNo: 1, answer: 'x' }); assert(r.code === 40010, 'submit needs active attempt', r)
  r = await call('u1', 'game.useHint', { gameType: 'idiom', levelNo: 1 }); assert(r.code === 40010, 'hint needs active attempt', r)
  r = await call('u1', 'game.startAttempt', { gameType: 'idiom', levelNo: 1 }); assert(r.code === 0 && r.data.items.stamina === 49 && r.data.puzzle.board.length === 12 && !r.data.puzzle.answer && r.data.attempt.attemptsLeft === 3, 'start costs 1 stamina', r)
  r = await call('u1', 'game.startAttempt', { gameType: 'idiom', levelNo: 1 }); assert(r.data.items === null && S.users.u1.items.stamina === 49, 're-enter active attempt is free', r)
  r = await call('u1', 'game.useHint', { gameType: 'idiom', levelNo: 1 }); assert(r.code === 0 && r.data.items.hint === 7 && r.data.revealed.join('') === levels[0].answer[0], 'hint', r)
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
  r = await call('u1', 'account.checkin'); assert(r.code === 0 && r.data.items.stamina === 5 && r.data.items.hint === 8, 'checkin grants 1 hint + 5 stamina', r)
  r = await call('u1', 'account.checkin'); assert(r.code === 40002, 'checkin once', r)
  S.users.u1.items.stamina = 0; S.users.u1.staminaAnchorAt = Date.now()
  r = await call('u1', 'game.startAttempt', { gameType: 'idiom', levelNo: 2 }); assert(r.data.next === 'practice' && r.data.practiceStaminaRoom === 15, 'ad off -> earn stamina by practice', r)
  S.progress['u1_idiom'].solved = [1, ...Array.from({ length: 9 }, (_, i) => i + 3)]
  r = await call('u1', 'game.startAttempt', { gameType: 'idiom', levelNo: 2 }); assert(r.data.next === 'openChests' && r.data.welfareChests === 1, 'unopened chest in the welfare bag -> open it first', r.data)
  S.progress['u1_idiom'].solved = [1]
  S.daily[Object.keys(S.daily).find((id) => id.startsWith('u1_'))].practiceEarned = { stamina: 15, hint: 0 }
  r = await call('u1', 'game.startAttempt', { gameType: 'idiom', levelNo: 2 }); assert(r.data.next === 'waitRecovery', 'practice capped, ad off -> wait recovery', r)
  S.users.u1.staminaAnchorAt = Date.now() - 65 * MIN
  r = await call('u1', 'account.login'); assert(r.data.items.stamina === 2 && r.data.items.staminaPending === undefined && r.data.items.nextStaminaAt > Date.now(), 'recovered stamina goes straight in (2 after 65min)', r.data.items)
  S.users.u1.items.stamina = 40
  S.users.u1.staminaAnchorAt = Date.now() - 65 * MIN
  r = await call('u1', 'account.login'); assert(r.data.items.stamina === 42, 'recovery no longer stops when holding plenty of stamina', r.data.items)
  S.users.u1.items.stamina = 0
  S.users.u1.staminaPending = 10
  S.users.u1.staminaAnchorAt = Date.now() - 10 * MIN
  S.users.u1.staminaRecoveredDate = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
  S.users.u1.staminaRecoveredCount = 15
  r = await call('u1', 'account.login'); assert(r.data.items.stamina === 10 && r.data.items.recoveryLeftToday === 0 && r.data.items.nextStaminaAt === null, "points left unclaimed from before are paid in; today's 15 recovered: countdown stops until tomorrow", r.data.items)
  S.users.u1.staminaRecoveredCount = 3
  r = await call('u1', 'game.startAttempt', { gameType: 'idiom', levelNo: 2 })
  assert(r.code === 0 && r.data.items.stamina === 9 && S.users.u1.staminaPending === 0 && S.users.u1.items.stamina === 9 && r.data.items.recoveryLeftToday === 12 && r.data.items.nextStaminaAt > Date.now(), 'spending saves the paid-in points; below the daily cap the countdown keeps running', { items: r.data.items, user: S.users.u1 })
  r = await call('u1', 'account.claimRecoveredStamina'); assert(r.code === 40000, 'there is nothing to claim any more', r)
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
  r = await call('u5', 'game.levelList', { gameType: 'idiom' }); assert(r.data.achievement.title.name === '蒙童' && r.data.achievement.title.nextName === '童生' && r.data.achievement.title.nextMinSolved === 10 && r.data.achievement.milestone.levelsToNextChest === 10, 'initial title + milestone', r)
  r = await call('u5', 'chests.open', { all: true }); assert(r.code === 40016, 'nothing to claim', r)
  S.progress['u5_idiom'].solved = [1,2,3,4,5,6,7,8,9]; S.progress['u5_idiom'].currentLevel = 10
  S.app_config = {}
  await call('u5', 'game.startAttempt', { gameType: 'idiom', levelNo: 10 })
  r = await call('u5', 'game.submit', { gameType: 'idiom', levelNo: 10, answer: levels[9].answer }); assert(r.data.correct && r.data.titleUpgrade === '童生' && r.data.achievement.milestone.pendingChests === 1, 'solve 10th -> title upgrade + chest', r)
  const before = { ...S.users.u5.items }
  r = await call('u5', 'chests.open', { all: true }); assert(r.code === 0 && r.data.chests.length === 1 && r.data.items.hint === before.hint + 1 && r.data.items.stamina === before.stamina + 10 && r.data.chests[0].chestNo === 1, 'first chest: 10 stamina + 1 hint', r.data)
  r = await call('u5', 'chests.open', { all: true }); assert(r.code === 40016, 'chest claimed once', r)
  S.progress['u5_idiom'].solved = Array.from({ length: 29 }, (_, i) => i + 1)
  r = await call('u5', 'game.levelList', { gameType: 'idiom' }); assert(r.data.achievement.milestone.pendingChests === 1 && r.data.achievement.milestone.levelsToNextChest === 1, 'pending after more solves', r.data.achievement)
  S.progress['u5_idiom'].solved.push(30)
  r = await call('u5', 'chests.open', { all: true }); assert(r.data.chests.length === 2 && r.data.rewards.find((x) => x.type === 'hint').amount === 2 && r.data.rewards.find((x) => x.type === 'stamina').amount === 26, 'chests 2 and 3 summed (12 + 14 stamina)', r.data)
  r = await call('u5', 'game.solvedBook', { gameType: 'idiom', page: 1 }); assert(r.data.total === 30 && r.data.entries.length === 20 && r.data.entries[0].levelNo === 1 && r.data.entries[0].answer === levels[0].answer && r.data.hasMore, 'book page 1', r.data.total)
  r = await call('u5', 'game.solvedBook', { gameType: 'idiom', page: 2 }); assert(r.data.entries.length === 10 && !r.data.hasMore, 'book page 2', r.data.entries.length)
  const baseline = DEFAULT_RULES.titles.idiom
  S.app_config = { game_rules: { _id: 'game_rules', titles: { idiom: [...baseline, { name: '尚书', minSolved: 1200 }] } } }
  S.progress['u5_idiom'].solved = Array.from({ length: 1000 }, (_, i) => i + 1)
  r = await call('u5', 'game.levelList', { gameType: 'idiom' }); assert(r.data.achievement.title.name === '大学士' && r.data.achievement.title.nextName === '尚书' && r.data.achievement.title.nextMinSolved === 1200, 'appended title accepted', r.data.achievement.title)
  const inserted = [...baseline.slice(0, 3), { name: '插队', minSolved: 40 }, ...baseline.slice(3)]
  S.app_config.game_rules.titles = { idiom: inserted }
  S.progress['u5_idiom'].solved = Array.from({ length: 45 }, (_, i) => i + 1)
  r = await call('u5', 'game.levelList', { gameType: 'idiom' }); assert(r.data.achievement.title.name === '秀才', 'inserted-in-middle title rejected -> baseline', r.data.achievement.title)
  S.app_config.game_rules.titles = { idiom: baseline.map((t) => (t.name === '举人' ? { ...t, minSolved: 300 } : t)) }
  S.progress['u5_idiom'].solved = Array.from({ length: 160 }, (_, i) => i + 1)
  r = await call('u5', 'game.levelList', { gameType: 'idiom' }); assert(r.data.achievement.title.name === '举人', 'retuned threshold rejected -> baseline', r.data.achievement.title)
  S.app_config.game_rules.titles = { idiom: [...baseline, { name: '尚书', minSolved: 900 }] }
  S.progress['u5_idiom'].solved = Array.from({ length: 1000 }, (_, i) => i + 1)
  r = await call('u5', 'game.levelList', { gameType: 'idiom' }); assert(r.data.achievement.title.name === '大学士' && r.data.achievement.title.nextName === null, 'non-increasing append rejected -> baseline', r.data.achievement.title)
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
  await call('u8', 'account.login')
  const burst = await Promise.all([0, 1, 2, 3, 4].map(() => call('u8', 'rescue.answer', { rescueId: rescueU6, answer: 'xxxx' })))
  const u8Attempt = Object.values(S.rescue_helper_attempts).find((attempt) => attempt.helperOpenid === 'u8' && attempt.rescueId === rescueU6)
  assert(u8Attempt.wrongCount === 3 && burst.filter((result) => result.code === 40014).length === 2, 'guesses sent all at once still stop at 3 hearts', { wrongCount: u8Attempt.wrongCount, codes: burst.map((result) => result.code) })
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
  S.rescues = S.rescues || {}
  S.rescues.oldOpenRescue = { _id: 'oldOpenRescue', status: 'open' }
  S.rescues.oldSolvedRescue = { _id: 'oldSolvedRescue', status: 'solved' }
  S.rescue_helper_attempts.oldOpenAttempt = { _id: 'oldOpenAttempt', rescueId: 'oldOpenRescue', date: '20200101', wrongCount: 3 }
  S.rescue_helper_attempts.oldSolvedAttempt = { _id: 'oldSolvedAttempt', rescueId: 'oldSolvedRescue', date: '20200101', wrongCount: 1 }
  const recentLogCount = Object.keys(S.item_logs).length - 1
  S.item_logs.spoofProbe = { _id: 'spoofProbe', openid: 'u1', createdAt: new Date(Date.now() - 200 * DAY).toISOString() }
  r = await call('u1', 'account.login', {}); sdk.testing.actAs('u1')
  r = await main({ Type: 'Timer', TriggerName: 'cleanupExpiredRecords', action: 'account.login' }); assert(r.code === 0 && r.data.isNewUser === false && S.item_logs.spoofProbe, 'client cannot spoof a timer trigger', r)
  delete S.item_logs.spoofProbe
  sdk.testing.actAs('')
  r = await main({ Type: 'Timer', TriggerName: 'cleanupExpiredRecords' }); assert(r.code === 0 && r.data.item_logs === 1 && r.data.daily === 1 && r.data.rescue_help_pairs === 1, 'cleanup removes expired records', r)
  assert(Object.keys(S.item_logs).length === recentLogCount && !S.daily.oldDaily, 'recent records kept', Object.keys(S.item_logs).length)
  assert(S.rescue_helper_attempts.oldOpenAttempt && !S.rescue_helper_attempts.oldSolvedAttempt && r.data.rescue_helper_attempts === 1, 'hearts on a rescue still open are kept; closed ones are cleaned', r.data)
  r = await main({ Type: 'Timer', TriggerName: 'nope' }); assert(r.code === 40000, 'unknown timer rejected', r)
  r = await main({ action: 'account.login' }); assert(r.code === 40000, 'call without user identity rejected', r)
  // all-clear, completions, stats, admin
  S.app_config = {}
  const total = LOADED_LEVEL_COUNT
  await call('c1', 'account.login'); await call('c1', 'game.levelList', { gameType: 'idiom' })
  S.progress['c1_idiom'].solved = Array.from({ length: total - 1 }, (_, i) => i + 1)
  S.progress['c1_idiom'].currentLevel = total
  await call('c1', 'game.startAttempt', { gameType: 'idiom', levelNo: total })
  r = await call('c1', 'game.submit', { gameType: 'idiom', levelNo: total, answer: levels[total - 1].answer })
  assert(r.data.correct && r.data.allCleared && r.data.nextLevelNo === null && r.data.totalLevels === total, 'solving the last level reports all cleared', r.data)
  assert(Object.values(S.completions).filter((c) => c.openid === 'c1' && c.totalLevels === total).length === 1, 'completion recorded once', S.completions)
  r = await call('c1', 'game.levelList', { gameType: 'idiom' }); assert(r.data.allCleared && r.data.currentLevel === total, 'level list all cleared', r.data.allCleared)
  r = await call('c1', 'game.levelList', { gameType: 'idiom' }); assert(r.data.allCleared, 'summary all cleared', r.data)
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
  for (const id of ['l1', 'l2']) { await call(id, 'account.login'); await call(id, 'game.levelList', { gameType: 'idiom' }) }
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
  r = await call('l2', 'leaderboard.summary', {})
  const l2IdiomCard = r.data.games.find((card) => card.gameType === 'idiom')
  assert(r.code === 0 && r.data.games.length === ALL_GAME_TYPES.length && l2IdiomCard.myRank === expectedL2Rank && l2IdiomCard.mySolved === 1 && l2IdiomCard.leader.solvedCount === total && !l2IdiomCard.leader.isMe && l2IdiomCard.leader.openid === undefined, 'summary: my rank and the leader per game, no openid', l2IdiomCard)
  const l2PoetryCard = r.data.games.find((card) => card.gameType === 'poetry')
  assert(l2PoetryCard.myRank === null && l2PoetryCard.mySolved === 0 && !S.progress.l2_poetry, 'summary: a game never opened has no rank and gets no progress record', l2PoetryCard)
  // multiple games
  S.app_config = {}
  await call('g1', 'account.login')
  r = await call('g1', 'game.levelList', { gameType: 'chess' }); assert(r.code === 40000, 'unknown game type rejected', r)
  r = await call('g1', 'game.levelList', {}); assert(r.code === 40000, 'missing game type rejected', r)
  r = await call('g1', 'game.levelList', { gameType: 'poetry' })
  assert(r.code === 0 && r.data.total === LOADED_LEVEL_COUNT && r.data.stages.length >= 1 && r.data.stages[0].name === '幼儿园' && r.data.stages[0].firstLevelNo === 1, 'poetry stages from level data', r.data.stages)
  r = await call('g1', 'game.levelList', { gameType: 'idiom' }); assert(Array.isArray(r.data.stages) && r.data.stages.length === 0, 'idiom has no stages', r.data.stages)
  r = await call('g1', 'game.levelList', { gameType: 'poetry' }); assert(r.data.achievement.title.name === '学童' && r.data.achievement.title.nextName === '诗童', 'poetry has its own titles', r.data.achievement.title)
  r = await call('g1', 'game.levelList', { gameType: 'xiehouyu' }); assert(r.data.achievement.title.name === '听众', 'xiehouyu has its own titles', r.data.achievement.title)
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
  assert(r.data.puzzle.clue === xiehouyu1.clue && r.data.puzzle.answerLength === xiehouyu1.answer.length && r.data.puzzle.meaning === xiehouyu1.meaning && r.data.puzzle.meaning.length > 0, 'xiehouyu puzzle comes with what it means', r.data.puzzle)
  assert(!('answerPinyin' in r.data.puzzle), '拼音辅助 is off by default: no pinyin in the puzzle', r.data.puzzle)
  // 控制中心: only admins read or flip switches; turning 拼音辅助 on adds one syllable per answer cell at once.
  const savedConfig = S.app_config
  S.app_config = { ...(savedConfig || {}), game_rules: { ...((savedConfig || {}).game_rules || { _id: 'game_rules' }), admin: { openids: ['g1'] } } }
  r = await call('g2', 'admin.switches', {}); assert(r.code === 40300, 'non-admins cannot read the switches', r)
  r = await call('g2', 'admin.updateSwitches', { switches: { pinyinAid: true } }); assert(r.code === 40300, 'non-admins cannot flip a switch', r)
  r = await call('g1', 'admin.switches', {}); assert(r.code === 0 && r.data.switches.pinyinAid === false && r.data.defaults.sprintStaminaCost === 5 && r.data.ranges.sprintStaminaCost.max === 30, 'admin sees 拼音辅助 off by default, with the defaults and ranges', r.data)
  r = await call('g1', 'admin.updateSwitches', { switches: { pinyinAid: 'yes' } }); assert(r.code === 40000, 'a switch only takes true or false', r)
  r = await call('g1', 'admin.updateSwitches', { switches: { unknownSwitch: true } }); assert(r.code === 40000, 'unknown switches are refused', r)
  r = await call('g1', 'admin.updateSwitches', { switches: { sprintStaminaCost: 31 } }); assert(r.code === 40000, 'a number setting must stay in its range (0–30)', r)
  r = await call('g1', 'admin.updateSwitches', { switches: { sprintStaminaCost: true } }); assert(r.code === 40000, 'a number setting takes a whole number', r)
  r = await call('g1', 'admin.updateSwitches', { switches: { sprintStaminaCost: 3 } }); assert(r.code === 0 && r.data.switches.sprintStaminaCost === 3, 'admin sets 口算竞速 stamina', r.data)
  r = await call('g1', 'admin.updateSwitches', { switches: { sprintStaminaCost: 5 } })
  r = await call('g1', 'admin.updateSwitches', { switches: { pinyinAid: true } }); assert(r.code === 0 && r.data.switches.pinyinAid === true, 'admin turns 拼音辅助 on', r.data)
  r = await call('g1', 'game.getLevel', { gameType: 'xiehouyu', levelNo: 1 })
  assert(JSON.stringify(r.data.puzzle.answerPinyin) === JSON.stringify(xiehouyu1.answerPinyin) && r.data.puzzle.answerPinyin.length === xiehouyu1.answer.length, '拼音辅助 on: the puzzle carries one syllable per answer cell', r.data.puzzle)
  r = await call('g1', 'admin.updateSwitches', { switches: { pinyinAid: false } }); assert(r.data.switches.pinyinAid === false, 'admin turns 拼音辅助 off again', r.data)
  r = await call('g1', 'game.getLevel', { gameType: 'xiehouyu', levelNo: 1 }); assert(!('answerPinyin' in r.data.puzzle), 'off again: pinyin gone at once', r.data.puzzle)
  r = await call('g1', 'account.login'); assert(r.data.switches && r.data.switches.sharing === true && r.data.switches.praiseSpeech === false && r.data.switches.typoMarkWrong === true, 'the session carries the switches with their defaults', r.data.switches)
  r = await call('g1', 'admin.updateSwitches', { switches: { sharing: false } }); assert(r.data.switches.sharing === false, 'admin turns sharing off', r.data)
  await call('g1', 'game.startAttempt', { gameType: 'poetry', levelNo: 3 })
  r = await call('g1', 'rescue.create', { gameType: 'poetry', levelNo: 3 }); assert(r.code === 40300, 'sharing off: no new 求助 can be started', r)
  r = await call('g1', 'admin.updateSwitches', { switches: { sharing: true } }); assert(r.data.switches.sharing === true, 'admin turns sharing back on', r.data)
  S.app_config = savedConfig
  r = await call('g1', 'game.submit', { gameType: 'xiehouyu', levelNo: 1, answer: xiehouyu1.answer }); assert(r.data.correct && r.data.solution.riddle === xiehouyu1.riddle && 'note' in r.data.solution, 'xiehouyu solution', r.data.solution)
  // 汉字闯关: four choices, the kind of question decides how the clue is shown, two wrong answers allowed.
  r = await call('g1', 'game.startAttempt', { gameType: 'hanzi', levelNo: 1 })
  const hanzi1 = hanziLevels[0]
  assert(r.code === 0 && r.data.puzzle.board.length === 4 && r.data.puzzle.kind === hanzi1.kind && r.data.puzzle.prompt === hanzi1.prompt && !r.data.puzzle.answer && r.data.attempt.attemptsLeft === 2, 'hanzi puzzle: 4 choices, its kind and prompt, 2 tries', r.data)
  r = await call('g1', 'game.useHint', { gameType: 'hanzi', levelNo: 1 })
  assert(r.code === 0 && r.data.eliminated.length === 2 && !r.data.eliminated.includes(hanzi1.board.indexOf(hanzi1.answer)), 'a hint removes two wrong choices', r.data)
  r = await call('g1', 'game.submit', { gameType: 'hanzi', levelNo: 1, answer: hanzi1.answer })
  assert(r.data.correct && r.data.solution.char === hanzi1.char && r.data.solution.pinyin === hanzi1.pinyin && 'word' in r.data.solution, 'hanzi solution shows the character, its pinyin and a word', r.data.solution)
  r = await call('g1', 'game.levelList', { gameType: 'hanzi' }); assert(r.code === 0 && r.data.achievement.title.name === '识字娃娃', 'hanzi has its own titles', r.data.achievement && r.data.achievement.title)
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
  r = await call('g1', 'game.levelList', { gameType: 'poetry' }); assert(r.data.achievement.title.nextName === '诗童', 'appended poetry title config accepted', r.data.achievement.title)
  S.progress['g1_poetry'].solved = Array.from({ length: 500 }, (_, i) => i + 1)
  r = await call('g1', 'game.levelList', { gameType: 'poetry' }); assert(r.data.achievement.title.name === '诗圣' && r.data.achievement.title.nextName === '诗神', 'poetry title extension works', r.data.achievement.title)
  S.app_config = { game_rules: { _id: 'game_rules', titles: [...DEFAULT_RULES.titles.idiom] } }
  r = await call('g1', 'game.levelList', { gameType: 'poetry' }); assert(r.data.achievement.title.name === '诗圣' && r.data.achievement.title.nextName === null, 'legacy array titles config falls back to baselines', r.data.achievement.title)
  S.app_config = {}
  // typo game: eliminate-style hints
  S.app_config = {}
  await call('t1', 'account.login')
  const typo1 = typoLevels[0]
  r = await call('t1', 'game.startAttempt', { gameType: 'typo', levelNo: 1 })
  assert(r.code === 0 && r.data.puzzle.clue === typo1.clue && r.data.puzzle.board.length === 8 && r.data.puzzle.answerLength === 1 && r.data.puzzle.wrongPosition === typo1.wrongPosition, 'typo puzzle shows the wrong idiom and 8 candidates', r.data.puzzle)
  // 标出错字 off (控制中心): the puzzle no longer says where the wrong character is; answers and hints work the same.
  S.app_config = { ...(S.app_config || {}), switches: { _id: 'switches', typoMarkWrong: false } }
  let markCheck = await call('t1', 'game.getLevel', { gameType: 'typo', levelNo: 1 })
  assert(markCheck.code === 0 && !('wrongPosition' in markCheck.data.puzzle) && markCheck.data.puzzle.clue === typo1.clue && markCheck.data.puzzle.board.length === 8, '标出错字 off: the wrong character is not marked', markCheck.data.puzzle)
  delete S.app_config.switches
  markCheck = await call('t1', 'game.getLevel', { gameType: 'typo', levelNo: 1 }); assert(markCheck.data.puzzle.wrongPosition === typo1.wrongPosition, '标出错字 on by default', markCheck.data.puzzle)
  // Children see 12 of the 24 stored characters: every answer character (repeats too) plus the first distractors.
  const { shownBoardOf } = require(path.join(__dirname, '..', 'cloudfunctions', 'api', 'lib', 'games'))
  const isInOrder = (shown, board) => { let cursor = 0; return shown.every((char) => { cursor = board.indexOf(char, cursor) + 1; return cursor > 0 }) }
  const countOf = (list, char) => list.filter((item) => item === char).length
  const boardLevels = [...levels, ...poetryLevels, ...xiehouyuLevels]
  const shownBoards = boardLevels.map((level) => ({ level, shown: shownBoardOf(level) }))
  assert(shownBoards.every(({ shown }) => shown.length === 12), 'every 24-character board is shown as 12', null)
  assert(shownBoards.every(({ level, shown }) => level.answer.split('').every((char) => countOf(shown, char) >= countOf(level.answer.split(''), char))), 'the shown board keeps every answer character, repeats included', shownBoards.find(({ level, shown }) => !level.answer.split('').every((char) => shown.includes(char))))
  assert(shownBoards.every(({ level, shown }) => isInOrder(shown, level.board)) && JSON.stringify(shownBoardOf(levels[0])) === JSON.stringify(shownBoardOf(levels[0])), 'the shown board keeps the stored order and is the same every time', null)
  assert(shownBoardOf(typoLevels[0]).length === 8, 'typo boards (8) are shown as they are', null)
  assert(r.data.maxHints === 4 && r.data.puzzle.eliminated.length === 0 && r.data.puzzle.revealed.length === 0 && r.data.puzzle.answer === undefined, 'typo hints are eliminations, answer hidden', r.data)
  assert(r.data.puzzle.clueHint === typo1.clueHint, 'primary-school typo level carries the explanation hint', r.data.puzzle.clueHint)
  let eliminated = []
  for (let hint = 1; hint <= 3; hint++) {
    r = await call('t1', 'game.useHint', { gameType: 'typo', levelNo: 1 })
    eliminated = r.data.eliminated
    assert(r.code === 0 && eliminated.length === hint * 2 && eliminated.every((index) => typo1.board[index] !== typo1.answer) && r.data.revealed.length === 0, `typo hint ${hint} eliminates two wrong candidates`, r.data)
  }
  r = await call('t1', 'game.useHint', { gameType: 'typo', levelNo: 1 }); eliminated = r.data.eliminated
  assert(r.code === 0 && eliminated.length === 7 && eliminated.every((index) => typo1.board[index] !== typo1.answer), 'by default the 4th hint removes every wrong choice, only the answer is left', r.data)
  r = await call('t1', 'game.useHint', { gameType: 'typo', levelNo: 1 }); assert(r.code === 40005, 'nothing left to eliminate', r)
  r = await call('t1', 'game.getLevel', { gameType: 'typo', levelNo: 1 }); assert(r.data.puzzle.eliminated.join() === eliminated.join(), 'eliminations persist', r.data.puzzle.eliminated)
  const wrongPick = typo1.board.find((char) => char !== typo1.answer)
  r = await call('t1', 'game.submit', { gameType: 'typo', levelNo: 1, answer: wrongPick })
  assert(r.data.correct === false && r.data.attempt.failed && r.data.attempt.maxWrongAttempts === 1, 'typo fails after one wrong pick (per-game rule)', r.data)
  r = await call('t1', 'game.startAttempt', { gameType: 'typo', levelNo: 1 }); assert(r.data.attempt.attemptsLeft === 1 && r.data.puzzle.eliminated.join() === eliminated.join(), 'retry keeps eliminations', r.data)
  r = await call('t1', 'game.submit', { gameType: 'typo', levelNo: 1, answer: typo1.answer })
  assert(r.data.correct && r.data.solution.idiom === typo1.idiom && r.data.solution.wrongChar === typo1.wrongChar && r.data.solution.explanation, 'typo solution shows the corrected idiom', r.data.solution)
  r = await call('t1', 'game.levelList', { gameType: 'typo' }); assert(r.data.achievement.title.name === '书童', 'typo titles', r.data.achievement.title)
  // No set number of hints per level. By default hints may reveal the whole answer (they are the player's items);
  // with 提示不能直接给出答案 on (控制中心) the last character is left to the player.
  await call('hl', 'account.login')
  await call('hl', 'game.levelList', { gameType: 'xiehouyu' })
  const longLevels = xiehouyuLevels.filter((level) => level.levelNo <= LOADED_LEVEL_COUNT && level.answer.length >= 5)
  const [longLevel, otherLongLevel] = longLevels
  S.progress.hl_xiehouyu.currentLevel = Math.max(longLevel.levelNo, otherLongLevel.levelNo)
  S.users.hl.items.hint = 20
  await call('hl', 'game.startAttempt', { gameType: 'xiehouyu', levelNo: longLevel.levelNo })
  const hintResults = []
  for (let index = 0; index <= longLevel.answer.length; index += 1) hintResults.push(await call('hl', 'game.useHint', { gameType: 'xiehouyu', levelNo: longLevel.levelNo }))
  const lastAllowed = hintResults[longLevel.answer.length - 1]
  assert(lastAllowed.code === 0 && lastAllowed.data.revealed.join('') === longLevel.answer && lastAllowed.data.maxHints === longLevel.answer.length, 'by default hints can reveal every character of the answer', hintResults.map((result) => result.code))
  assert(hintResults[longLevel.answer.length].code === 40005 && S.users.hl.items.hint === 20 - longLevel.answer.length, 'past the whole answer a hint is refused and costs nothing', hintResults[longLevel.answer.length])
  r = await call('hl', 'game.submit', { gameType: 'xiehouyu', levelNo: longLevel.levelNo, answer: longLevel.answer }); assert(r.data.correct, 'a level fully revealed by hints can be passed', r.data)
  const savedSwitches = S.app_config && S.app_config.switches
  S.app_config = { ...(S.app_config || {}), switches: { _id: 'switches', hintKeepLastStep: true } }
  await call('hl', 'game.startAttempt', { gameType: 'xiehouyu', levelNo: otherLongLevel.levelNo })
  const guarded = []
  for (let index = 0; index < otherLongLevel.answer.length; index += 1) guarded.push(await call('hl', 'game.useHint', { gameType: 'xiehouyu', levelNo: otherLongLevel.levelNo }))
  assert(guarded.slice(0, -1).every((result) => result.code === 0) && guarded[guarded.length - 1].code === 40005 && guarded[guarded.length - 2].data.maxHints === otherLongLevel.answer.length - 1, '提示不能直接给出答案 on: the last character is left to the player', guarded.map((result) => result.code))
  if (savedSwitches) S.app_config.switches = savedSwitches
  else delete S.app_config.switches
  // 口算闯关: 10 questions made in the cloud, judged one at a time; stamina, chances, hints, titles and the leaderboard
  const mathChallenge = require(path.join(__dirname, '..', 'cloudfunctions', 'api', 'lib', 'math-challenge'))
  await call('mq', 'account.login')
  r = await call('mq', 'math.level', { levelNo: 1 })
  const firstQuestions = mathChallenge.levelQuestions(1)
  assert(r.code === 0 && r.data.questions.length === 10 && r.data.questions.every((question) => !('answer' in question) && !('equation' in question)) && r.data.stage === '10 以内分与合' && r.data.total === 999, 'a level is 10 questions without their answers', r.data)
  r = await call('mq', 'math.level', { levelNo: 2 }); assert(r.code === 40011 || r.code !== 0, 'later levels stay locked', r)
  r = await call('mq', 'math.answer', { levelNo: 1, index: 0, answer: firstQuestions[0].answer }); assert(r.code === 40010, 'answering needs a started attempt', r)
  const mathStamina = S.users.mq.items.stamina
  r = await call('mq', 'math.start', { levelNo: 1 }); assert(r.code === 0 && r.data.items.stamina === mathStamina - 1 && r.data.attempt.attemptsLeft === 3 && r.data.index === 0, 'starting costs stamina, 3 chances', r.data)
  r = await call('mq', 'math.start', { levelNo: 1 }); assert(r.code === 0 && S.users.mq.items.stamina === mathStamina - 1, 'resuming a running attempt is free', r.data)
  r = await call('mq', 'math.answer', { levelNo: 1, index: 3, answer: '1' }); assert(r.code === 40000, 'only the current question can be answered', r)
  r = await call('mq', 'math.answer', { levelNo: 1, index: 0, answer: String(Number(firstQuestions[0].answer) + 1) })
  assert(r.code === 0 && !r.data.correct && r.data.index === 0 && r.data.attempt.attemptsLeft === 2, 'a wrong answer costs a chance and stays on the question', r.data)
  const mathHints = S.users.mq.items.hint
  r = await call('mq', 'math.hint', { levelNo: 1 }); assert(r.code === 0 && r.data.index === 0 && r.data.answer === firstQuestions[0].answer && S.users.mq.items.hint === mathHints - 1, 'a hint shows the current answer for one hint item', r.data)
  r = await call('mq', 'math.hint', { levelNo: 1 }); assert(r.code === 0 && S.users.mq.items.hint === mathHints - 1, 'the same question shown again costs nothing', r.data)
  r = await call('mq', 'math.level', { levelNo: 1 }); assert(r.data.shownAnswers[0] === firstQuestions[0].answer && Object.keys(r.data.shownAnswers).length === 1, 'a shown answer survives a reload', r.data.shownAnswers)
  for (let index = 0; index < 9; index += 1) {
    r = await call('mq', 'math.answer', { levelNo: 1, index, answer: firstQuestions[index].answer })
    assert(r.code === 0 && r.data.correct && r.data.index === index + 1 && !r.data.passed, `right answer ${index + 1} moves on`, r.data)
  }
  r = await call('mq', 'math.answer', { levelNo: 1, index: 9, answer: firstQuestions[9].answer })
  assert(r.code === 0 && r.data.passed && r.data.nextLevelNo === 2 && r.data.achievement.solvedCount === 1 && r.data.achievement.title.name === '口算小兵', 'the 10th right answer passes the level', r.data)
  r = await call('mq', 'math.level', { levelNo: 1 }); assert(r.data.solved && Object.keys(r.data.shownAnswers).length === 10, 'a passed level shows every answer for review', r.data)
  r = await call('mq', 'game.overview'); assert(r.data.games.find((summary) => summary.gameType === 'math').lastSolvedAt > 0 && r.data.games.find((summary) => summary.gameType === 'idiom').lastSolvedAt === 0, 'the overview says when each game was last played (the lobby picks from it)', r.data.games.map((summary) => [summary.gameType, summary.lastSolvedAt]))
  r = await call('mq', 'math.start', { levelNo: 1 }); assert(r.code === 40008 || r.code !== 0, 'a passed level cannot be started again', r)
  r = await call('mq', 'game.levelList', { gameType: 'math' }); assert(r.code === 0 && r.data.total === 999 && r.data.currentLevel === 2 && r.data.stages.length === 10 && r.data.stages[9].name === '全能挑战', 'the levels page sees 999 levels in 10 stages', r.data)
  r = await call('mq', 'leaderboard.list', { gameType: 'math' }); assert(r.code === 0 && r.data.entries.some((entry) => entry.solvedCount === 1), '口算闯关 has its own leaderboard', r.data)
  r = await call('mq', 'game.getLevel', { gameType: 'math', levelNo: 2 }); assert(r.code === 40000, 'the character-board handlers refuse 口算闯关', r)
  await call('mq', 'math.start', { levelNo: 2 })
  const secondQuestions = mathChallenge.levelQuestions(2)
  for (let wrong = 0; wrong < 3; wrong += 1) r = await call('mq', 'math.answer', { levelNo: 2, index: 0, answer: String(Number(secondQuestions[0].answer) + 1) })
  assert(r.data.attempt.failed && !r.data.attempt.active, 'three wrong answers end the attempt', r.data.attempt)
  r = await call('mq', 'math.answer', { levelNo: 2, index: 0, answer: secondQuestions[0].answer }); assert(r.code === 40010, 'a failed attempt has to be started again', r)
  // 口算竞速: stamina from 控制中心 (default 5), 60 seconds, score = right − wrong, weekly board unless switched off
  await call('sp1', 'account.login'); await call('sp2', 'account.login')
  r = await call('sp1', 'sprint.islands', {})
  assert(r.code === 0 && r.data.islands.length === 5 && r.data.staminaCost === 5 && r.data.weekly === true && r.data.seconds === 60 && r.data.islands.every((island) => island.best === null), 'five islands, 5 stamina a run, weekly board', r.data)
  r = await call('sp1', 'sprint.start', { islandId: 'nowhere' }); assert(r.code === 40000, 'an unknown island is refused', r)
  const sprintStamina = S.users.sp1.items.stamina
  r = await call('sp1', 'sprint.start', { islandId: 'make-ten' })
  const sprintRun = r.data
  assert(r.code === 0 && S.users.sp1.items.stamina === sprintStamina - 5 && sprintRun.questions.length === 150 && sprintRun.seconds === 60, 'a run costs 5 stamina and brings a paper', { stamina: S.users.sp1.items.stamina, size: sprintRun.questions.length })
  const playRun = (run, rightCount, wrongCount) => run.questions.slice(0, rightCount + wrongCount).map((question, index) => ({ index, answer: index < rightCount ? question.answer : `${question.answer}9` }))
  // A run counts only when handed in after the 60 seconds (the real page waits for the clock): age it.
  const playFullMinute = (openid) => { S.users[openid].sprintRun.startedAt -= 60 * 1000 }
  r = await call('sp1', 'sprint.finish', { runId: sprintRun.runId, answers: [{ index: 1, answer: '3' }] }); assert(r.code === 40000, 'answers must start from the first question, in order', r)
  r = await call('sp1', 'sprint.finish', { runId: sprintRun.runId, answers: sprintRun.questions.slice(0, 40).map((question, index) => ({ index, answer: question.answer })) })
  assert(r.code === 0 && r.data.counted === false, 'handing in the answers straight away is not counted (a garbled hand-in before it kept the run open)', r.data)
  r = await call('sp1', 'sprint.start', { islandId: 'make-ten' })
  S.users.sp1.sprintRun.startedAt -= 10 * 1000
  r = await call('sp1', 'sprint.finish', { runId: S.users.sp1.sprintRun.runId, answers: sprintRun.questions.slice(0, 150).map((question, index) => ({ index, answer: question.answer })) })
  assert(r.code === 0 && r.data.counted === false, 'the whole paper in 10 seconds is too fast to count', r.data)
  r = await call('sp1', 'sprint.start', { islandId: 'make-ten' })
  const secondRun = r.data
  r = await call('sp1', 'sprint.finish', { runId: sprintRun.runId, answers: [] }); assert(r.code === 40000, 'an old run cannot be handed in once a new one started', r)
  playFullMinute('sp1')
  r = await call('sp1', 'sprint.finish', { runId: secondRun.runId, answers: playRun(secondRun, 20, 3) })
  assert(r.code === 0 && r.data.counted && r.data.score === 17 && r.data.correct === 20 && r.data.wrong === 3 && r.data.isNewBest && r.data.rank === 1, 'score is right minus wrong', r.data)
  r = await call('sp1', 'sprint.finish', { runId: secondRun.runId, answers: [] }); assert(r.code === 40000, 'a run is handed in once', r)
  await call('sp2', 'sprint.start', { islandId: 'make-ten' })
  const otherRun = S.users.sp2.sprintRun
  const otherPaper = mathChallenge.sprintPaper('make-ten', otherRun.runId)
  playFullMinute('sp2')
  r = await call('sp2', 'sprint.finish', { runId: otherRun.runId, answers: otherPaper.slice(0, 18).map((question, index) => ({ index, answer: question.answer })).concat([{ index: 18, answer: 'x' }]) })
  assert(r.data.score === 17 && r.data.wrong === 1 && r.data.rank === 1, 'same score with fewer wrong answers ranks higher', r.data)
  r = await call('sp1', 'leaderboard.summary', {})
  assert(r.code === 0 && r.data.sprints.math.weekly && r.data.sprints.math.played === 1 && r.data.sprints.math.best.islandId === 'make-ten' && r.data.sprints.math.best.score === 17 && r.data.sprints.math.best.rank === 2 && r.data.sprints.chinese.played === 0, 'the leaderboard card shows the best island and its rank', r.data.sprints)
  r = await call('sp3', 'leaderboard.summary', {}); assert(r.code === 0 && r.data.sprints.math.played === 0 && r.data.sprints.math.best === null, 'no sprint played: no best on the card', r.data.sprints)
  r = await call('sp1', 'sprint.board', { islandId: 'make-ten' })
  assert(r.code === 0 && r.data.weekly && r.data.entries.length === 2 && r.data.entries[0].wrong === 1 && r.data.entries[1].isMe && r.data.me.rank === 2 && r.data.me.score === 17, 'the board ranks score, then fewer wrong', r.data)
  await call('sp1', 'sprint.start', { islandId: 'make-ten' })
  const worseRun = S.users.sp1.sprintRun
  playFullMinute('sp1')
  r = await call('sp1', 'sprint.finish', { runId: worseRun.runId, answers: [{ index: 0, answer: 'x' }] })
  assert(r.data.score === 0 && !r.data.isNewBest && r.data.best === 17, 'a worse run keeps the best; the score never goes below 0', r.data)
  await call('sp1', 'sprint.start', { islandId: 'hundred' })
  S.users.sp1.sprintRun.startedAt -= 70 * 1000
  r = await call('sp1', 'sprint.finish', { runId: S.users.sp1.sprintRun.runId, answers: [] }); assert(r.code === 0 && r.data.counted === false, 'a run handed in after 60 seconds (plus grace) is not counted', r.data)
  S.app_config = { ...(S.app_config || {}), switches: { _id: 'switches', sprintWeeklyReset: false, sprintStaminaCost: 2 } }
  const sprintStamina2 = S.users.sp1.items.stamina
  await call('sp1', 'sprint.start', { islandId: 'make-ten' }); assert(S.users.sp1.items.stamina === sprintStamina2 - 2, '控制中心 sets the stamina a run costs', S.users.sp1.items.stamina)
  r = await call('sp1', 'sprint.board', { islandId: 'make-ten' }); assert(r.data.weekly === false && r.data.entries.length === 2, 'weekly reset off: the all-time board (kept all along) is shown', r.data)
  delete S.app_config.switches
  // 识字竞速: the same rules on the 汉字闯关 questions, one board per grade; no hints, no friends
  await call('hz1', 'account.login')
  r = await call('hz1', 'sprint.islands', { subject: 'chinese' })
  assert(r.code === 0 && r.data.subject === 'chinese' && r.data.islands.map((track) => track.id).join() === 'hanzi-grade1,hanzi-grade2' && r.data.islands[0].scope && r.data.islands.every((track) => track.best === null), '识字竞速 has a track per grade', r.data)
  r = await call('hz1', 'sprint.islands', { subject: 'english' }); assert(r.code === 40000, 'an unknown subject is refused', r)
  r = await call('hz1', 'sprint.start', { islandId: 'hanzi-grade1' })
  const hanziRun = r.data
  const hanziPool = require(path.join(API_ROOT, 'data', 'hanzi-sprint-pool.json'))
  const firstGradeChars = new Set(hanziPool['一年级'].map((question) => question[4]))
  assert(r.code === 0 && hanziRun.questions.length === 150 && hanziRun.questions.every((question) => question.type === 'hanzi' && question.choices.length === 4 && question.choices.includes(question.answer) && question.prompt && question.clue && firstGradeChars.has(question.answer)), 'a 识字 run: 150 four-choice questions of the grade, with answers', hanziRun.questions.slice(0, 2))
  assert(new Set(hanziRun.questions.map((question) => `${question.prompt}${question.clue}${question.answer}`)).size === 150, 'no question twice in a run', null)
  playFullMinute('hz1')
  r = await call('hz1', 'sprint.finish', { runId: hanziRun.runId, answers: hanziRun.questions.slice(0, 30).map((question, index) => ({ index, answer: index < 25 ? question.answer : question.choices.find((choice) => choice !== question.answer) })) })
  assert(r.code === 0 && r.data.counted && r.data.score === 20 && r.data.correct === 25 && r.data.wrong === 5 && r.data.rank === 1, '识字 score is right minus wrong too', r.data)
  r = await call('hz1', 'sprint.board', { islandId: 'hanzi-grade1' }); assert(r.code === 0 && r.data.islandName === '一年级识字' && r.data.entries[0].isMe, 'each grade has its own board', r.data)
  r = await call('hz1', 'sprint.board', { islandId: 'make-ten' }); assert(!r.data.entries.some((entry) => entry.isMe), 'a 识字 score is not on the 口算 boards', r.data)
  r = await call('hz1', 'leaderboard.summary', {}); assert(r.data.sprints.chinese.best.islandName === '一年级识字' && r.data.sprints.chinese.best.score === 20 && r.data.sprints.math.played === 0, 'the 识字竞速 card has its own best', r.data.sprints)
  // per-game level rules
  S.app_config = {}
  await call('p1', 'account.login')
  r = await call('p1', 'game.startAttempt', { gameType: 'idiom', levelNo: 1 }); assert(r.data.attempt.maxWrongAttempts === 3, 'idiom keeps the shared 3 wrong attempts', r.data.attempt)
  S.app_config = { game_rules: { _id: 'game_rules', levelByGame: { poetry: { staminaCost: 2 }, typo: { maxWrongAttempts: 2 } } } }
  const p1Stamina = S.users.p1.items.stamina
  r = await call('p1', 'game.startAttempt', { gameType: 'poetry', levelNo: 1 })
  assert(r.data.items.stamina === p1Stamina - 2 && r.data.staminaCost === 2 && r.data.maxHints === poetryLevels[0].answer.length, 'poetry override: stamina cost 2; hints can reveal the whole answer by default', r.data)
  r = await call('p1', 'game.startAttempt', { gameType: 'typo', levelNo: 1 }); assert(r.data.attempt.maxWrongAttempts === 2, 'configured typo override replaces the default', r.data.attempt)
  S.app_config = { game_rules: { _id: 'game_rules', levelByGame: { typo: { maxWrongAttempts: 0 }, chess: { maxHints: 9 } } } }
  S.app_config.game_rules.signupItems = { hint: 6 }
  r = await call('p1', 'account.login')
  assert(JSON.stringify(r.data.rules.levelByGame) === '{"typo":{"maxWrongAttempts":1},"hanzi":{"maxWrongAttempts":2}}', 'invalid override falls back to default, unknown game dropped, unconfigured games keep their default', r.data.rules.levelByGame)
  await call('p2', 'account.login'); assert(S.users.p2.items.hint === 6, 'one bad override does not discard the rest of the config', S.users.p2.items)
  S.app_config = {}
  // overview: one call for hall and mine
  S.app_config = {}
  r = await call('o1', 'game.overview', {})
  assert(r.code === 0 && r.data.session.isNewUser && r.data.session.items.stamina === 50 && r.data.games.length === ALL_GAME_TYPES.length, 'overview returns session and every game', r.data && r.data.games && r.data.games.map((g) => g.gameType))
  assert(r.data.games.every((g) => g.total === (g.gameType === 'math' ? 999 : LOADED_LEVEL_COUNT) && g.solvedCount === 0 && g.achievement.title.name), 'overview game summaries (口算闯关 has 999 levels made on demand)', r.data.games.find((g) => g.total !== LOADED_LEVEL_COUNT))
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
  await call('k1', 'account.login'); await call('k1', 'game.levelList', { gameType: 'idiom' })
  S.progress['k1_idiom'].solved = Array.from({ length: 30 }, (_, i) => i + 1)
  S.progress['k1_idiom'].milestoneClaimedSolvedCount = 40
  r = await call('k1', 'game.levelList', { gameType: 'idiom' })
  assert(r.data.achievement.milestone.nextChestNo === 5 && r.data.achievement.milestone.nextChestIsBig && r.data.achievement.milestone.nextChestRewards[0].amount === 36, 'next chest preview shows the big chest', r.data.achievement.milestone)
  S.progress['k1_idiom'].solved = Array.from({ length: 50 }, (_, i) => i + 1)
  r = await call('k1', 'chests.open', { all: true })
  assert(r.data.chests.length === 1 && r.data.chests[0].isBig && r.data.rewards.find((x) => x.type === 'stamina').amount === 36 && r.data.rewards.find((x) => x.type === 'hint').amount === 1, 'fifth chest doubles stamina; hints stay 1 before level 110', r.data)
  const { chestRewards } = require(path.join(API_ROOT, 'lib', 'achievement'))
  const hintsInChest = (chestNo) => chestRewards(chestNo, DEFAULT_RULES).find((reward) => reward.type === 'hint').amount
  assert([1, 5, 10, 11, 14, 15, 20, 21].map(hintsInChest).join() === '1,1,1,2,2,3,3,2', 'hints: 1 up to level 100, then 2, big chests from the 11th hold 3', [1, 5, 10, 11, 14, 15, 20, 21].map(hintsInChest))
  S.app_config = { game_rules: { _id: 'game_rules', milestone: { rewardRules: { stamina: { base: 20, step: '2' } }, bigChest: { multiplier: 3 } } } }
  S.progress['k1_idiom'].solved = Array.from({ length: 60 }, (_, i) => i + 1)
  r = await call('k1', 'chests.open', { all: true })
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
  const openedCount = (data) => data.chests.reduce((total, chest) => total + chest.count, 0)
  r = await call('p1', 'chests.open', { all: true }); assert(r.code === 40016, 'nothing to claim before earning', r)
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
  r = await call('p1', 'chests.open', { all: true })
  assert(r.code === 0 && openedCount(r.data) === chestsAtCap && r.data.items.stamina === staminaBeforePractice + 15 && r.data.items.hint === hintBeforeClaim + 3, 'claim opens all practice chests at once', r.data)
  r = await call('p1', 'chests.open', { all: true }); assert(r.code === 40016, 'chests claim only once', r)
  assert(Object.values(S.item_logs).some((log) => log.openid === 'p1' && log.reason === 'practice' && log.practiceId === 'math'), 'practice rewards logged (数理乐园)', null)
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
  r = await call('p1', 'chests.open', { all: true })
  assert(r.code === 0 && openedCount(r.data) === 4 && r.data.items.stamina === staminaBeforeKungfu + 20, 'claim multiplication chests: 5 + 5 + 10 stamina', r.data)
  // honors: flowers for practice events + daily first practice, medals unlock from cloud stats, day streaks
  const chinaKey = (timestamp) => new Date(timestamp + 8 * 3600000).toISOString().slice(0, 10).replace(/-/g, '')
  await call('h1', 'account.login')
  const reportH = (payload) => call('h1', 'practice.report', { practiceId: 'arithmetic', tier: 10, solvedDelta: 0, streak: 0, streakRunId: 'h-run', ...payload })
  r = await call('h1', 'practice.honors')
  assert(r.code === 0 && r.data.flowers === 0 && r.data.medalCount === 22 && r.data.unlockedCount === 0 && r.data.groups.length === 4, 'honors start empty with 22 medals in 4 groups (岛主 included)', r.data)
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
  honorsDoc.lastPracticeDate = chinaKey(Date.now() - 2 * 24 * 3600000); honorsDoc.dayStreak = 5; honorsDoc.streakGraceWeek = ''
  r = await call('h1', 'practice.honors'); assert(r.data.dayStreak === 5, 'one missed day: the streak still shows', r.data)
  await call('h1', 'game.levelList', { gameType: 'idiom' })
  r = await call('h1', 'game.startAttempt', { gameType: 'idiom', levelNo: 1 })
  r = await call('h1', 'game.submit', { gameType: 'idiom', levelNo: 1, answer: S.levels.idiom_1.answer })
  assert(r.code === 0 && r.data.correct && S.practice_stats.h1_honors.dayStreak === 6 && S.practice_stats.h1_honors.streakGraceWeek, 'passing a lobby level counts as practising; the missed day is forgiven once a week', S.practice_stats.h1_honors)
  honorsDoc.lastPracticeDate = chinaKey(Date.now() - 2 * 24 * 3600000)
  r = await call('h1', 'practice.honors'); assert(r.data.dayStreak === 0, 'a second missed day in the same week breaks the streak', r.data)
  honorsDoc.lastPracticeDate = chinaKey(Date.now())
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
  S.app_config = { game_rules: { _id: 'game_rules', honors: { flowers: { dailyCap: r.data.honors.todayFlowers + 1 } } } }
  r = await reportH({ solvedDelta: 30, streak: 30, streakRunId: 'h-run-cap' })
  assert(r.data.honors.flowersGained === 1, 'flowers stop at the daily cap', r.data.honors)
  S.app_config = {}
  S.app_config = { game_rules: { _id: 'game_rules', practice: { solvedRewards: [{ every: 0, rewards: [] }], dailyCaps: { stamina: 1 } } } }
  r = await call('p1', 'practice.stats', { practiceId: 'arithmetic' })
  assert(r.data.rewardRules.solvedRewards[0].every === 20 && r.data.rewardRules.dailyCaps.stamina === 1, 'invalid practice override falls back, valid cap applies', r.data.rewardRules)
  S.app_config = {}
  // watch a video to double a free claim: single-use token from today's record, only when videos are on
  await call('d1', 'account.login')
  r = await call('d1', 'account.checkin'); assert(r.code === 0 && r.data.doubleToken === '', 'videos off: no double offer', r.data)
  S.app_config = { game_rules: { _id: 'game_rules', ad: { enabled: true, adUnitId: 'adunit-test' } } }
  await call('d3', 'account.login')
  r = await call('d3', 'account.checkin'); const checkinToken = r.data.doubleToken
  assert(r.code === 0 && /^[0-9a-f]{16}$/.test(checkinToken), 'videos on: checking in offers a double', r.data)
  const staminaBeforeDouble = S.users.d3.items.stamina
  r = await call('d3', 'account.claimDoubleReward', { token: checkinToken })
  assert(r.code === 0 && r.data.items.stamina === staminaBeforeDouble + 5 && r.data.rewards.some((reward) => reward.type === 'stamina' && reward.amount === 5), 'double gives the check-in rewards again', r.data)
  r = await call('d3', 'account.claimDoubleReward', { token: checkinToken }); assert(r.code === 40006, 'a double token works once', r)
  r = await call('d1', 'account.claimDoubleReward', { token: 'ffffffffffffffff' }); assert(r.code === 40006, 'unknown token rejected', r)
  r = await call('d1', 'account.claimDoubleReward', { token: '../x' }); assert(r.code === 40000, 'malformed token rejected', r)
  S.progress.d1_idiom = { _id: 'd1_idiom', openid: 'd1', gameType: 'idiom', currentLevel: 11, solved: Array.from({ length: 10 }, (_, i) => i + 1), solvedCount: 10, hintsUsed: {}, attempts: {} }
  r = await call('d1', 'chests.open', { all: true })
  assert(r.code === 0 && r.data.doubleToken && r.data.rewards.length === 2, 'opening level chests offers a double', r.data)
  const hintBeforeChestDouble = S.users.d1.items.hint
  r = await call('d1', 'account.claimDoubleReward', { token: r.data.doubleToken }); assert(r.code === 0 && r.data.items.hint === hintBeforeChestDouble + 1, 'chest double adds the chest rewards again', r.data)
  S.app_config = {}
  // video stats for the admin page
  S.app_config = { game_rules: { _id: 'game_rules', ad: { enabled: true, adUnitId: 'adunit-test' }, admin: { openids: ['v1'] } } }
  await call('v1', 'account.login'); await call('v2', 'account.login')
  const todayAds = () => S.stats_daily[Object.keys(S.stats_daily).filter((id) => id.startsWith('ads_')).sort().pop()]
  const adsBefore = { ...todayAds().views, viewers: todayAds().viewers }
  await call('v1', 'account.grantAdReward', { itemType: 'stamina' })
  await call('v1', 'account.grantAdReward', { itemType: 'hint' })
  await call('v2', 'account.grantAdReward', { itemType: 'stamina' })
  r = await call('v2', 'account.checkin')
  await call('v2', 'account.claimDoubleReward', { token: r.data.doubleToken })
  const adsAfter = todayAds()
  assert(adsAfter.views.stamina === adsBefore.stamina + 2 && adsAfter.views.hint === adsBefore.hint + 1 && adsAfter.views.double === adsBefore.double + 1 && adsAfter.viewers === adsBefore.viewers + 2, 'ad views counted per kind, viewers counted once per person per day', adsAfter)
  r = await call('v1', 'admin.stats', { gameType: 'idiom' })
  assert(r.code === 0 && r.data.adStats.length >= 1 && r.data.adStats[0].views === adsAfter.views.stamina + adsAfter.views.hint + adsAfter.views.double && r.data.adStats[0].viewsPerViewer > 0, 'admin stats include daily video numbers', r.data.adStats)
  S.app_config = {}
  // review fixes: solves are transactional, rescues can't leave a level stuck, reports are idempotent, bad payloads are 4xx
  const startLevel = async (openid, levelNo) => call(openid, 'game.startAttempt', { gameType: 'idiom', levelNo })
  await call('f1', 'account.login'); await call('f2', 'account.login')
  await startLevel('f1', 1)
  r = await call('f1', 'game.submit', { gameType: 'idiom', levelNo: 1, answer: levels[0].answer })
  assert(r.data.correct && S.progress.f1_idiom.solvedCount === 1 && S.progress.f1_idiom.solved.length === 1 && S.progress.f1_idiom.lastSolvedAt, 'solve writes solvedCount and lastSolvedAt with the solved list', S.progress.f1_idiom)
  S.progress.f1_idiom.solvedCount = 0
  await call('f1', 'game.overview')
  assert(S.progress.f1_idiom.solvedCount === 1, 'a drifted solvedCount is repaired when the lobby loads', S.progress.f1_idiom)
  // requester solved it alone but the rescue stayed open: the helper is told so and the daily help is not used up
  await startLevel('f1', 2)
  r = await call('f1', 'rescue.create', { gameType: 'idiom', levelNo: 2 }); const openRescueId = r.data.rescueId
  S.progress.f1_idiom.solved.push(2); S.progress.f1_idiom.solvedCount = 2; S.progress.f1_idiom.currentLevel = 3
  r = await call('f2', 'rescue.answer', { rescueId: openRescueId, answer: levels[1].answer })
  const pairAfter = Object.values(S.rescue_help_pairs).find((pair) => pair.requesterOpenid === 'f1' && pair.helperOpenid === 'f2')
  assert(r.code === 40008 && r.message.includes('自己解开') && S.rescues[openRescueId].status === 'closedByRequester' && (!pairAfter || pairAfter.count === 0), 'answering a rescue the requester already solved closes it without using the helper quota', { r, pairAfter })
  // a helper solves: the requester's level is solved in the same transaction
  await startLevel('f1', 3)
  r = await call('f1', 'rescue.create', { gameType: 'idiom', levelNo: 3 }); const helpRescueId = r.data.rescueId
  r = await call('f2', 'rescue.answer', { rescueId: helpRescueId, answer: levels[2].answer })
  assert(r.data.correct && S.progress.f1_idiom.solved.includes(3) && S.progress.f1_idiom.solvedCount === 3, 'helper solve marks the level and count together', S.progress.f1_idiom)
  // repair: a rescue marked solved while the level stayed locked (written by the old code) heals on the next lobby load
  await startLevel('f1', 4)
  r = await call('f1', 'rescue.create', { gameType: 'idiom', levelNo: 4 }); const stuckRescueId = r.data.rescueId
  Object.assign(S.rescues[stuckRescueId], { status: 'solved', helperOpenid: 'f2', helperName: '好友', noticeSeen: false })
  r = await call('f1', 'game.overview')
  assert(r.data.rescueNotices.some((notice) => notice.levelNo === 4) && S.progress.f1_idiom.solved.includes(4) && S.progress.f1_idiom.solvedCount === 4, 'a stuck solved rescue repairs the level when its notice is shown', S.progress.f1_idiom)
  await startLevel('f1', 5)
  r = await call('f1', 'rescue.create', { gameType: 'idiom', levelNo: 5 }); const stuck2 = r.data.rescueId
  Object.assign(S.rescues[stuck2], { status: 'solved', noticeSeen: true })
  r = await call('f1', 'rescue.create', { gameType: 'idiom', levelNo: 5 })
  assert(r.code === 40004 && S.progress.f1_idiom.solved.includes(5), 'asking again for a stuck level repairs it instead of returning the dead rescue', r)
  // practice reports carry a reportId: a resend is not counted twice
  const sendReport = (reportId, solvedDelta) => call('f1', 'practice.report', { practiceId: 'arithmetic', tier: 10, solvedDelta, streak: 0, streakRunId: 'f-run', reportId })
  r = await sendReport('rep1', 20); const totalAfterFirst = r.data.stats.totalSolved
  r = await sendReport('rep1', 20)
  assert(r.code === 0 && r.data.stats.totalSolved === totalAfterFirst && r.data.newChests.length === 0 && r.data.honors === null, 'a resent report is ignored', r.data)
  r = await sendReport('rep2', 1); assert(r.data.stats.totalSolved === totalAfterFirst + 1, 'a new report still counts', r.data.stats)
  r = await sendReport('bad id!', 1); assert(r.code === 40000, 'malformed reportId rejected', r)
  // payload shapes that used to crash with 500
  r = await main({ action: 'game.getLevel', payload: null }); assert(r.code === 40000, 'null payload is a 400, not a 500', r)
  sdk.testing.actAs('f1')
  r = await main({ action: 'practice.report', payload: { practiceId: 'multiplication', tier: 10, solvedDelta: 1, streak: 0, streakRunId: 'x' } }); assert(r.code === 40000, 'practice report for a practice without tiers is a 400', r)
  // spoken praise clip links
  const clipNames = Array.from({ length: 117 }, (_, index) => `${index.toString(16).padStart(12, '0')}.mp3`)
  r = await call('f1', 'speech.clipUrls', { clipNames })
  assert(r.code === 0 && Object.keys(r.data.urls).length === 117 && r.data.urls[clipNames[116]].includes('speech/000000000074.mp3') && r.data.expiresInSeconds === 86400, 'clip links come back for all 117 clips across batches of 50', r.data && r.data.urls[clipNames[116]])
  r = await call('f1', 'speech.clipUrls', { clipNames: ['../secret.mp3'] }); assert(r.code === 40000, 'clip names outside the pattern are refused', r)
  r = await call('f1', 'speech.clipUrls', { clipNames: [] }); assert(r.code === 40000, 'an empty clip list is refused', r)
  // chest room: every pending chest listed with its contents; open any one, in any order, or all at once
  await call('c1', 'account.login'); await call('c1', 'game.levelList', { gameType: 'idiom' })
  S.progress['c1_idiom'].solved = Array.from({ length: 30 }, (_, i) => i + 1)
  r = await call('c1', 'chests.list')
  const gameChestIds = r.data.chests.filter((chest) => chest.kind === 'game').map((chest) => chest.chestId)
  assert(r.code === 0 && gameChestIds.join() === 'game:idiom:1,game:idiom:2,game:idiom:3' && r.data.chests[2].levelNo === 30 && r.data.chests[2].rewards.length > 0, 'level chests are listed one by one with their contents', r.data)
  r = await call('c1', 'chests.open', { chestIds: ['game:idiom:2'] })
  assert(r.code === 0 && r.data.chests.length === 1 && r.data.chests[0].chestNo === 2 && S.progress.c1_idiom.milestoneClaimedSolvedCount === 0 && S.progress.c1_idiom.milestoneOpenedChestNos.join() === '2', 'a later chest can be opened first', r.data)
  r = await call('c1', 'game.levelList', { gameType: 'idiom' }); assert(r.data.achievement.milestone.pendingChests === 2, 'the opened chest leaves the pending count', r.data.achievement.milestone)
  r = await call('c1', 'chests.open', { chestIds: ['game:idiom:2'] }); assert(r.code === 40016, 'a chest opens only once', r)
  r = await call('c1', 'chests.open', { chestIds: ['game:idiom:1'] })
  assert(r.code === 0 && S.progress.c1_idiom.milestoneClaimedSolvedCount === 20 && S.progress.c1_idiom.milestoneOpenedChestNos.length === 0, 'filling the gap folds opened chests back into the claimed count', S.progress.c1_idiom)
  r = await call('c1', 'practice.report', { practiceId: 'arithmetic', tier: 10, solvedDelta: 20, streak: 10, streakRunId: 'c-run' })
  S.practice_stats.c1_math.pendingChestCount += 2
  S.practice_stats.c1_math.pendingRewards.stamina += 3
  r = await call('c1', 'chests.list')
  const practiceChests = r.data.chests.filter((chest) => chest.kind === 'practice')
  assert(practiceChests.length === 3 && practiceChests[0].chestId === 'practice:math:earlier' && practiceChests[0].count === 2 && practiceChests[0].rewards[0].amount === 3 && practiceChests[1].source === 'solved', 'practice chests listed one by one; ones saved before the list come as one bundle', practiceChests)
  r = await call('c1', 'chests.open', { chestIds: [practiceChests[2].chestId] })
  assert(r.code === 0 && S.practice_stats.c1_math.pendingChestCount === 3 && S.practice_stats.c1_math.pendingChestList.length === 1, 'opening one practice chest leaves the others', S.practice_stats.c1_math)
  const staminaBeforeAll = S.users.c1.items.stamina
  r = await call('c1', 'chests.open', { all: true })
  assert(r.code === 0 && r.data.chests.length === 3 && S.users.c1.items.stamina > staminaBeforeAll && S.practice_stats.c1_math.pendingChestCount === 0, 'open all opens every game and practice chest', r.data)
  r = await call('c1', 'chests.list'); assert(r.data.chests.length === 0, 'nothing left after opening all', r.data)
  r = await call('c1', 'chests.open', { all: true }); assert(r.code === 40016, 'open all with nothing left is refused', r)
  await call('cl1', 'account.login')
  S.practice_stats.cl1_arithmetic = { _id: 'cl1_arithmetic', openid: 'cl1', practiceId: 'arithmetic', tiers: {}, totalSolved: 40, pendingChestCount: 2, pendingRewards: { stamina: 4, hint: 0 } }
  r = await call('cl1', 'chests.list'); assert(r.data.chests.some((chest) => chest.chestId === 'practice:math:earlier'), 'a legacy 加减运算 record shows its chests', r.data)
  const legacyStamina = S.users.cl1.items.stamina
  r = await call('cl1', 'chests.open', { all: true }); assert(r.code === 0 && S.users.cl1.items.stamina === legacyStamina + 4, 'legacy chests open (the record is moved over first)', r)
  r = await call('c1', 'chests.open', { chestIds: ['game:idiom:abc'] }); assert(r.code === 40000, 'malformed chest id refused', r)
  r = await call('c1', 'chests.open', { chestIds: ['practice:math:a:b'] }); assert(r.code === 40000, 'chest id with extra parts refused', r)
  // cloud image links
  r = await call('f1', 'assets.imageUrls', { imagePaths: ['mascot/happy.png', 'islands/make-ten.png', 'share/default.jpg'] })
  assert(r.code === 0 && r.data.urls['islands/make-ten.png'].includes('images/islands/make-ten.png') && Object.keys(r.data.urls).length === 3 && r.data.expiresInSeconds === 86400, 'image links come back keyed by their path under images/', r.data)
  r = await call('f1', 'assets.imageUrls', { imagePaths: ['../avatars/someone.png'] }); assert(r.code === 40000, 'image paths outside images/ are refused', r)
  r = await call('f1', 'assets.imageUrls', { imagePaths: [] }); assert(r.code === 40000, 'an empty image list is refused', r)
  // one date key per request
  const { dailyDocId } = require(path.join(API_ROOT, 'lib', 'daily'))
  assert(dailyDocId('f1', '20261013') === 'f1_20261013', 'daily records can be addressed by an explicit date key', null)
  // 数理乐园: the old 加减运算 record moves into <openid>_math; units, 小怪兽收容所 (mistake book), old and new parameters
  await call('m1', 'account.login')
  S.practice_stats.m1_arithmetic = {
    _id: 'm1_arithmetic', openid: 'm1', practiceId: 'arithmetic', totalSolved: 57,
    tiers: { within10: { solved: 30, bestStreak: 12 }, within20: { solved: 27, bestStreak: 9 } },
    exams: { within20: { level1: { best: 90, bestSeconds: 150, attempts: 2 } } },
    streakRun: { runId: 'old-run', rewardedStreak: 9 }, pendingChestCount: 2, pendingRewards: { stamina: 4, hint: 0 }, recentReportIds: ['old-report']
  }
  const legacyCopy = JSON.stringify(S.practice_stats.m1_arithmetic)
  r = await call('m1', 'practice.stats', { practiceId: 'math' })
  assert(r.code === 0 && r.data.units['add-sub-10'].solved === 30 && r.data.units['add-sub-20'].exams[0].best === 90 && r.data.units['add-sub-20'].exams[1].unlocked && r.data.totalSolved === 57 && r.data.pendingChestCount === 2, 'before migrating, the old record is read as 数理乐园 units', r.data)
  assert(!S.practice_stats.m1_math, 'reading does not create the new record', null)
  r = await call('m1', 'game.overview')
  assert(r.data.practices.find((summary) => summary.practiceId === 'math').pendingChestCount === 2, 'welfare bag sees old chests before migration', r.data.practices)
  r = await call('m1', 'practice.honors')
  assert(r.data.groups[0].medals.find((medal) => medal.id === 'arith-solved-100').current === 57, 'medal progress counts old answers before migration', null)
  r = await call('m1', 'practice.report', { practiceId: 'math', unitId: 'add-sub-20', solvedDelta: 3, streak: 3, streakRunId: 'new-run', reportId: 'm1-r1' })
  const mathDoc = S.practice_stats.m1_math
  assert(r.code === 0 && mathDoc && mathDoc.units['add-sub-20'].solved === 30 && mathDoc.units['add-sub-10'].bestStreak === 12 && mathDoc.totalSolved === 60 && mathDoc.migratedFrom === 'arithmetic', 'first report migrates the old record and adds to it', mathDoc)
  assert(JSON.stringify(S.practice_stats.m1_arithmetic) === legacyCopy, 'the old record is kept unchanged', null)
  r = await call('m1', 'practice.report', { practiceId: 'math', unitId: 'add-sub-20', solvedDelta: 3, streak: 3, streakRunId: 'old', reportId: 'old-report' })
  assert(r.data.stats.totalSolved === 60, 'report ids remembered before migration still block a resend', r.data.stats)
  r = await call('m1', 'practice.report', { practiceId: 'arithmetic', tier: 100, solvedDelta: 2, streak: 2, streakRunId: 'legacy-page', reportId: 'm1-r2' })
  assert(r.code === 0 && S.practice_stats.m1_math.units['add-sub-100'].solved === 2 && r.data.stats.tiers[100].solved === 2, 'old pages (practiceId arithmetic + tier) write into the new record', r.data.stats.tiers)
  r = await call('m1', 'practice.report', { practiceId: 'math', unitId: 'add-sub-999', solvedDelta: 1, streak: 1, streakRunId: 'x' }); assert(r.code === 40000, 'unknown unit rejected', r)
  r = await call('m1', 'practice.reportExam', { practiceId: 'math', unitId: 'add-sub-10', level: 1, correct: 20, seconds: 60 })
  assert(r.code === 0 && S.practice_stats.m1_math.units['add-sub-10'].exams.level1.best === 100 && S.practice_stats.m1_math.units['add-sub-10'].solved === 30, 'exam scores are kept per unit without touching its answers', S.practice_stats.m1_math.units['add-sub-10'])
  // mistake book
  const mistakeData = { operation: '+', left: 8, right: 5, result: 13, blank: 'result' }
  const reportMistakes = (reportId, extra) => call('m1', 'practice.report', { practiceId: 'math', unitId: 'add-sub-20', solvedDelta: 0, streak: 0, streakRunId: 'mistakes', reportId, ...extra })
  r = await reportMistakes('mk1', { mistakes: [{ key: '8+5:result', data: mistakeData }, { key: '13-6:left', data: { ...mistakeData, operation: '-' } }] })
  assert(r.code === 0 && r.data.stats.units['add-sub-20'].mistakeCount === 2, 'wrong answers go into the unit mistake book', r.data.stats.units['add-sub-20'])
  r = await call('m1', 'practice.mistakes', { practiceId: 'math', unitId: 'add-sub-20' })
  assert(r.code === 0 && r.data.mistakes.length === 2 && r.data.mistakes[0].key === '8+5:result' && r.data.mistakes[0].data.left === 8 && r.data.mistakes[0].correctStreak === 0, 'mistake book can be read back', r.data)
  r = await reportMistakes('mk2', { reviews: [{ key: '8+5:result', correct: true }] })
  assert(r.data.caughtMistakes.length === 0 && r.data.stats.units['add-sub-20'].mistakeCount === 2, 'one right answer is not enough', r.data)
  r = await reportMistakes('mk3', { reviews: [{ key: '8+5:result', correct: false }] })
  r = await reportMistakes('mk4', { reviews: [{ key: '8+5:result', correct: true }] })
  assert(r.data.caughtMistakes.length === 0, 'a wrong review starts the count again', r.data)
  r = await reportMistakes('mk5', { reviews: [{ key: '8+5:result', correct: true }, { key: 'not-there', correct: true }] })
  assert(r.data.caughtMistakes.join() === '8+5:result' && r.data.stats.units['add-sub-20'].mistakeCount === 1, 'two right in a row catches the monster', r.data)
  r = await reportMistakes('mk6', { mistakes: Array.from({ length: 50 }, (_, index) => ({ key: `q${index}`, data: { n: index } })) })
  r = await call('m1', 'practice.mistakes', { practiceId: 'math', unitId: 'add-sub-20' })
  assert(r.data.mistakes.length === 50 && r.data.mistakes[0].key === 'q0' && r.data.mistakes[49].key === 'q49', 'mistake book keeps the newest 50', r.data.mistakes.length)
  r = await reportMistakes('mk6b', { discards: ['q0', 'q1'] })
  assert(r.code === 0 && r.data.caughtMistakes.length === 0 && S.practice_stats.m1_math.units['add-sub-20'].mistakes.length === 48, 'unreadable mistakes are discarded without counting as caught', r.data)
  r = await reportMistakes('mk6c', { discards: ['bad key'] }); assert(r.code === 40000, 'malformed discard rejected', r)
  r = await reportMistakes('mk6d', { mistakes: [{ key: 'q0', data: { n: 0 } }, { key: 'q1', data: { n: 1 } }] })
  r = await reportMistakes('mk7', { mistakes: [{ key: 'bad key with spaces', data: {} }] }); assert(r.code === 40000, 'malformed mistake rejected', r)
  r = await reportMistakes('mk8', { mistakes: [{ key: 'big', data: { text: 'x'.repeat(400) } }] }); assert(r.code === 40000, 'oversized mistake rejected', r)
  r = await call('m1', 'practice.mistakes', { practiceId: 'math', unitId: 'nope' }); assert(r.code === 40000, 'mistakes of an unknown unit rejected', r)
  r = await call('m1', 'practice.report', { practiceId: 'math', unitId: 'division-table', solvedDelta: 3, streak: 3, streakRunId: 'div', reportId: 'div-1', roundStars: 2, mistakes: [{ key: '24/4:result', data: { dividend: 24, divisor: 4, quotient: 6, blank: 'result', kind: 'share', theme: 0 } }] })
  assert(r.code === 0 && S.practice_stats.m1_math.units['division-table'].solved === 3 && S.practice_stats.m1_math.units['division-table'].mistakes[0].key === '24/4:result', '二期 units (表内除法) are accepted with their own mistakes', r)
  r = await call('m1', 'practice.reportExam', { practiceId: 'math', unitId: 'compare', level: 1, correct: 20, seconds: 60 })
  assert(r.code === 0 && r.data.score === 100, '二期 units have exams', r)
  // 每日挑战: 5 汉字 levels picked by date (near the child's level), paid once a day for finishing, flowers on top, a full score earns more
  await call('d1', 'account.login')
  r = await call('d1', 'daily.today', {})
  const firstToday = r.data
  assert(r.code === 0 && r.data.hanzi.length === 5 && r.data.mathCount === 5 && r.data.result === null && r.data.hanzi.every((question) => question.board.length === 4 && question.board.includes(question.answer)), 'today: 5 汉字 questions with answers, nothing done yet', r.data)
  r = await call('d2', 'daily.today', {})
  assert(JSON.stringify(r.data.hanzi.map((question) => question.id)) === JSON.stringify(firstToday.hanzi.map((question) => question.id)), 'children at about the same level get the same questions that day', r.data.hanzi.map((question) => question.id))
  r = await call('d1', 'daily.submit', { dateKey: '20000101', correct: 10, seconds: 60 }); assert(r.code === 40000, "yesterday's challenge cannot be handed in today", r)
  r = await call('d1', 'daily.submit', { dateKey: firstToday.dateKey, correct: 11, seconds: 60 }); assert(r.code === 40000, 'more than 10 correct is refused', r)
  const dailyStaminaBefore = S.users.d1.items.stamina
  r = await call('d1', 'daily.submit', { dateKey: firstToday.dateKey, correct: 10, seconds: 75 })
  assert(r.code === 0 && !r.data.alreadyDone && r.data.items.stamina === dailyStaminaBefore + 5 && r.data.honors.flowerReasons.includes('dailyChallenge') && r.data.honors.flowerReasons.includes('dailyPerfect'), 'finishing pays 5 stamina and flowers, a full score earns extra', r.data)
  r = await call('d1', 'daily.submit', { dateKey: firstToday.dateKey, correct: 10, seconds: 40 })
  assert(r.code === 0 && r.data.alreadyDone && r.data.result.seconds === 75 && S.users.d1.items.stamina === dailyStaminaBefore + 5, 'a second hand-in the same day pays nothing and keeps the first result', r.data)
  r = await call('d1', 'daily.today', {}); assert(r.data.result && r.data.result.correct === 10, 'today shows the finished result', r.data.result)
  r = await call('d1', 'account.login'); assert(r.data.today.dailyChallenge && r.data.today.dailyChallenge.correct === 10, 'the lobby sees today is done', r.data.today)
  await call('d2', 'account.login')
  r = await call('d2', 'daily.submit', { dateKey: firstToday.dateKey, correct: 6, seconds: 120 })
  assert(r.code === 0 && !r.data.honors.flowerReasons.includes('dailyPerfect'), 'no extra flowers without a full score', r.data.honors)
  // 三期: last practised day, monsters caught, daily tallies, 岛主 medals, the weekly report
  const { chinaDateKey } = require(path.join(__dirname, '..', 'cloudfunctions', 'api', 'lib', 'date'))
  const todayKey = chinaDateKey(Date.now())
  const weekReport = (reportId, extra) => call('w1', 'practice.report', { practiceId: 'math', solvedDelta: 0, streak: 0, streakRunId: 'week', reportId, ...extra })
  const splitData = { total: 7, left: 3, right: 4, blank: 'right', theme: 0 }
  r = await weekReport('w-1', { unitId: 'add-sub-10', solvedDelta: 5, roundStars: 3 })
  let wDoc = S.practice_stats.w1_math
  assert(r.code === 0 && wDoc.units['add-sub-10'].lastPracticed === todayKey && wDoc.days[todayKey].solved === 5 && wDoc.days[todayKey].stars === 3, 'a report records the day it was practised and today\'s tally', wDoc.days)
  assert(r.data.stats.units['add-sub-10'].lastPracticed === todayKey, 'stats show when each unit was last practised', r.data.stats.units['add-sub-10'])
  r = await weekReport('w-2', { unitId: 'split-10', solvedDelta: 10, roundStars: 3, mistakes: [{ key: 's7:3:right', data: splitData }] })
  assert(r.code === 0 && r.data.honors.newMedals.some((medal) => medal.id === 'island-counting') && r.data.honors.flowerReasons.includes('islandMaster'), 'three stars on every 数数岛 unit makes the child its 岛主, with flowers', r.data.honors)
  const flowersAfterIsland = r.data.honors.totalFlowers
  r = await weekReport('w-3', { unitId: 'split-10', solvedDelta: 1, roundStars: 3 })
  assert(!r.data.honors.newMedals.length && !r.data.honors.flowerReasons.includes('islandMaster') && r.data.honors.totalFlowers >= flowersAfterIsland, '岛主 is paid once', r.data.honors)
  await weekReport('w-4', { unitId: 'split-10', reviews: [{ key: 's7:3:right', correct: true }] })
  r = await weekReport('w-5', { unitId: 'split-10', reviews: [{ key: 's7:3:right', correct: true }] })
  wDoc = S.practice_stats.w1_math
  assert(r.data.caughtMistakes.length === 1 && wDoc.units['split-10'].caught === 1 && wDoc.days[todayKey].caught === 1, 'caught monsters are counted per unit and per day', wDoc.units['split-10'])
  r = await weekReport('w-6', { unitId: 'compare', solvedDelta: 0, roundStars: 3 })
  assert(S.practice_stats.w1_math.units.compare.lastPracticed === '', 'a report without answers does not count as practising the unit', S.practice_stats.w1_math.units.compare)
  assert(!r.data.honors.newMedals.some((medal) => medal.id === 'island-make-ten'), 'an island needs every unit at three stars', r.data.honors.newMedals)
  const dayKeyAgo = (days) => chinaDateKey(Date.now() - days * 24 * 60 * 60 * 1000)
  S.practice_stats.w1_math.days[dayKeyAgo(7)] = { solved: 9, caught: 0, stars: 0 }
  r = await call('w1', 'practice.weekly', {})
  assert(r.code === 0 && r.data.days.length === 7 && r.data.days.filter((day) => day.isToday).length === 1 && r.data.practicedDays === 1, 'the week has 7 days, today practised', r.data.days)
  assert(r.data.solved === 16 && r.data.lastWeekSolved === 9 && r.data.stars === 9 && r.data.caught === 1, 'weekly totals: answers vs last week, stars, monsters caught', r.data)
  assert(r.data.medals.some((medal) => medal.id === 'island-counting') && r.data.monsters.length === 0, 'weekly report lists this week\'s medals and the monsters still loose', r.data)
  Array.from({ length: 20 }, (_, index) => dayKeyAgo(30 + index)).forEach((key) => { S.practice_stats.w1_math.days[key] = { solved: 1, caught: 0, stars: 0 } })
  await weekReport('w-7', { unitId: 'add-sub-10', solvedDelta: 1 })
  assert(Object.keys(S.practice_stats.w1_math.days).length === 14 && S.practice_stats.w1_math.days[todayKey].solved === 17, 'only the last 14 days are kept', Object.keys(S.practice_stats.w1_math.days).length)
  r = await call('w0', 'practice.weekly', {})
  assert(r.code === 0 && r.data.solved === 0 && r.data.practicedDays === 0 && r.data.medals.length === 0, 'a new player gets an empty week, not an error', r.data)
  // rounds of 10: the best stars a unit ever scored are kept
  const roundReport = (reportId, roundStars) => call('m1', 'practice.report', { practiceId: 'math', unitId: 'add-sub-10', solvedDelta: 0, streak: 0, streakRunId: 'rounds', reportId, roundStars })
  r = await roundReport('st1', 2); assert(r.code === 0 && r.data.stats.units['add-sub-10'].bestStars === 2, 'round stars stored', r.data.stats.units['add-sub-10'])
  r = await roundReport('st2', 1); assert(r.data.stats.units['add-sub-10'].bestStars === 2, 'a worse round keeps the best stars', null)
  r = await roundReport('st3', 3); assert(r.data.stats.units['add-sub-10'].bestStars === 3, 'three stars masters the unit', null)
  r = await roundReport('st4', 4); assert(r.code === 40000, 'more than 3 stars rejected', r)
  // a brand-new player starts with an empty 数理乐园 record
  await call('m2', 'account.login')
  r = await call('m2', 'practice.report', { practiceId: 'math', unitId: 'add-sub-10', solvedDelta: 1, streak: 1, streakRunId: 'n', reportId: 'n1' })
  assert(r.code === 0 && S.practice_stats.m2_math.units['add-sub-10'].solved === 1 && !S.practice_stats.m2_math.migratedFrom, 'new players get a fresh record', S.practice_stats.m2_math)
  // stamina recovery rules, with fixed clocks: one point per 30 minutes, at most 15 per Beijing day
  const { settleStamina } = require(path.join(API_ROOT, 'lib', 'items'))
  const recovery = { enabled: true, intervalMinutes: 30, dailyCap: 15 }
  const beijing = (day, hour, minute = 0) => Date.UTC(2026, 9, day, hour - 8, minute)
  let settled = settleStamina({ anchorAt: beijing(13, 8), recoveredDate: '', recoveredCount: 0 }, recovery, beijing(13, 10, 5))
  assert(settled.recovered === 4 && settled.recoveredCount === 4 && settled.staminaAnchorAt === beijing(13, 10), '2h05m -> 4 points, clock kept at the last tick', settled)
  settled = settleStamina({ anchorAt: beijing(13, 8), recoveredDate: '', recoveredCount: 0 }, recovery, beijing(13, 23))
  assert(settled.recovered === 15 && settled.recoveredCount === 15, 'a whole day stops at 15', settled)
  settled = settleStamina({ anchorAt: settled.staminaAnchorAt, recoveredDate: settled.recoveredDate, recoveredCount: 15 }, recovery, beijing(14, 1))
  assert(settled.recovered === 3 && settled.recoveredCount === 3 && settled.recoveredDate === '2026-10-14', 'after midnight the count restarts (23:30 skipped as capped; 00:00, 00:30, 01:00 count)', settled)
  settled = settleStamina({ anchorAt: beijing(10, 12), recoveredDate: '', recoveredCount: 0 }, recovery, beijing(13, 12))
  assert(settled.recovered === 15 * 3 + 15 && settled.recoveredDate === '2026-10-13', 'three days away: 15 per day (10th afternoon 15, 11th 15, 12th 15, 13th morning 15)', settled)
  settled = settleStamina({ anchorAt: beijing(13, 8), recoveredDate: '', recoveredCount: 0 }, { ...recovery, enabled: false }, beijing(13, 20))
  assert(settled.recovered === 0, 'recovery off gives nothing', settled)
  console.log('logs:', Object.values(S.item_logs).filter((l) => l.openid === 'u1').map((l) => `${l.reason}:${l.itemType}${l.delta > 0 ? '+' : ''}${l.delta}`).join(' '))
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exitCode = failed ? 1 : 0
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
