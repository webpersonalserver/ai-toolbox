// Shared by the leaderboard tab (cards) and the board page (the full list).
// A 竞速 board is board=sprint plus its subject (口算 / 识字) and a track.
const SPRINT_BOARD = 'sprint'
const ANONYMOUS_NAME = '匿名玩家'
const UNRANKED_TEXT = '-'

const displayNameOf = (nickname) => nickname || ANONYMOUS_NAME

const withDisplayName = (entry) => {
  const displayName = displayNameOf(entry.nickname)
  return {
    ...entry,
    displayName,
    initial: displayName.slice(0, 1),
    rankText: entry.rank ? String(entry.rank) : UNRANKED_TEXT
  }
}

const boardUrlOf = (boardId) => `/pages/leaderboard/board?board=${boardId}`

const sprintBoardUrlOf = (subjectId, trackId) => `/pages/leaderboard/board?board=${SPRINT_BOARD}&subject=${subjectId}${trackId ? `&island=${trackId}` : ''}`

module.exports = { SPRINT_BOARD, displayNameOf, withDisplayName, boardUrlOf, sprintBoardUrlOf }
