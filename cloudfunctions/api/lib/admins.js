const { db } = require('./cloud')

// Admins have their own collection: one record per admin, { openid, name } (name only to remember who it is; _id is
// whatever the console generates — it ignores an _id typed in). Filled in the console, never from a file in the repo,
// so importing app_config can never touch them. Openids still listed in game_rules.admin.openids keep working.
const ADMINS = 'admins'

const isListedAdmin = async (openid) => {
  try {
    const { data } = await db.collection(ADMINS).where({ openid }).limit(1).get()
    return data.length > 0
  } catch (error) {
    // No admins collection yet: nobody is listed there.
    return false
  }
}

const isAdmin = async (openid, rules) => rules.admin.openids.includes(openid) || isListedAdmin(openid)

module.exports = { isAdmin }
