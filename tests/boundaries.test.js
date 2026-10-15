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

// The cloud's copy of the question makers (口算闯关, 口算竞速) must match the phone's, or the two would disagree on answers.
const practiceCopy = require(path.join(ROOT, 'scripts', 'sync_cloud_practice.js'))
practiceCopy.FILES.forEach((file) => {
  const target = path.join(practiceCopy.TARGET, file)
  const expected = practiceCopy.HEADER + fs.readFileSync(path.join(practiceCopy.SOURCE, file), 'utf8')
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== expected) {
    failed += 1
    console.log(`FAIL cloud copy of utils/practice/${file} is out of date: run node scripts/sync_cloud_practice.js`)
  }
})

// 识字竞速's pool is built from the 汉字闯关 levels; an edited level must reach the cloud's copy too.
const hanziSprint = require(path.join(ROOT, 'scripts', 'build_hanzi_sprint.js'))
if (!fs.existsSync(hanziSprint.TARGET) || fs.readFileSync(hanziSprint.TARGET, 'utf8') !== hanziSprint.buildPool()) {
  failed += 1
  console.log('FAIL the 识字竞速 pool is out of date: run node scripts/build_hanzi_sprint.js')
}

// The pages' list of 竞速 tracks (utils/sprint.js) must match the cloud's (lib/sprint-tracks.js).
const sprintTracks = require(path.join(ROOT, 'cloudfunctions', 'api', 'lib', 'sprint-tracks.js'))
const { SPRINT_SUBJECTS } = require(path.join(ROOT, 'utils', 'sprint.js'))
Object.values(SPRINT_SUBJECTS).forEach((subject) => {
  const cloudTracks = sprintTracks.tracksOf(subject.id).map((track) => `${track.id}:${track.name}`).join()
  const pageTracks = subject.tracks.map((track) => `${track.id}:${track.name}`).join()
  if (cloudTracks !== pageTracks) {
    failed += 1
    console.log(`FAIL ${subject.name} tracks differ: pages ${pageTracks} / cloud ${cloudTracks}`)
  }
})

console.log(failed ? `${failed} boundary checks failed` : 'all migration boundaries hold')
process.exitCode = failed ? 1 : 0
