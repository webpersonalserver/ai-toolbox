// Runs every test suite in order and stops at the first failure: node tests/run-all.js
const { spawnSync } = require('child_process')
const path = require('path')

const SUITES = ['api', 'practice', 'math-park', 'multiplication', 'levels', 'templates', 'boundaries', 'daily', 'lobby']

for (const suite of SUITES) {
  const { status, stdout, stderr } = spawnSync(process.execPath, [path.join(__dirname, `${suite}.test.js`)], { encoding: 'utf8' })
  const lastLine = stdout.trim().split('\n').pop()
  if (status !== 0) {
    console.log(stdout.split('\n').filter((line) => line.startsWith('FAIL')).join('\n'))
    console.log(stderr.split('\n').filter((line) => !line.startsWith('[rules]')).join('\n').trim())
    console.log(`✗ ${suite}: ${lastLine}`)
    process.exit(1)
  }
  console.log(`✓ ${suite}: ${lastLine}`)
}
