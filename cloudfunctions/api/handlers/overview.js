const { loadRules, rulesForGame } = require('../lib/rules')
const { ALL_GAME_TYPES } = require('../lib/games')
const account = require('./account')
const game = require('./game')

const overview = async ({ openid }) => {
  const session = await account.login({ openid })
  const rules = await loadRules()
  const [games, rescueNotices] = await Promise.all([
    Promise.all(ALL_GAME_TYPES.map((gameType) => game.summarizeGame(openid, gameType, rulesForGame(rules, gameType)))),
    game.takeUnseenRescueNotices(openid)
  ])
  return { session, games, rescueNotices }
}

module.exports = { overview }
