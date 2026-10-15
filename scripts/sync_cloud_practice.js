// Copies the question makers the lobby challenges need (口算闯关, 口算竞速) into the cloud function, so the cloud
// makes and checks the same questions the phone shows. Run after changing anything under utils/practice/skills,
// catalog.js or multiplication.js:  node scripts/sync_cloud_practice.js
// tests/boundaries.test.js fails while the two copies differ.
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SOURCE = path.join(ROOT, 'utils', 'practice')
const TARGET = path.join(ROOT, 'cloudfunctions', 'api', 'lib', 'practice')
const FILES = ['catalog.js', 'multiplication.js', ...fs.readdirSync(path.join(SOURCE, 'skills')).filter((name) => name.endsWith('.js')).map((name) => `skills/${name}`)]

const HEADER = '// Copied from utils/practice by scripts/sync_cloud_practice.js — edit the original, then run the script.\n'

const sync = () => {
  fs.rmSync(TARGET, { recursive: true, force: true })
  FILES.forEach((file) => {
    const target = path.join(TARGET, file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, HEADER + fs.readFileSync(path.join(SOURCE, file), 'utf8'))
  })
  return FILES
}

if (require.main === module) {
  const files = sync()
  console.log(`copied ${files.length} files to ${path.relative(ROOT, TARGET)}`)
}

module.exports = { FILES, HEADER, SOURCE, TARGET }
