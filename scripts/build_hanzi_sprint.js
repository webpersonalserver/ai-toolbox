// Builds the question pool of 识字竞速 from the 汉字闯关 levels (database/levels/hanzi.json): every level is already a
// reviewed four-choice question. The cloud function cannot read the database folder, so the pool is written into it.
// Run after changing the 汉字 levels:  node scripts/build_hanzi_sprint.js
// tests/boundaries.test.js fails while the pool is out of date.
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SOURCE = path.join(ROOT, 'database', 'levels', 'hanzi.json')
const TARGET = path.join(ROOT, 'cloudfunctions', 'api', 'data', 'hanzi-sprint-pool.json')

// { 一年级: [[kind, prompt, clue, choices, answer], …], 二年级: […] } in level order.
const buildPool = () => {
  const pool = {}
  fs.readFileSync(SOURCE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .sort((left, right) => left.levelNo - right.levelNo)
    .forEach((level) => {
      pool[level.stage] = pool[level.stage] || []
      pool[level.stage].push([level.kind, level.prompt, level.clue, level.board, level.answer])
    })
  return `${JSON.stringify(pool)}\n`
}

if (require.main === module) {
  fs.writeFileSync(TARGET, buildPool())
  console.log(`wrote ${path.relative(ROOT, TARGET)}`)
}

module.exports = { buildPool, TARGET }
