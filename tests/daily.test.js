// 每日挑战 on the phone: the same date gives the same 10 questions, and the page's generator matches the cloud's.
const path = require('path')
const Module = require('module')

let failed = 0
const check = (condition, label, detail) => {
  if (condition) return
  failed += 1
  console.log('FAIL', label, detail === undefined ? '' : JSON.stringify(detail))
}

const resolveFilename = Module._resolveFilename
Module._resolveFilename = function resolveWithFakeSdk(request, ...rest) {
  return request === 'wx-server-sdk' ? path.join(__dirname, 'support', 'fake-wx-server-sdk.js') : resolveFilename.call(this, request, ...rest)
}
const cloud = require(path.join(__dirname, '..', 'cloudfunctions', 'api', 'handlers', 'daily'))
const client = require(path.join(__dirname, '..', 'utils', 'daily'))
const { skillOf } = require(path.join(__dirname, '..', 'utils', 'practice', 'skills', 'index'))
const { unitOf } = require(path.join(__dirname, '..', 'utils', 'practice', 'catalog'))

const cloudRandom = cloud.seededRandom('math:20261014')
const clientRandom = client.seededRandom('math:20261014')
check(Array.from({ length: 50 }, () => cloudRandom() === clientRandom()).every(Boolean), 'phone and cloud share the same seeded generator')

const hanzi = [1, 2, 3, 4, 5].map((index) => ({ id: `hanzi_${index}`, kind: 'pinyin', prompt: '读一读', clue: 'shuǐ', board: ['水', '木', '火', '土'], answer: '水', word: '' }))
const today = buildFor('20261014')
function buildFor(dateKey) {
  return client.buildChallenge({ dateKey, hanzi, mathCount: 5 })
}
check(today.length === 10 && today.map((question) => question.subject).join() === 'hanzi,math,hanzi,math,hanzi,math,hanzi,math,hanzi,math', '10 questions, 字 and 算 taking turns', today.map((question) => question.subject))
check(JSON.stringify(buildFor('20261014')) === JSON.stringify(today), 'the same day always gives the same challenge')
check(JSON.stringify(buildFor('20261015')) !== JSON.stringify(today), 'the next day gives new sums')
const sums = today.filter((question) => question.subject === 'math')
check(sums.every((question, index) => skillOf(unitOf(client.MATH_UNIT_IDS[index]).skill).check(question, question.answer)), 'every sum checks its own answer')
check(sums.every((question) => question.tokens.filter((token) => token === '').length === 1 && question.revealText.includes(question.equation)), 'every sum has one blank and shows its answer when missed')
check(new Set(sums.map((question) => question.id)).size === 5, 'sums have their own ids')

const days = Array.from({ length: 60 }, (_, index) => `202611${String(index + 1).padStart(2, '0')}`)
check(days.every((dateKey) => new Set(cloud.pickLevelNos(dateKey, 400)).size === 5 && cloud.pickLevelNos(dateKey, 400).every((levelNo) => levelNo >= 1 && levelNo <= 400)), 'the cloud picks 5 different 汉字 levels within range every day')
check(JSON.stringify(cloud.pickLevelNos('20261014', 400)) === JSON.stringify(cloud.pickLevelNos('20261014', 400)), 'the same day picks the same 汉字 levels')
check(cloud.pickLevelNos('20261014', 3).length === 3, 'fewer levels than questions: uses what there is')

console.log(failed ? `${failed} daily checks failed` : 'all daily checks passed')
process.exitCode = failed ? 1 : 0
