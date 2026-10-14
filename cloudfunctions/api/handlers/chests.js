const { ERROR_CODES, BusinessError } = require('../lib/response')
const { loadRules, sumRewardsByType } = require('../lib/rules')
const { ALL_GAME_TYPES } = require('../lib/games')
const { PRACTICE_IDS, toRewardList } = require('../lib/practice-rewards')
const { issueDoubleOffer } = require('../lib/double-reward')
const game = require('./game')
const practice = require('./practice')

// The welfare bag's chest room: every unopened chest (level chests of each game, practice chests), opened one by one
// or all together. A chestId names its owner: "game:<gameType>:<chestNo>" or "practice:<practiceId>:<chestId>".
const CHEST_KINDS = { GAME: 'game', PRACTICE: 'practice' }
const MAX_CHESTS_PER_OPEN = 200
const GAME_CHEST_NO_PATTERN = /^[1-9][0-9]{0,5}$/
const NOTHING_LEFT_CODES = new Set([ERROR_CODES.NO_MILESTONE_TO_CLAIM, ERROR_CODES.NOTHING_TO_CLAIM])

const gameChestView = (gameType, chest) => ({ chestId: `${CHEST_KINDS.GAME}:${gameType}:${chest.chestNo}`, kind: CHEST_KINDS.GAME, ownerId: gameType, count: 1, ...chest })

const practiceChestView = (practiceId, chest) => ({
  ...chest,
  chestId: `${CHEST_KINDS.PRACTICE}:${practiceId}:${chest.chestId}`,
  kind: CHEST_KINDS.PRACTICE,
  ownerId: practiceId
})

const listChests = async (openid) => {
  const [gameChests, practiceChests] = await Promise.all([
    Promise.all(ALL_GAME_TYPES.map(async (gameType) => (await game.pendingGameChests(openid, gameType)).map((chest) => gameChestView(gameType, chest)))),
    Promise.all(PRACTICE_IDS.map(async (practiceId) => (await practice.pendingChestsOfPractice(openid, practiceId)).map((chest) => practiceChestView(practiceId, chest))))
  ])
  return [...gameChests.flat(), ...practiceChests.flat()]
}

const list = async ({ openid }) => ({ chests: await listChests(openid) })

// chestIds -> { "game:idiom": { kind, ownerId, ids: [...] }, ... }; anything malformed is a bad request.
const groupByOwner = (chestIds) => {
  const groups = {}
  chestIds.forEach((chestId) => {
    const [kind, ownerId, id, extra] = typeof chestId === 'string' ? chestId.split(':') : []
    const isGame = kind === CHEST_KINDS.GAME && ALL_GAME_TYPES.includes(ownerId) && GAME_CHEST_NO_PATTERN.test(id || '')
    const isPractice = kind === CHEST_KINDS.PRACTICE && PRACTICE_IDS.includes(ownerId) && practice.CHEST_ID_PATTERN.test(id || '')
    if (extra !== undefined || (!isGame && !isPractice)) throw new BusinessError(ERROR_CODES.BAD_REQUEST, '宝箱参数不正确')
    const key = `${kind}:${ownerId}`
    groups[key] = groups[key] || { kind, ownerId, ids: [] }
    groups[key].ids.push(isGame ? Number(id) : id)
  })
  return Object.values(groups)
}

// One owner at a time (each is its own transaction). A chest someone already opened is skipped, not an error.
const openGroup = async (openid, group) => {
  try {
    if (group.kind === CHEST_KINDS.GAME) {
      const outcome = await game.openGameChests(openid, group.ownerId, group.ids)
      return { chests: outcome.chests.map((chest) => gameChestView(group.ownerId, chest)), deltas: outcome.deltas, items: outcome.items }
    }
    const outcome = await practice.openPracticeChests(openid, group.ownerId, group.ids)
    return { chests: outcome.chests.map((chest) => practiceChestView(group.ownerId, chest)), deltas: outcome.deltas, items: outcome.items }
  } catch (error) {
    if (NOTHING_LEFT_CODES.has(error.code)) return null
    throw error
  }
}

/**
 * Opens the chests in payload.chestIds, or every pending chest with payload.all === true.
 * Returns the opened chests, the summed rewards, the new item counts and one double-reward offer for the lot.
 */
const open = async ({ openid, payload }) => {
  const openAll = payload.all === true
  const { chestIds } = payload
  const isValid = openAll || (Array.isArray(chestIds) && chestIds.length > 0 && chestIds.length <= MAX_CHESTS_PER_OPEN)
  if (!isValid) throw new BusinessError(ERROR_CODES.BAD_REQUEST, '宝箱参数不正确')
  const groups = groupByOwner(openAll ? (await listChests(openid)).map((chest) => chest.chestId) : chestIds)
  const outcomes = []
  for (const group of groups) {
    const outcome = await openGroup(openid, group)
    if (outcome) outcomes.push(outcome)
  }
  if (!outcomes.length) throw new BusinessError(ERROR_CODES.NOTHING_TO_CLAIM, '这些宝箱已经打开过啦')
  const rewards = toRewardList(sumRewardsByType(outcomes.flatMap((outcome) => toRewardList(outcome.deltas))))
  const rules = await loadRules()
  return {
    chests: outcomes.flatMap((outcome) => outcome.chests),
    rewards,
    items: outcomes[outcomes.length - 1].items,
    doubleToken: await issueDoubleOffer(openid, rewards, 'chests', rules)
  }
}

module.exports = { list, open }
