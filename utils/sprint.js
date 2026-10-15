// The 60-second challenges, by subject, as the pages show them (the cloud's list is lib/sprint-tracks.js;
// tests/boundaries.test.js keeps the track ids and names the same). No hints and no friends in these.
const { ISLANDS } = require('./practice/catalog')

const SPRINT_SUBJECTS = {
  math: {
    id: 'math',
    name: '口算竞速',
    intro: '选一座数理岛，60 秒比比谁答得多，每周排行',
    trackWord: '岛',
    chooseText: '选一座岛',
    thisTrack: '这座岛',
    trackIcon: '🏝',
    themeGame: 'math',
    tracks: ISLANDS.filter((island) => island.subject === 'math').map(({ id, name }) => ({ id, name }))
  },
  chinese: {
    id: 'chinese',
    name: '识字竞速',
    intro: '选一个年级，60 秒看谁认的字多，每周排行',
    trackWord: '年级',
    chooseText: '选一个年级',
    thisTrack: '这个年级',
    trackIcon: '📚',
    themeGame: 'hanzi',
    tracks: [
      { id: 'hanzi-grade1', name: '一年级识字' },
      { id: 'hanzi-grade2', name: '二年级识字' }
    ]
  }
}

const sprintSubjectOf = (subjectId) => SPRINT_SUBJECTS[subjectId] || SPRINT_SUBJECTS.math

const sprintUrlOf = (subjectId, trackId = '') => `/pages/game/sprint/sprint?subject=${subjectId}${trackId ? `&island=${trackId}` : ''}`

module.exports = { SPRINT_SUBJECTS, sprintSubjectOf, sprintUrlOf }
