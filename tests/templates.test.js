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

const componentDirs = ['components', 'packageMath/components']
  .filter((dir) => fs.existsSync(path.join(ROOT, dir)))
  .flatMap((dir) => fs.readdirSync(path.join(ROOT, dir)).map((name) => `${dir}/${name}/${name}`))
const subPackagePages = (app.subPackages || []).flatMap((subPackage) => subPackage.pages.map((page) => `${subPackage.root}/${page}`))
const templates = [...app.pages, ...subPackagePages, ...componentDirs]

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
const allPages = [...app.pages, ...subPackagePages]
allPages.forEach((page) => {
  const js = fs.readFileSync(path.join(ROOT, `${page}.js`), 'utf8')
  if (js.includes('onShareAppMessage')) check(/utils\/share'\)/.test(js), `${page} builds its share card from utils/share.js`)
})

// A button rule that turns the text white must also set its own background; otherwise it can inherit the white
// .btn--ghost fill and the label disappears (this happened on the certificate's 看成绩 button).
const WHITE_TEXT = /color:\s*(var\(--color-on-accent\)|#fff\b|#ffffff\b|white\b)/i
const styleFiles = ['app.wxss', ...templates.map((base) => `${base}.wxss`)].filter((file) => fs.existsSync(path.join(ROOT, file)))
styleFiles.forEach((file) => {
  const css = fs.readFileSync(path.join(ROOT, file), 'utf8')
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/\.btn\b/.test(selector) && WHITE_TEXT.test(body)) {
      check(/background/.test(body), `${file}: "${selector.trim()}" makes button text white without its own background`)
    }
  }
})

// The mini program's require() does not look for index.js inside a folder (Node does, so other tests would pass):
// a require that points at a folder leaves the page blank on the phone.
const CODE_DIRS = ['app.js', 'utils', 'pages', 'packageMath', 'components']
const jsFilesIn = (relative) => {
  const absolute = path.join(ROOT, relative)
  if (!fs.existsSync(absolute)) return []
  if (fs.statSync(absolute).isFile()) return relative.endsWith('.js') ? [relative] : []
  return fs.readdirSync(absolute).flatMap((name) => jsFilesIn(path.join(relative, name)))
}
CODE_DIRS.flatMap(jsFilesIn).forEach((file) => {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8')
  ;[...source.matchAll(/require\('(\.[^']+)'\)/g)].forEach(([, request]) => {
    const target = path.join(ROOT, path.dirname(file), request)
    const isFolder = fs.existsSync(target) && fs.statSync(target).isDirectory() && !fs.existsSync(`${target}.js`)
    check(!isFolder, `${file}: require('${request}') points at a folder, write '${request}/index'`)
  })
})

console.log(failed ? `${failed} template checks failed` : `all ${templates.length} templates checked`)
process.exitCode = failed ? 1 : 0
