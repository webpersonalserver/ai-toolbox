const STAR_SLOTS = [1, 2, 3]
const GRANDMASTER_CHARACTERS = ['神', '功', '大', '成']

// Ending panel for a 修炼 or 考核: breakthrough (stars), grandmaster (scroll + seal) or fail (review list).
Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    visible: { type: Boolean, value: false },
    kind: { type: String, value: 'breakthrough' },
    heading: { type: String, value: '' },
    title: { type: String, value: '' },
    subtitle: { type: String, value: '' },
    stars: { type: Number, value: 0 },
    lines: { type: Array, value: [] },
    actions: { type: Array, value: [] }
  },

  data: {
    starSlots: STAR_SLOTS,
    grandmasterCharacters: GRANDMASTER_CHARACTERS
  },

  methods: {
    noop() {},

    handleAction(event) {
      this.triggerEvent('action', { key: event.currentTarget.dataset.key })
    }
  }
})
