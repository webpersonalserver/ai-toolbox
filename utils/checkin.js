const { account, toastError } = require('./api')
const { updateSession } = require('./session')
const { describeRewards } = require('./items')

// quiet: the caller shows its own reward popup instead of the toast.
const checkinToday = async ({ quiet = false } = {}) => {
  try {
    const result = await account.checkin()
    updateSession({ items: result.items, today: { checkedIn: true } })
    if (!quiet) wx.showToast({ title: `打卡成功，获得${describeRewards(result.rewards)}`, icon: 'none' })
    return result
  } catch (error) {
    toastError(error)
    return null
  }
}

module.exports = { checkinToday }
