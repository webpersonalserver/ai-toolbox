// Copied from utils/practice by scripts/sync_cloud_practice.js — edit the original, then run the script.
// Small helpers every skill uses: random picks, ten-frames, stick bundles and explanation steps.
const TEN = 10
const FRAME_SIZE = 10

const randomInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1))
const pick = (rng, list) => list[Math.floor(rng() * list.length)]
const chance = (rng, ratio) => rng() < ratio

// Ten-frames: each frame is 10 cells; a cell holds a tone ('a' first number, 'b' second number) or '' when empty.
const framesOf = (segments) => {
  const cells = segments.flatMap(({ count, tone }) => Array(count).fill(tone))
  const frameCount = Math.max(1, Math.ceil(cells.length / FRAME_SIZE))
  return Array.from({ length: frameCount }, (_, index) => {
    const frame = cells.slice(index * FRAME_SIZE, (index + 1) * FRAME_SIZE)
    return [...frame, ...Array(FRAME_SIZE - frame.length).fill('')]
  })
}

const framePicture = (segments) => ({ type: 'frames', frames: framesOf(segments) })
const twoColorFrames = (first, second) => framePicture([{ count: first, tone: 'a' }, { count: second, tone: 'b' }])
// Two numbers side by side, each starting on its own frame, so they can be compared at a glance.
const separateFrames = (first, second) => ({
  type: 'frames',
  frames: [...framesOf([{ count: first, tone: 'a' }]), ...framesOf([{ count: second, tone: 'b' }])]
})

const sticksOf = (value, tone = 'a') => ({ bundles: Math.floor(value / TEN), ones: value % TEN, tone })
const sticksPicture = (values) => ({ type: 'sticks', groups: values.map((value, index) => sticksOf(value, index ? 'b' : 'a')) })

const step = (say, math, picture = null) => ({ say, math, picture })

const isWholeNumber = (value, min = 0, max = Infinity) => Number.isInteger(value) && value >= min && value <= max

module.exports = {
  TEN,
  randomInt,
  pick,
  chance,
  framesOf,
  framePicture,
  twoColorFrames,
  separateFrames,
  sticksOf,
  sticksPicture,
  step,
  isWholeNumber
}
