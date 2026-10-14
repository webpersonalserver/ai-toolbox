const fs = require('fs')
const path = require('path')

// Migration boundary: 云开发-only calls may live only in these adapter files, so moving to 云托管 or our own
// servers means changing them and nothing else. See README「迁移设计」.
const ROOT = path.join(__dirname, '..')
const FRONTEND_DIRS = ['pages', 'packageMath', 'components', 'utils']
const FRONTEND_ADAPTERS = ['app.js', 'utils/api.js', 'utils/upload.js']
const FRONTEND_PATTERN = /wx\.cloud\b|cloud:\/\//
const BACKEND_DIRS = ['cloudfunctions/api/handlers', 'cloudfunctions/api/lib']
const BACKEND_ADAPTERS = ['cloudfunctions/api/index.js', 'cloudfunctions/api/lib/cloud.js', 'cloudfunctions/api/lib/wechat-api.js', 'cloudfunctions/api/lib/storage.js']
const BACKEND_PATTERN = /\bcloud\.(openapi|deleteFile|uploadFile|getTempFileURL|downloadFile|getWXContext|callFunction)|wx-server-sdk|cloud:\/\//

const listJs = (dir) =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${dir}/${entry.name}`
    if (entry.isDirectory()) return listJs(relative)
    return entry.name.endsWith('.js') ? [relative] : []
  })

let failed = 0
const scan = (files, adapters, pattern, side) =>
  files
    .filter((file) => !adapters.includes(file))
    .forEach((file) => {
      const offending = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n').findIndex((line) => pattern.test(line))
      if (offending >= 0) {
        failed += 1
        console.log(`FAIL ${side}: ${file}:${offending + 1} uses a 云开发-only API; move it into ${adapters.join(' / ')}`)
      }
    })

scan([...FRONTEND_DIRS.flatMap(listJs), 'app.js'], FRONTEND_ADAPTERS, FRONTEND_PATTERN, 'frontend')
scan(BACKEND_DIRS.flatMap(listJs), BACKEND_ADAPTERS, BACKEND_PATTERN, 'cloud function')

console.log(failed ? `${failed} boundary checks failed` : 'all migration boundaries hold')
process.exitCode = failed ? 1 : 0
