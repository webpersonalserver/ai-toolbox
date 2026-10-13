const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const MIN_TEMPLATE_LINES = 6
const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))

let failed = 0
const check = (condition, label) => {
  if (condition) return
  failed += 1
  console.log('FAIL', label)
}

const componentDirs = fs.readdirSync(path.join(ROOT, 'components')).map((name) => `components/${name}/${name}`)
const templates = [...app.pages, ...componentDirs]

templates.forEach((base) => {
  const wxmlPath = path.join(ROOT, `${base}.wxml`)
  const jsPath = path.join(ROOT, `${base}.js`)
  if (!fs.existsSync(wxmlPath)) return check(false, `${base}.wxml missing`)
  const wxml = fs.readFileSync(wxmlPath, 'utf8')
  const js = fs.readFileSync(jsPath, 'utf8')
  check(wxml.split('\n').filter((line) => line.trim()).length >= MIN_TEMPLATE_LINES || base.startsWith('components/'), `${base}.wxml looks empty`)
  check(!/\|\|/.test(wxml), `${base}.wxml uses || (not supported in WXML, compute it in JS)`)
  const handlers = new Set([...wxml.matchAll(/(?:bind|catch)[a-z:]*="([a-zA-Z]+)"/g)].map((match) => match[1]))
  handlers.forEach((handler) => check(new RegExp(`^ +(async )?${handler}\\(`, 'm').test(js), `${base}: handler ${handler} not defined`))
})

// Share cards: every picture exists and stays small; every page that can be shared builds its card from utils/share.js.
const MAX_SHARE_IMAGE_BYTES = 128 * 1024
const share = require(path.join(ROOT, 'utils', 'share'))
const shareCards = Object.values(share).flatMap((entry) =>
  typeof entry === 'function' ? [entry('测试', 1, 'abc')] : [entry]
)
// Pictures may live in cloud storage (https); then the source files in design/share are checked instead.
const SOURCE_SHARE_DIR = path.join(ROOT, 'design', 'share')
const localPictureOf = (imageUrl) =>
  /^https:\/\//.test(imageUrl) ? path.join(SOURCE_SHARE_DIR, path.basename(imageUrl)) : path.join(ROOT, imageUrl)
shareCards.forEach((card) => {
  check(Boolean(card.imageUrl), `share card "${card.title}" has a picture`)
  if (!card.imageUrl) return
  const picture = localPictureOf(card.imageUrl)
  check(fs.existsSync(picture), `${card.imageUrl} exists (${path.relative(ROOT, picture)})`)
  if (fs.existsSync(picture)) check(fs.statSync(picture).size <= MAX_SHARE_IMAGE_BYTES, `${card.imageUrl} is under 128KB`)
})
app.pages.forEach((page) => {
  const js = fs.readFileSync(path.join(ROOT, `${page}.js`), 'utf8')
  if (js.includes('onShareAppMessage')) check(/utils\/share'\)/.test(js), `${page} builds its share card from utils/share.js`)
})

console.log(failed ? `${failed} template checks failed` : `all ${templates.length} templates checked`)
process.exitCode = failed ? 1 : 0
