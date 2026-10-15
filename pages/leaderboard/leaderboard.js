const { leaderboard, toastError } = require('../../utils/api')
const { ensureLogin } = require('../../utils/session')
const { DEFAULT_SHARE } = require('../../utils/share')
const { gameConfigOf } = require('../../utils/games')
const { openPage, takePendingLeaderboardGameType } = require('../../utils/navigation')
const { SUBJECTS } = require('../../utils/lobby')
const { sprintSubjectOf } = require('../../utils/sprint')
const { displayNameOf, boardUrlOf, sprintBoardUrlOf } = require('./board-shared')

// The leaderboard's front page: one card per board, grouped by subject like the lobby, each saying where this player
// stands and who is first. Tapping a card opens the full board (board.js); a 竞速's track choice lives there.
const PODIUM_SIZE = 3

const levelCardOf = (gameType, card) => {
  const config = gameConfigOf(gameType)
  const leader = card && card.leader
  return {
    id: gameType,
    name: config.name,
    icon: config.icon,
    url: boardUrlOf(gameType),
    rankText: card && card.myRank ? `我：第 ${card.myRank} 名` : '我：还没上榜',
    onPodium: Boolean(card && card.myRank && card.myRank <= PODIUM_SIZE),
    detail: leader ? `🥇 ${leader.isMe ? '我' : displayNameOf(leader.nickname)} · ${leader.solvedCount} 关` : '第一名还空着，闯过 1 关就上榜'
  }
}

const sprintCardOf = (subjectId, card) => {
  const best = card && card.best
  return {
    id: `sprint-${subjectId}`,
    name: sprintSubjectOf(subjectId).name,
    icon: '⏱',
    tag: card && card.weekly ? '本周' : '',
    url: sprintBoardUrlOf(subjectId, best ? best.islandId : ''),
    rankText: best ? `我：第 ${best.rank} 名` : '我：还没挑战',
    onPodium: Boolean(best && best.rank <= PODIUM_SIZE),
    detail: best ? `最好：${best.islandName} ${best.score} 分` : '挑战一次就能上榜'
  }
}

const sectionsOf = (summary) => {
  const cardByGame = Object.fromEntries(((summary && summary.games) || []).map((card) => [card.gameType, card]))
  return SUBJECTS.map((subject) => ({
    id: subject.id,
    name: subject.name,
    icon: subject.icon,
    comingSoon: Boolean(subject.comingSoon),
    cards: [
      ...subject.gameTypes.map((gameType) => levelCardOf(gameType, cardByGame[gameType])),
      ...(subject.hasSprint ? [sprintCardOf(subject.id, summary && summary.sprints && summary.sprints[subject.id])] : [])
    ]
  }))
}

Page({
  data: {
    loading: true,
    // Cards are drawn even when the summary fails (they still open their boards); their names say nothing then.
    loadFailed: false,
    sections: sectionsOf(null)
  },

  // Opened from a game's 排行榜 link: straight on to that game's board, with these cards behind it.
  onShow() {
    const requested = takePendingLeaderboardGameType()
    if (requested) openPage(boardUrlOf(requested))
    this.loadSummary()
  },

  onPullDownRefresh() {
    this.loadSummary().then(() => wx.stopPullDownRefresh())
  },

  async loadSummary() {
    try {
      await ensureLogin()
      const summary = await leaderboard.summary()
      this.setData({ loading: false, loadFailed: false, sections: sectionsOf(summary) })
    } catch (error) {
      this.setData({ loading: false, loadFailed: true })
      toastError(error)
    }
  },

  openBoard(event) {
    openPage(event.currentTarget.dataset.url)
  },

  onShareAppMessage() {
    return DEFAULT_SHARE
  }
})
