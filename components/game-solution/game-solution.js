const { describePoemSource } = require('../../utils/games')

// 猜谜语's explanation goes clue by clue, written as "麻屋子：…；红帐子：…": one line each.
const whyLinesOf = (why) => (why || '').split(/[；;]/).map((line) => line.trim().replace(/。$/, '')).filter(Boolean)

Component({
  properties: {
    gameType: { type: String, value: 'idiom' },
    solution: { type: Object, value: null },
    compact: { type: Boolean, value: false }
  },

  data: {
    poemSource: '',
    whyLines: []
  },

  observers: {
    solution(solution) {
      this.setData({ poemSource: describePoemSource(solution), whyLines: whyLinesOf(solution && solution.why) })
    }
  }
})
