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

console.log(failed ? `${failed} template checks failed` : `all ${templates.length} templates checked`)
process.exitCode = failed ? 1 : 0
