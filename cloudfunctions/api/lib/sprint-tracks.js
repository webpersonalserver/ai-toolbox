// The 60-second challenges and their tracks (each track has its own board):
// - 口算竞速 (math): one track per 数理乐园 island, sums from that island's units (lib/math-challenge.js);
// - 识字竞速 (chinese): one track per grade, four-choice questions taken from the 汉字闯关 levels
//   (data/hanzi-sprint-pool.json, built by scripts/build_hanzi_sprint.js).
// No hints and no friends here: the score is the child's own.
const { SPRINT_ISLANDS, sprintPaper } = require('./math-challenge')
const { seededRandom } = require('./seeded-random')
const HANZI_POOL = require('../data/hanzi-sprint-pool.json')

const PAPER_SIZE = 150
const SUBJECTS = { MATH: 'math', CHINESE: 'chinese' }

const HANZI_TRACKS = [
  { id: 'hanzi-grade1', name: '一年级识字', stage: '一年级', scope: '看图、读拼音、找偏旁、组词选字 · 一年级的字' },
  { id: 'hanzi-grade2', name: '二年级识字', stage: '二年级', scope: '看图、读拼音、找偏旁、组词选字 · 二年级的字' }
]

const pickIndex = (rng, length) => Math.floor(rng() * length)

const shuffled = (items, rng) => {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = pickIndex(rng, index + 1)
    ;[copy[index], copy[other]] = [copy[other], copy[index]]
  }
  return copy
}

// PAPER_SIZE different questions of the grade, choices in a fresh order each time.
const hanziPaper = (track, seed) => {
  const rng = seededRandom(`sprint:${track.id}:${seed}`)
  const pool = HANZI_POOL[track.stage]
  return shuffled(pool.map((_, index) => index), rng)
    .slice(0, PAPER_SIZE)
    .map((poolIndex, index) => {
      const [kind, prompt, clue, choices, answer] = pool[poolIndex]
      return { index, type: 'hanzi', kind, prompt, clue, choices: shuffled(choices, rng), answer, maxDigits: 1 }
    })
}

// What the phone gets for a run: how to show each question, and its answer so each tap is marked at once.
const toMathRunQuestion = (question) => ({
  index: question.index,
  tokens: question.tokens,
  answer: question.answer,
  maxDigits: question.maxDigits,
  ...(question.choices ? { choices: question.choices } : {})
})

const TRACKS = [
  ...SPRINT_ISLANDS.map((island) => ({
    id: island.id,
    name: island.name,
    subject: SUBJECTS.MATH,
    paper: (seed) => sprintPaper(island.id, seed),
    toRunQuestion: toMathRunQuestion
  })),
  ...HANZI_TRACKS.map((track) => ({
    id: track.id,
    name: track.name,
    scope: track.scope,
    subject: SUBJECTS.CHINESE,
    paper: (seed) => hanziPaper(track, seed),
    toRunQuestion: (question) => question
  }))
]

const isSprintSubject = (subject) => Object.values(SUBJECTS).includes(subject)
const tracksOf = (subject) => TRACKS.filter((track) => track.subject === subject)
const trackOf = (trackId) => TRACKS.find((track) => track.id === trackId) || null

module.exports = { SUBJECTS, PAPER_SIZE, HANZI_TRACKS, isSprintSubject, tracksOf, trackOf }
