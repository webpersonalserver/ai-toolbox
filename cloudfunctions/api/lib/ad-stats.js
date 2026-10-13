const { db, _ } = require('./cloud')
const { todayInChina } = require('./date')

const AD_STATS_KIND = 'ads'
const AD_VIEW_KINDS = { STAMINA: 'stamina', HINT: 'hint', DOUBLE: 'double' }
const adStatsDocId = (date) => `${AD_STATS_KIND}_${date}`

const ensureAdStatsDoc = async (date) => {
  try {
    await db.collection('stats_daily').doc(adStatsDocId(date)).get()
  } catch (missingError) {
    try {
      await db.collection('stats_daily').add({
        data: { _id: adStatsDocId(date), kind: AD_STATS_KIND, date, views: { stamina: 0, hint: 0, double: 0 }, viewers: 0 }
      })
    } catch (duplicateError) {
      return
    }
  }
}

// Counts one rewarded video for the admin page. Stats must never break a reward, so failures are only logged.
const recordAdView = async (kind, isFirstViewToday) => {
  const date = todayInChina()
  try {
    await ensureAdStatsDoc(date)
    await db.collection('stats_daily').doc(adStatsDocId(date)).update({
      data: { [`views.${kind}`]: _.inc(1), viewers: _.inc(isFirstViewToday ? 1 : 0), updatedAt: db.serverDate() }
    })
  } catch (error) {
    console.error('[ad-stats] record failed', kind, error)
  }
}

const recentAdStats = async (days) => {
  const { data } = await db.collection('stats_daily').where({ kind: AD_STATS_KIND }).orderBy('date', 'desc').limit(days).get()
  return data.map((doc) => {
    const views = doc.views.stamina + doc.views.hint + doc.views.double
    return {
      date: doc.date,
      viewers: doc.viewers,
      staminaViews: doc.views.stamina,
      hintViews: doc.views.hint,
      doubleViews: doc.views.double,
      views,
      viewsPerViewer: doc.viewers ? Math.round((views / doc.viewers) * 10) / 10 : 0
    }
  })
}

module.exports = { AD_VIEW_KINDS, recordAdView, recentAdStats }
