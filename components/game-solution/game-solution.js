const { describePoemSource } = require('../../utils/games')

Component({
  properties: {
    gameType: { type: String, value: 'idiom' },
    solution: { type: Object, value: null },
    compact: { type: Boolean, value: false }
  },

  data: {
    poemSource: ''
  },

  observers: {
    solution(solution) {
      this.setData({ poemSource: describePoemSource(solution) })
    }
  }
})
