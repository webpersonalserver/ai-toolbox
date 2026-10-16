// The lobby's recommendations and subject tabs (utils/lobby.js).
const path = require('path')
const lobby = require(path.join(__dirname, '..', 'utils', 'lobby'))

let failed = 0
const check = (condition, label, detail) => {
  if (condition) return
  failed += 1
  console.log('FAIL', label, detail === undefined ? '' : JSON.stringify(detail))
}

const card = (gameType, extra = {}) => ({ gameType, name: gameType, solvedCount: 0, currentLevel: 1, allCleared: false, lastSolvedAt: 0, ...extra })
const fresh = ['hanzi', 'math', 'idiom', 'typo', 'poetry', 'xiehouyu', 'riddle'].map((gameType) => card(gameType))

let picks = lobby.recommendationsOf(fresh)
check(picks.length === 3 && picks[0].card.gameType === 'hanzi' && picks[1].card.gameType === 'math' && picks[2].card.gameType === 'riddle' && picks.every((pick) => pick.levelNo === 1 && pick.reason === '新手从这里开始'), 'a new player: one beginner game per subject', picks)

const played = fresh.map((item) => {
  if (item.gameType === 'idiom') return { ...item, solvedCount: 12, currentLevel: 13, lastSolvedAt: 200 }
  if (item.gameType === 'hanzi') return { ...item, solvedCount: 40, currentLevel: 41, lastSolvedAt: 100 }
  if (item.gameType === 'math') return { ...item, solvedCount: 5, currentLevel: 6, lastSolvedAt: 50 }
  return item
})
picks = lobby.recommendationsOf(played)
check(picks[0].card.gameType === 'idiom' && picks[0].levelNo === 13 && picks[0].reason.includes('13'), '语文: the game played most recently carries on', picks[0])
check(picks[1].card.gameType === 'math' && picks[1].levelNo === 6, '数学: 口算闯关 carries on', picks[1])

const finished = played.map((item) => (item.gameType === 'idiom' ? { ...item, allCleared: true } : item))
picks = lobby.recommendationsOf(finished)
check(picks[0].card.gameType === 'hanzi', 'a finished game gives way to the next most recent one', picks[0])

const allChineseDone = fresh.map((item) => (lobby.subjectOfGame(item.gameType).id === 'chinese' && item.gameType !== 'poetry' ? { ...item, allCleared: true, lastSolvedAt: 10 } : item))
picks = lobby.recommendationsOf(allChineseDone)
check(picks[0].card.gameType === 'poetry' && picks[0].reason.includes('换个玩法'), 'every played game finished: the next unfinished game in the subject', picks[0])

const noTimes = fresh.map((item) => (item.gameType === 'hanzi' ? { ...item, solvedCount: 8, currentLevel: 9 } : item))
picks = lobby.recommendationsOf(noTimes)
check(picks[0].card.gameType === 'hanzi' && picks[0].levelNo === 9 && picks[0].reason.includes('第 9 关'), 'levels passed count as played even without a last-played time', picks[0])
check(lobby.initialSubjectOf(played, '') === 'chinese' && lobby.initialSubjectOf(played.map((item) => (item.gameType === 'math' ? { ...item, lastSolvedAt: 999 } : item)), '') === 'math', 'the first tab follows the game played last', null)
check(lobby.initialSubjectOf(played, 'math') === 'math' && lobby.initialSubjectOf(played, 'nonsense') === 'chinese', 'a saved tab wins; an unknown one is ignored', null)
check(lobby.cardsOfSubject('math', fresh).map((item) => item.gameType).join() === 'math' && lobby.cardsOfSubject('chinese', fresh).length === 5 && lobby.cardsOfSubject('english', fresh).length === 0, 'tabs list their own games', null)

const { GAME_ORDER } = require(path.join(__dirname, '..', 'utils', 'games'))
check(GAME_ORDER.every((gameType) => lobby.subjectOfGame(gameType)), 'every lobby game belongs to a subject tab', GAME_ORDER.filter((gameType) => !lobby.subjectOfGame(gameType)))

console.log(failed ? `${failed} lobby checks failed` : 'all lobby checks passed')
process.exitCode = failed ? 1 : 0
