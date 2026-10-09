const { account } = require('./api')

let pendingLogin = null

const getSession = () => getApp().globalData.session

// Concurrent callers share one login request; force=true re-reads items so stamina recovery shows up.
const ensureLogin = ({ force = false } = {}) => {
  const cached = getSession()
  if (cached && !force) return Promise.resolve(cached)
  if (!pendingLogin) {
    pendingLogin = account
      .login()
      .then((session) => {
        getApp().globalData.session = session
        return session
      })
      .finally(() => {
        pendingLogin = null
      })
  }
  return pendingLogin
}

const updateSession = (patch) => {
  const session = getSession()
  if (!session) return
  getApp().globalData.session = {
    ...session,
    profile: { ...session.profile, ...(patch.profile || {}) },
    items: patch.items || session.items,
    today: { ...session.today, ...(patch.today || {}) }
  }
}

const setItems = (items) => {
  if (items) updateSession({ items })
}

module.exports = { getSession, ensureLogin, updateSession, setItems }
