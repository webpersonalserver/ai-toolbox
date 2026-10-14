// Draws a picture a skill asks for:
// - frames: ten-frames { frames: [[tone × 10]] } (tone 'a' / 'b', 'x' = taken away, '' = empty)
// - sticks: bundles of ten plus loose sticks { groups: [{ bundles, ones, tone }] }
// - groups: equal shares for division { groups: [size, size, …] }
// - column: a 竖式 { symbol, marks, top, bottom, result, focus } (rows are equal-length arrays of digits or '')
const range = (count) => Array.from({ length: count }, (_, index) => index)

const EMPTY = { frames: [], groups: [], shares: [], column: null }

const toView = (picture) => {
  if (picture.type === 'frames') return { ...EMPTY, frames: picture.frames.map((cells, index) => ({ id: index, rows: [cells.slice(0, 5), cells.slice(5, 10)] })) }
  if (picture.type === 'groups') return { ...EMPTY, shares: picture.groups.map((size, index) => ({ id: index, dots: range(size) })) }
  if (picture.type === 'column') {
    const cellsOf = (row) => row.map((text, index) => ({ id: index, text, focus: index === picture.focus }))
    return {
      ...EMPTY,
      column: { symbol: picture.symbol, marks: cellsOf(picture.marks), top: cellsOf(picture.top), bottom: cellsOf(picture.bottom), result: cellsOf(picture.result) }
    }
  }
  return { ...EMPTY, groups: picture.groups.map((group, index) => ({ id: index, tone: group.tone, bundles: range(group.bundles), ones: range(group.ones) })) }
}

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    picture: { type: Object, value: null },
    size: { type: String, value: 'small' }
  },

  data: EMPTY,

  observers: {
    picture(picture) {
      this.setData(picture ? toView(picture) : EMPTY)
    }
  }
})
