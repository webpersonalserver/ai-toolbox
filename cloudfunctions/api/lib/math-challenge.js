// Questions for the lobby's math challenges, made in the cloud from a seed so they can be rebuilt to check answers:
// - 口算闯关 (gameType 'math'): level n always has the same 10 questions. Levels follow 数理乐园's route, one
//   knowledge point per stage (12 levels each, 7 new questions + 3 to review earlier ones), then 全能挑战 mixes them all.
// - 口算竞速: a 60-second paper from one island's units.
// The question makers are utils/practice copied into lib/practice (scripts/sync_cloud_practice.js).
const { ISLANDS, unitOf } = require('./practice/catalog')
const { skillOf } = require('./practice/skills/index')
const { seededRandom } = require('./seeded-random')

const MATH_GAME_TYPE = 'math'
const LEVELS_PER_STAGE = 12
const QUESTIONS_PER_LEVEL = 10
const NEW_QUESTIONS_PER_LEVEL = 7
// Effectively endless; a cap keeps the level list and the 全部通关 record well defined.
const TOTAL_LEVELS = 999
const FINAL_STAGE_NAME = '全能挑战'
const SPRINT_PAPER_SIZE = 150
const MAX_DRAWS_PER_QUESTION = 20

// 乘法口诀 is taught by 九九神功 in 数理乐园 (no shared unit), so the challenges use the times skill directly.
const TIMES_UNIT = { id: 'times', name: '乘法口诀', skill: 'times', options: {} }
const unitFor = (unitId) => (unitId === TIMES_UNIT.id ? TIMES_UNIT : unitOf(unitId))

// 数理乐园's recommended route (islands top to bottom), one stage per playable unit.
const ROUTE = ['split-10', 'add-sub-10', 'add-sub-20', 'chain-add-sub', 'compare', 'add-sub-100', 'times', 'division-table', 'add-sub-10000']
const STAGES = ROUTE.map((unitId, index) => ({
  unitId,
  name: unitFor(unitId).name,
  firstLevelNo: index * LEVELS_PER_STAGE + 1,
  lastLevelNo: (index + 1) * LEVELS_PER_STAGE
}))
const FINAL_FIRST_LEVEL = STAGES.length * LEVELS_PER_STAGE + 1

// Each island's units for 口算竞速; 口诀岛's 九九 unit becomes the times skill.
const SPRINT_ISLANDS = ISLANDS.map((island) => ({
  id: island.id,
  name: island.name,
  unitIds: island.units.map((unitId) => (unitId === 'multiplication' ? TIMES_UNIT.id : unitId)).filter((unitId) => unitFor(unitId) && unitFor(unitId).skill)
}))
const sprintIslandOf = (islandId) => SPRINT_ISLANDS.find((island) => island.id === islandId) || null

const stageOfLevel = (levelNo) => {
  if (levelNo >= FINAL_FIRST_LEVEL) return { name: FINAL_STAGE_NAME, index: STAGES.length }
  const index = Math.floor((levelNo - 1) / LEVELS_PER_STAGE)
  return { name: STAGES[index].name, index }
}

const levelStagesView = () => [
  ...STAGES.map(({ name, firstLevelNo, lastLevelNo }) => ({ name, firstLevelNo, lastLevelNo })),
  { name: FINAL_STAGE_NAME, firstLevelNo: FINAL_FIRST_LEVEL, lastLevelNo: TOTAL_LEVELS }
]

const pickIndex = (rng, length) => Math.floor(rng() * length)

// Later units weigh more in 全能挑战, so the hardest skills come up most.
const weightedUnit = (rng) => {
  const weights = ROUTE.map((_, index) => index + 1)
  let roll = rng() * weights.reduce((total, weight) => total + weight, 0)
  return ROUTE.find((unitId, index) => (roll -= weights[index]) < 0) || ROUTE[ROUTE.length - 1]
}

const unitsForLevel = (levelNo, rng) => {
  const { index } = stageOfLevel(levelNo)
  if (index >= STAGES.length) return Array.from({ length: QUESTIONS_PER_LEVEL }, () => weightedUnit(rng))
  const current = Array(index === 0 ? QUESTIONS_PER_LEVEL : NEW_QUESTIONS_PER_LEVEL).fill(ROUTE[index])
  const review = Array.from({ length: QUESTIONS_PER_LEVEL - current.length }, () => ROUTE[pickIndex(rng, index)])
  // Review questions are spread through the level rather than bunched at the end.
  const units = [...current]
  review.forEach((unitId) => units.splice(1 + pickIndex(rng, units.length), 0, unitId))
  return units
}

// One question per unit id, no equation twice in the same set.
const makeQuestions = (unitIds, rng) => {
  const used = new Set()
  return unitIds.map((unitId, index) => {
    const unit = unitFor(unitId)
    const skill = skillOf(unit.skill)
    let question = skill.generate(unit.options, { rng })
    for (let draw = 1; used.has(question.equation) && draw < MAX_DRAWS_PER_QUESTION; draw += 1) question = skill.generate(unit.options, { rng })
    used.add(question.equation)
    return { ...question, unitId, index }
  })
}

const levelQuestions = (levelNo) => makeQuestions(unitsForLevel(levelNo, seededRandom(`math-level:${levelNo}`)), seededRandom(`math-questions:${levelNo}`))

const sprintPaper = (islandId, seed) => {
  const island = sprintIslandOf(islandId)
  const rng = seededRandom(`sprint:${islandId}:${seed}`)
  const unitIds = Array.from({ length: SPRINT_PAPER_SIZE }, () => island.unitIds[pickIndex(rng, island.unitIds.length)])
  return makeQuestions(unitIds, rng)
}

// What the phone may see before answering: how to draw the question, never its answer.
const publicQuestionOf = (question) => ({
  index: question.index,
  unitId: question.unitId,
  tokens: question.tokens,
  maxDigits: question.maxDigits,
  ...(question.choices ? { choices: question.choices } : {}),
  ...(question.story ? { story: question.story } : {}),
  ...(question.layout ? { layout: question.layout, bond: question.bond } : {})
})

const isRightAnswer = (question, answer) => typeof answer === 'string' && answer !== '' && answer === question.answer

module.exports = {
  MATH_GAME_TYPE,
  TOTAL_LEVELS,
  QUESTIONS_PER_LEVEL,
  LEVELS_PER_STAGE,
  STAGES,
  SPRINT_ISLANDS,
  sprintIslandOf,
  stageOfLevel,
  levelStagesView,
  levelQuestions,
  sprintPaper,
  publicQuestionOf,
  isRightAnswer
}
