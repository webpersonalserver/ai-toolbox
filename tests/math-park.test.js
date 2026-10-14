const path = require('path')
const { SUBJECTS, ISLANDS, UNITS, playableUnitIds, unitIdOfLegacyTier, islandOfUnit } = require(path.join(__dirname, '..', 'utils', 'practice', 'catalog'))
const { skillOf } = require(path.join(__dirname, '..', 'utils', 'practice', 'skills'))
const addSub = require(path.join(__dirname, '..', 'utils', 'practice', 'skills', 'add-sub'))

const SAMPLES_PER_UNIT = 6000
let failed = 0
const check = (condition, label, detail) => {
  if (condition) return
  failed += 1
  console.log('FAIL', label, detail === undefined ? '' : JSON.stringify(detail))
}

const seededRng = (seed) => {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648
    return state / 2147483648
  }
}

// ----- catalog -----
const islandUnitIds = ISLANDS.flatMap((island) => island.units)
check(new Set(islandUnitIds).size === islandUnitIds.length, 'each unit sits on exactly one island', islandUnitIds)
check(islandUnitIds.every((unitId) => UNITS[unitId]), 'every island unit is defined', islandUnitIds.filter((unitId) => !UNITS[unitId]))
check(Object.keys(UNITS).every((unitId) => islandOfUnit(unitId)), 'every defined unit is on an island')
check(ISLANDS.every((island) => SUBJECTS.some((subject) => subject.id === island.subject)), 'islands belong to a known subject')
check(Object.keys(UNITS).every((unitId) => /^[a-z0-9-]+$/.test(unitId)), 'unit ids are lowercase-dash content names')
playableUnitIds().forEach((unitId) => {
  const unit = UNITS[unitId]
  check(Boolean(skillOf(unit.skill)), `${unitId}: skill exists`)
  check([1, 2, 3].every((level) => unit.examSeconds[level] > 0) && unit.examSeconds[1] > unit.examSeconds[2] && unit.examSeconds[2] > unit.examSeconds[3], `${unitId}: exam levels get shorter`, unit.examSeconds)
})
check([10, 20, 100].every((tier) => unitIdOfLegacyTier(tier)), 'every old 加减运算 tier has a unit to move to')

// The cloud keeps its own list of units it accepts; it must match the playable units here.
const Module = require('module')
const resolveFilename = Module._resolveFilename
Module._resolveFilename = function resolveWithFakeSdk(request, ...rest) {
  return request === 'wx-server-sdk' ? path.join(__dirname, 'support', 'fake-wx-server-sdk.js') : resolveFilename.call(this, request, ...rest)
}
const { MATH_UNITS } = require(path.join(__dirname, '..', 'cloudfunctions', 'api', 'lib', 'math-stats'))
check(JSON.stringify(Object.keys(MATH_UNITS).sort()) === JSON.stringify(playableUnitIds().sort()), 'cloud MATH_UNITS match the playable units in catalog.js', { cloud: Object.keys(MATH_UNITS), client: playableUnitIds() })
check(playableUnitIds().every((unitId) => MATH_UNITS[unitId].legacyTier === UNITS[unitId].legacyTier), 'cloud and client agree on which old tier each unit replaces')
check(playableUnitIds().every((unitId) => MATH_UNITS[unitId].island === islandOfUnit(unitId).id), 'cloud and client agree on which island each unit sits on (岛主 medals)')
const { MEDALS } = require(path.join(__dirname, '..', 'cloudfunctions', 'api', 'lib', 'honors'))
check(ISLANDS.every((island) => MEDALS.some((medal) => medal.id === `island-${island.id}` && medal.name === `${island.name}岛主`)), 'every island has a 岛主 medal named after it')

// ----- add/subtract skill: questions, pictures, explanations -----
const SAFE_ARITHMETIC = /^[\d\s+−-]+$/
const evaluate = (expression) => {
  const normalized = expression.replace(/−/g, '-').trim()
  if (!SAFE_ARITHMETIC.test(normalized)) return NaN
  return normalized.split(/\s*([+-])\s*/).reduce((total, part, index, parts) => {
    if (index === 0) return Number(part)
    if (index % 2 === 1) return total
    return parts[index - 1] === '+' ? total + Number(part) : total - Number(part)
  }, 0)
}
// Every "a = b = c" chain in a step must hold; "?" reframing steps (with →) are skipped.
const mathHolds = (math) => {
  if (math.includes('→') || math.includes('?')) return true
  const sides = math.split('=').map(evaluate)
  return sides.every((value) => Number.isFinite(value) && value === sides[0])
}
const pictureTotal = (picture) =>
  picture.type === 'frames'
    ? picture.frames.flat().filter(Boolean).length
    : picture.groups.reduce((total, group) => total + group.bundles * 10 + group.ones, 0)

playableUnitIds()
  .filter((unitId) => UNITS[unitId].skill === 'addSub')
  .forEach((unitId) => {
    const { options } = UNITS[unitId]
    const rng = seededRng(unitId.length * 7919)
    let previousKey = ''
    let makeTen = 0
    let breakTen = 0
    for (let index = 0; index < SAMPLES_PER_UNIT; index += 1) {
      const question = addSub.generate(options, { rng, previousKey })
      const label = `${unitId} ${question.equation} [${question.blank}]`
      previousKey = question.key
      const values = [question.left, question.right, question.result]
      check(values.every((value) => value >= 0 && value <= options.max), `${label}: numbers within ${options.max}`)
      check((question.operation === '+' ? question.left + question.right : question.left - question.right) === question.result, `${label}: equation holds`)
      check(question.tokens.filter((token) => token === '').length === 1 && addSub.check(question, question.answer) && !addSub.check(question, ''), `${label}: one blank, answer checks`)
      check(question.answer.length <= question.maxDigits, `${label}: answer fits the keypad`)
      addSub.visual(question, options).forEach((picture, tokenIndex) => {
        if (!picture) return
        check(pictureTotal(picture) === Number(question.tokens[tokenIndex]), `${label}: picture shows ${question.tokens[tokenIndex]}`, picture)
        check(options.max <= 20 ? picture.type === 'frames' : picture.type === 'sticks', `${label}: frames up to 20, sticks above`)
      })
      const steps = addSub.explain(question)
      check(steps.length >= 2 && steps.every((step) => step.say && step.math), `${label}: explanation has steps`)
      check(steps.every((step) => mathHolds(step.math)), `${label}: every step's maths is right`, steps.map((step) => step.math))
      check(steps[steps.length - 1].math === question.equation, `${label}: ends on the full equation`)
      const plain = addSub.plainCalculation(question)
      if (steps.some((step) => step.say.includes('还差'))) makeTen += 1
      if (steps.some((step) => step.say.includes('个不够减') && step.math.includes('= 10 +'))) breakTen += 1
      const shouldMakeTen = plain.operation === '+' && plain.x < 10 && plain.y < 10 && plain.x + plain.y > 10
      check(shouldMakeTen === steps.some((step) => step.say.includes('还差')), `${label}: 凑十法 exactly when crossing ten`)
    }
    console.log(`${unitId}: ${SAMPLES_PER_UNIT} questions checked, 凑十 ${makeTen}, 破十 ${breakTen}`)
  })

// A worked example a child would see.
const sample = addSub.explain({ operation: '+', left: 8, right: 5, result: 13, blank: 'result', answer: '13', tokens: ['8', '+', '5', '=', ''], equation: '8 + 5 = 13' })
check(sample.map((step) => step.math).join(' | ') === '8 + 2 = 10 | 5 = 2 + 3 | 8 + 5 = 10 + 3 = 13 | 8 + 5 = 13', '8 + 5 explained by making ten', sample.map((step) => step.math))
const reframed = addSub.explain({ operation: '+', left: 7, right: 6, result: 13, blank: 'left', answer: '7', tokens: ['', '+', '6', '=', '13'], equation: '7 + 6 = 13' })
check(reframed[0].math === '? + 6 = 13 → 13 − 6' && reframed.some((step) => step.say.includes('分成 10 和')), '? + 6 = 13 becomes 13 − 6, then breaks ten', reframed.map((step) => step.math))

// The first line of a reframed question talks about the question as asked.
const reframeLine = (operation, left, right, result, blank) => {
  const symbol = operation === '+' ? '+' : '−'
  const tokens = [String(left), symbol, String(right), '=', String(result)]
  tokens[{ left: 0, right: 2, result: 4 }[blank]] = ''
  return addSub.explain({ operation, left, right, result, blank, answer: String({ left, right, result }[blank]), tokens, equation: `${left} ${symbol} ${right} = ${result}` })[0]
}
check(reframeLine('+', 7, 6, 13, 'left').say.startsWith('加法的问号') && reframeLine('+', 7, 6, 13, 'right').math.endsWith('13 − 7'), '? in an addition → subtraction')
check(reframeLine('-', 16, 10, 6, 'left').say.startsWith('被减数') && reframeLine('-', 16, 10, 6, 'left').math.endsWith('6 + 10'), '? − 10 = 6 → 6 + 10')
check(reframeLine('-', 16, 10, 6, 'right').say.startsWith('减掉了几') && reframeLine('-', 16, 10, 6, 'right').math.endsWith('16 − 6'), '16 − ? = 6 → 16 − 6')

// ----- mistakes and rounds -----
const sampleQuestion = addSub.generate(UNITS['add-sub-20'].options, { rng: seededRng(5) })
const restored = addSub.fromMistake(addSub.toMistake(sampleQuestion), UNITS['add-sub-20'].options)
check(restored && restored.key === sampleQuestion.key && restored.answer === sampleQuestion.answer && restored.equation === sampleQuestion.equation, 'a mistake rebuilds the same question', { sampleQuestion, restored })
check(addSub.fromMistake({ operation: '+', left: 2, right: 2, result: 5, blank: 'result' }, UNITS['add-sub-10'].options) === null, 'a broken mistake record is ignored, not shown')
const { starsOfRound, nextStarHint, ROUND_SIZE } = require(path.join(__dirname, '..', 'utils', 'practice', 'round'))
check(ROUND_SIZE === 10 && starsOfRound(10) === 3 && starsOfRound(9) === 3 && starsOfRound(8) === 2 && starsOfRound(7) === 2 && starsOfRound(6) === 1 && starsOfRound(5) === 1 && starsOfRound(4) === 0, 'round stars: 9+ → 3, 7+ → 2, 5+ → 1')
check(nextStarHint(4).stars === 1 && nextStarHint(4).more === 1 && nextStarHint(8).stars === 3 && nextStarHint(8).more === 1 && nextStarHint(9) === null, 'next star hint')

// ----- unsent reports survive the move from the old pages -----
const phoneStorage = {}
global.wx = { getStorageSync: (key) => (key in phoneStorage ? phoneStorage[key] : ''), setStorageSync: (key, value) => { phoneStorage[key] = JSON.parse(JSON.stringify(value)) } }
const { saveUnitReports, takeUnitReports } = require(path.join(__dirname, '..', 'utils', 'practice', 'unit-reports'))
phoneStorage['practice.arithmetic.unsentReports.v1'] = { 20: [{ practiceId: 'arithmetic', tier: 20, solvedDelta: 4, streak: 2, streakRunId: 'old', reportId: 'old-1' }] }
phoneStorage['practice.arithmetic.unreportedSolved.v1'] = { 20: 3 }
let waiting = takeUnitReports('add-sub-20', 20, () => 'fresh-id')
check(waiting.length === 2 && waiting.some((report) => report.reportId === 'old-1' && report.tier === 20) && waiting.some((report) => report.solvedDelta === 3 && report.unitId === 'add-sub-20'), 'old unsent reports and counts are picked up for the unit', waiting)
check(takeUnitReports('add-sub-20', 20, () => 'x').length === 0, 'they are taken once', null)
saveUnitReports('add-sub-20', [{ reportId: 'mine' }])
check(takeUnitReports('add-sub-20', 20, () => 'x').map((report) => report.reportId).join() === 'mine' && takeUnitReports('add-sub-10', 10, () => 'x').length === 0, 'units keep their own queue', null)
delete global.wx

// ----- every skill: the contract pages rely on -----
const { buildExamPaper } = require(path.join(__dirname, '..', 'utils', 'practice', 'exam'))
const MISTAKE_KEY = /^[0-9a-zA-Z+\-*/:_.]{1,40}$/
const MAX_MISTAKE_DATA = 300
const CONTRACT_SAMPLES = 3000
const wrongAnswerOf = (question) =>
  question.choices ? question.choices.find((choice) => choice !== question.answer) : String(Number(question.answer) + 1)

playableUnitIds().forEach((unitId, unitIndex) => {
  const unit = UNITS[unitId]
  const skill = skillOf(unit.skill)
  const rng = seededRng(unitIndex * 104729 + 3)
  let previousKey = ''
  const answers = new Set()
  for (let index = 0; index < CONTRACT_SAMPLES; index += 1) {
    const question = skill.generate(unit.options, { rng, previousKey })
    const label = `${unitId} ${question.equation}`
    check(question.key !== previousKey, `${label}: no immediate repeat`)
    previousKey = question.key
    answers.add(question.answer)
    check(question.tokens.filter((token) => token === '').length === 1, `${label}: exactly one blank`, question.tokens)
    check(skill.check(question, question.answer) && !skill.check(question, '') && !skill.check(question, wrongAnswerOf(question)), `${label}: check accepts only the answer`)
    check(question.answer.length <= question.maxDigits, `${label}: answer fits the input`)
    check(!question.choices || question.choices.includes(question.answer), `${label}: the answer is one of the buttons`)
    check(MISTAKE_KEY.test(question.key), `${label}: key is accepted by the cloud`, question.key)
    const data = skill.toMistake(question)
    check(JSON.stringify(data).length <= MAX_MISTAKE_DATA, `${label}: mistake data is small enough for the cloud`)
    const rebuilt = skill.fromMistake(JSON.parse(JSON.stringify(data)), unit.options)
    check(rebuilt && rebuilt.key === question.key && rebuilt.answer === question.answer && rebuilt.equation === question.equation, `${label}: a mistake rebuilds the same question`)
    check(skill.visual(question, unit.options).length === question.tokens.length, `${label}: one picture slot per token`)
    const steps = skill.explain(question)
    check(steps.length >= 2 && steps.every((step) => typeof step.say === 'string' && step.say && typeof step.math === 'string' && step.math), `${label}: explanation has steps`)
    if (unit.skill !== 'addSub') check(typeof question.story === 'string' && question.story.length > 0, `${label}: has a story`)
  }
  check(skill.fromMistake({}, unit.options) === null && skill.fromMistake({ left: -1 }, unit.options) === null, `${unitId}: broken mistake data is refused`)
  check(answers.size >= (unit.skill === 'compare' ? 3 : 4), `${unitId}: answers vary`, [...answers].slice(0, 5))
  const paper = buildExamPaper(unit, seededRng(unitIndex + 77))
  check(paper.length === 20 && new Set(paper.map((question) => question.equation)).size === 20, `${unitId}: exam paper has 20 different questions`)
})

// ----- the new skills give the right answers -----
const sampleOf = (unitId, count, seed) => {
  const unit = UNITS[unitId]
  const skill = skillOf(unit.skill)
  const rng = seededRng(seed)
  return Array.from({ length: count }, () => skill.generate(unit.options, { rng }))
}

sampleOf('split-10', 2000, 5).forEach((question) => {
  const { total, left, right, blank } = question
  check(left >= 1 && right >= 1 && left + right === total && total <= 10, `分与合 ${question.equation}: parts add up within 10`)
  check(question.answer === String({ total, left, right }[blank]), `分与合 ${question.equation}: answer is the hidden circle`)
  check(question.tokens[question.bond.top] === (blank === 'total' ? '' : String(total)), `分与合 ${question.equation}: the whole sits on top`)
})

const applyOperation = (value, operation, amount) => (operation === '+' ? value + amount : value - amount)
sampleOf('chain-add-sub', 2000, 6).forEach((question) => {
  const middle = applyOperation(question.first, question.operations[0], question.numbers[0])
  const result = applyOperation(middle, question.operations[1], question.numbers[1])
  check(String(result) === question.answer && [middle, result].every((value) => value >= 0 && value <= 20), `连加连减 ${question.equation}: worked left to right within 20`)
})

const { factOf } = require(path.join(__dirname, '..', 'utils', 'practice', 'multiplication'))
sampleOf('division-table', 2000, 7).forEach((question) => {
  const { dividend, divisor, quotient, blank } = question
  check(dividend === divisor * quotient && divisor >= 2 && divisor <= 9 && quotient >= 1 && quotient <= 9, `除法 ${question.equation}: inside the 9×9 table`)
  check(question.answer === String({ left: dividend, right: divisor, result: quotient }[blank]), `除法 ${question.equation}: answer is the hidden number`)
  const verse = factOf(Math.min(divisor, quotient), Math.max(divisor, quotient)).verse
  check(skillOf('division').explain(question).some((step) => step.say.includes(verse)), `除法 ${question.equation}: explained with ${verse}`)
})

const signOf = (left, right) => (left > right ? '>' : left < right ? '<' : '=')
const compareSigns = new Set()
sampleOf('compare', 3000, 8).forEach((question) => {
  const leftValue = question.kind === 'expression' ? applyOperation(question.left, question.operation, question.operand) : question.left
  compareSigns.add(question.answer)
  check(question.answer === signOf(leftValue, question.right), `比大小 ${question.equation}: the sign is right`)
  check(leftValue >= 0 && leftValue <= 100 && question.right >= 0 && question.right <= 100, `比大小 ${question.equation}: numbers within 100`)
})
check(compareSigns.size === 3, '比大小: >, < and = all come up', [...compareSigns])

const column = skillOf('column')
let regrouped = 0
sampleOf('add-sub-10000', 2000, 9).forEach((question) => {
  const { left, right, operation } = question
  const result = applyOperation(left, operation, right)
  check(result >= 0 && String(result) === question.answer, `万以内 ${question.equation}: answer is right`)
  const lastWork = column.explain(question).filter((step) => step.picture).pop()
  check(lastWork.picture.result.join('') === question.answer, `万以内 ${question.equation}: the 竖式 ends with the answer`, lastWork.picture.result)
  const onesCarry = operation === '+' ? (left % 10) + (right % 10) >= 10 : left % 10 < right % 10
  const tensCarry = operation === '+' ? (Math.floor(left / 10) % 10) + (Math.floor(right / 10) % 10) >= 10 : Math.floor(left / 10) % 10 < Math.floor(right / 10) % 10
  if (onesCarry || tensCarry) regrouped += 1
})
check(regrouped / 2000 > 0.4, '万以内: most questions practise 进位 / 退位', regrouped)
const thousandMinus = column.explain(column.fromMistake({ operation: '-', left: 1000, right: 456, theme: 0 }))
check(thousandMinus.filter((step) => step.picture).pop().picture.result.join('') === '544' && thousandMinus.some((step) => step.say.includes('0 被借走 1 不够')), '1000 − 456: borrowing across zeros is explained', thousandMinus.map((step) => step.say))

// ----- island map -----
const { buildIslandMap, kungfuStarsOf, routeDots } = require(path.join(__dirname, '..', 'utils', 'practice', 'island-map'))
let map = buildIslandMap('math', {}, {})
check(map.islands.length === 5 && map.islands.map((island) => island.order).join() === '1,2,3,4,5', 'five islands in route order')
check(map.islands[0].isNextStop && map.nextStop === '数数岛' && !map.allMastered, 'a new player starts at 数数岛')
check(map.islands.every((island) => !island.foggy), 'every island has something to play since 二期')
check(map.islands[1].starsTotal === 9 && map.islands[3].starsTotal === 6, 'stars add up per playable unit (凑十岛: 3 units; 口诀岛: 九九 + 除法)')
const streakMap = buildIslandMap('math', { 'add-sub-10': { solved: 40, bestStreak: 23 } }, {})
const streakUnit = streakMap.islands.flatMap((island) => island.units).find((unit) => unit.id === 'add-sub-10')
check(streakUnit.bestStreakText === '最多连对 23 题' && streakMap.islands[0].units[0].bestStreakText === '', 'unit cards show the longest run of correct answers once there is one', streakUnit)
const threeStars = (unitIds) => Object.fromEntries(unitIds.map((unitId) => [unitId, { bestStars: 3 }]))
const ALL_UNITS = ['split-10', 'add-sub-10', 'add-sub-20', 'chain-add-sub', 'compare', 'add-sub-100', 'division-table', 'add-sub-10000']
map = buildIslandMap('math', threeStars(['split-10', 'add-sub-10']), {})
check(map.islands[0].flagged && map.islands[1].isNextStop, 'three stars on every playable unit flags the island and moves the next stop on')
map = buildIslandMap('math', threeStars(['split-10', 'add-sub-10', 'division-table']), { grandmaster: true })
check(map.islands[1].isNextStop && map.islands[3].flagged, 'skipping is fine: a later island can be flagged before an earlier one is done')
map = buildIslandMap('math', threeStars(ALL_UNITS), { grandmaster: true })
check(map.allMastered && !map.islands.some((island) => island.isNextStop), 'everything mastered: no next stop, mascot cheers instead')
// recommendation: monsters first, then unfinished, then new, then long-unvisited
const NOW = Date.UTC(2026, 9, 14, 4)
const keyDaysAgo = (days) => new Date(NOW + 8 * 3600 * 1000 - days * 86400 * 1000).toISOString().slice(0, 10).replace(/-/g, '')
const played = (stars, extra = {}) => ({ bestStars: stars, solved: 10, lastPracticed: keyDaysAgo(0), ...extra })
let recommendation = buildIslandMap('math', {}, {}, NOW).recommendation
check(recommendation.reason === 'explore' && recommendation.unitId === 'split-10', 'a new player is sent exploring the first unit', recommendation)
recommendation = buildIslandMap('math', { 'split-10': played(3), 'add-sub-10': played(3), 'add-sub-20': played(1) }, {}, NOW).recommendation
check(recommendation.reason === 'improve' && recommendation.unitId === 'add-sub-20', 'a started unit without three stars comes before new ones', recommendation)
recommendation = buildIslandMap('math', { 'add-sub-20': played(1), 'add-sub-100': played(3, { mistakeCount: 4 }), compare: played(3, { mistakeCount: 7 }), 'split-10': played(2, { mistakeCount: 5 }) }, {}, NOW).recommendation
check(recommendation.reason === 'monsters' && recommendation.unitId === 'compare' && recommendation.mistakeCount === 7, '5 or more monsters beat everything, the most first', recommendation)
const allThree = Object.fromEntries(['split-10', 'add-sub-10', 'add-sub-20', 'chain-add-sub', 'compare', 'add-sub-100', 'division-table', 'add-sub-10000'].map((unitId) => [unitId, played(3)]))
map = buildIslandMap('math', { ...allThree, 'add-sub-100': played(3, { lastPracticed: keyDaysAgo(9) }), compare: played(3, { lastPracticed: keyDaysAgo(12) }) }, { grandmaster: true, masteredRows: 9 }, NOW)
check(map.allMastered && map.recommendation.reason === 'review' && map.recommendation.unitId === 'compare' && map.islands[1].isNextStop, 'all mastered: the unit left longest (7+ days) is suggested for a visit', map.recommendation)
map = buildIslandMap('math', { ...allThree, compare: played(3, { lastPracticed: keyDaysAgo(6) }) }, { grandmaster: true, masteredRows: 9 }, NOW)
check(map.allMastered && map.recommendation === null, 'all mastered and recently practised: no suggestion', map.recommendation)
recommendation = buildIslandMap('math', { 'split-10': played(3), 'add-sub-10': played(3), 'add-sub-20': played(3), 'chain-add-sub': played(3), compare: played(3), 'add-sub-100': played(3) }, { masteredRows: 2 }, NOW).recommendation
check(recommendation.reason === 'improve' && recommendation.unitId === 'multiplication', '九九神功 started (a row mastered) but not 大成 counts as unfinished', recommendation)
const unitCard = (stats) => buildIslandMap('math', { 'add-sub-20': stats }, {}, NOW).islands[1].units.find((unit) => unit.id === 'add-sub-20').badges
check(JSON.stringify(unitCard({})) === JSON.stringify({ stars: false, fullScore: false, cleared: false }), 'badges start unlit')
check(unitCard({ bestStars: 3, exams: [{ level: 1, best: 100 }], caught: 2, mistakeCount: 0 }).cleared && unitCard({ bestStars: 3, exams: [{ level: 1, best: 100 }] }).fullScore, 'badges: three stars, a 100 on any level, monsters caught and none left')
check(!unitCard({ caught: 0, mistakeCount: 0 }).cleared && !unitCard({ caught: 3, mistakeCount: 1 }).cleared, '收容所 badge needs monsters caught and none left')

check(kungfuStarsOf({}) === 0 && kungfuStarsOf({ masteredRows: 3 }) === 1 && kungfuStarsOf({ masteredRows: 9 }) === 2 && kungfuStarsOf({ grandmaster: true }) === 3, '九九神功 stars: started, all rows, grandmaster')
const dots = routeDots([{ x: 30, y: 100 }, { x: 70, y: 500 }, { x: 30, y: 900 }])
const dotPoints = dots.map((dot) => {
  const [, left, top] = dot.style.match(/left: ([\d.]+)%; top: (\d+)rpx/)
  return { x: (Number(left) / 100) * 750, y: Number(top), leg: dot.id.split('-')[0] }
})
const gaps = dotPoints.slice(1).flatMap((point, index) => {
  const previous = dotPoints[index]
  return point.leg === previous.leg ? [Math.hypot(point.x - previous.x, point.y - previous.y)] : []
})
check(dots.length > 18 && new Set(dotPoints.map((point) => point.leg)).size === 2, 'route dots between every pair of islands', dots[0])
check(gaps.every((gap) => gap > 30 && gap < 42), 'dots are evenly spaced along the route, never bunched', gaps)
check(/animation-delay: 0.00s/.test(dots[0].style) && /animation-delay: 0.12s/.test(dots[1].style) && dots.every((dot) => dot.style.includes(`animation-duration: ${(dots.length * 0.12).toFixed(2)}s`)), 'the light runs from the first dot to the last, one loop for all', dots[1])

console.log(failed ? `${failed} math park checks failed` : 'all math park checks passed')
process.exitCode = failed ? 1 : 0
