const { readDocOrNull } = require('./cloud')

// Admins have their own collection: one record per admin, _id = the openid (add a "name" to remember who it is).
// Filled in the console, never from a file in the repo, so importing app_config can never touch them.
// Openids still listed in the old place (game_rules.admin.openids) keep working.
const ADMINS = 'admins'

const isAdmin = async (openid, rules) => rules.admin.openids.includes(openid) || Boolean(await readDocOrNull(ADMINS, openid))

module.exports = { isAdmin }
