const { buildMedalShare } = require('../share')

const FLOWER_PRAISES = {
  arithmeticSolved: '又答对 10 题，真棒！',
  arithmeticStreak: '连对 10 题，了不起！',
  dailyFirst: '今天也来练习啦，好孩子！',
  rowRecited: '口诀念完啦，真是好学的孩子！',
  rowMastered: '练成一重，继续加油！',
  rowPerfect: '零失误，太优秀了！',
  islandMaster: '成为小岛主啦，奖励一大把小红花！',
  dailyChallenge: '今日挑战完成，真棒！',
  dailyPerfect: '今日挑战全对，太厉害了！'
}
const DEFAULT_PRAISE = '认真练习的好孩子！'
const FLOWER_TOAST_MS = 2200
const HIDDEN_FLOWER_TOAST = { visible: false, count: 0, text: '' }
const HIDDEN_MEDAL_POPUP = { visible: false, isNew: false, medal: null }
const SHARE_PURPOSE_MEDAL = 'medal'

const praiseOf = (reasons) => FLOWER_PRAISES[reasons[0]] || DEFAULT_PRAISE

const describeMedalDate = (timestamp) => {
  const date = new Date(timestamp)
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日获得`
}

const toMedalPopup = (medal, isNew) => ({
  visible: true,
  isNew,
  medal: { ...medal, dateText: medal.unlocked ? describeMedalDate(medal.unlockedAt) : '', remainingText: medal.unlocked ? '' : `还差 ${medal.target - medal.current}，加油！` }
})

/**
 * Shows what a practice report earned: a floating flower first, then each new medal one by one.
 * The page needs data keys flowerToast / medalPopup, the two components, and calls closeMedal() from the popup.
 */
const createHonorPresenter = (page) => {
  let medalQueue = []
  let toastTimer = null
  const showNextMedal = () => {
    const medal = medalQueue.shift()
    page.setData({ medalPopup: medal ? toMedalPopup(medal, true) : HIDDEN_MEDAL_POPUP })
  }
  return {
    present(honors) {
      if (!honors) return
      if (honors.flowersGained > 0) {
        clearTimeout(toastTimer)
        page.setData({ flowerToast: HIDDEN_FLOWER_TOAST }, () =>
          page.setData({ flowerToast: { visible: true, count: honors.flowersGained, text: praiseOf(honors.flowerReasons) } })
        )
        toastTimer = setTimeout(() => page.setData({ flowerToast: HIDDEN_FLOWER_TOAST }), FLOWER_TOAST_MS)
      }
      if (!honors.newMedals.length) return
      const idle = !page.data.medalPopup.visible
      medalQueue = [...medalQueue, ...honors.newMedals]
      if (idle) showNextMedal()
    },
    showMedal(medal) {
      page.setData({ medalPopup: toMedalPopup(medal, false) })
    },
    closeMedal: showNextMedal,
    destroy() {
      clearTimeout(toastTimer)
    }
  }
}

// For onShareAppMessage: returns the medal share when the share button in the medal popup was tapped.
const medalShareOf = (event, medalPopup) => {
  const isMedalShare = event.from === 'button' && event.target.dataset.purpose === SHARE_PURPOSE_MEDAL
  return isMedalShare && medalPopup.medal ? buildMedalShare(medalPopup.medal) : null
}

// Two reports in a row (answers, then the exam paper) are shown as one celebration.
const mergeHonors = (first, second) => {
  if (!first) return second
  if (!second) return first
  return {
    ...second,
    flowersGained: first.flowersGained + second.flowersGained,
    flowerReasons: [...second.flowerReasons, ...first.flowerReasons],
    newMedals: [...first.newMedals, ...second.newMedals]
  }
}

module.exports = { mergeHonors, HIDDEN_FLOWER_TOAST, HIDDEN_MEDAL_POPUP, createHonorPresenter, medalShareOf, toMedalPopup }
