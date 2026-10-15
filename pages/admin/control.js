const { admin } = require('../../utils/api')

// Every switch the cloud knows (cloudfunctions/api/lib/switches.js), grouped by the part of the app it changes.
// scene: where players meet it; controls: what it is for; onText / offText: what players see in each state;
// defaultOn: the state before anyone flips it.
const SWITCH_GROUPS = [
  {
    module: '大厅 · 口算竞速',
    switches: [
      {
        key: 'sprintWeeklyReset',
        name: '排行榜每周清零',
        scene: '大厅点「口算竞速」，选好岛屿后页面下方的排行榜',
        controls: '口算竞速的排行榜是每周重新排，还是一直累计',
        onText: '每周一 0 点（北京时间）重新开始排名，每人记本周最好的一次',
        offText: '不清零，一直按历史最好成绩排名',
        defaultOn: true
      },
      {
        key: 'sprintStaminaCost',
        type: 'number',
        name: '每次挑战扣体力',
        scene: '大厅点「口算竞速」，选好岛屿后点「开始挑战」时',
        controls: '玩一次口算竞速要扣几点体力',
        unit: '点体力',
        defaultValue: 5,
        min: 0,
        max: 30
      }
    ]
  },
  {
    module: '大厅闯关 · 猜成语、诗词填空、歇后语',
    switches: [
      {
        key: 'pinyinAid',
        name: '闯关拼音辅助',
        scene: '大厅点进猜成语、诗词填空或歇后语的任意一关，点「开始挑战」后的答题页，答案格的正上方；好友帮忙答题的求助页也一样',
        controls: '猜成语、诗词填空、歇后语答题时，答案格上方要不要显示拼音',
        onText: '每个答案格上方显示这个字的拼音，闯关会明显变简单',
        offText: '答案格上方没有拼音，要自己认字',
        defaultOn: false
      }
    ]
  },
  {
    module: '大厅闯关 · 成语找错字',
    switches: [
      {
        key: 'typoMarkWrong',
        name: '成语找错字：标出错字',
        scene: '大厅点进成语找错字的任意一关，点「开始挑战」后，题目卡片里显示的那个成语；好友帮忙答题的求助页也一样',
        controls: '成语找错字的题目里，写错的那个字要不要标红',
        onText: '错字标成红色，孩子只要从 8 个字里选出正确的字',
        offText: '错字不标红，孩子要先自己找出是哪个字写错了，再选出正确的字，更难',
        defaultOn: true
      }
    ]
  },
  {
    module: '大厅闯关 · 全部玩法的提示',
    switches: [
      {
        key: 'hintKeepLastStep',
        name: '提示不能直接给出答案',
        scene: '大厅任意玩法的答题页，点「提示」按钮时（猜成语、诗词、歇后语揭开字；成语找错字、汉字闯关划掉错误选项）',
        controls: '提示道具能不能一直用到把答案完全揭开',
        onText: '揭字的玩法最后一个字要自己填，划选项的玩法最后剩 2 个要自己选',
        offText: '有提示道具就能一直用，可以把答案全部揭开、自动过关（提示是孩子自己的道具）',
        defaultOn: false
      }
    ]
  },
  {
    module: '全部页面 · 分享和好友求助',
    switches: [
      {
        key: 'sharing',
        name: '好友求助和分享',
        scene: '闯关页答题时和挑战失败后的「求助好友」按钮；趣味页荣誉墙的「分享我的荣誉墙」；得到奖章的弹窗、考满分的奖状、本周小结里的「分享给爸爸妈妈」；「我的」页的「晒一晒我的段位」',
        controls: '「求助好友」按钮和各处的分享按钮要不要出现',
        onText: '闯关页有「求助好友」；荣誉墙、奖章、奖状、本周小结、晒段位都有分享按钮',
        offText: '这些按钮全部隐藏，也不能发起新的求助（已经发出的求助照样能答）。微信认证前分享用不了，可以先关掉',
        defaultOn: true
      }
    ]
  },
  {
    module: '答对庆祝 · 大厅闯关、数理乐园、九九神功',
    switches: [
      {
        key: 'praiseSpeech',
        name: '答对时夸奖语音朗读',
        scene: '大厅闯关答对、数理乐园练习和考试答对、九九神功练功和考核答对时弹出的庆祝画面',
        controls: '答对弹出庆祝时要不要读出夸奖语',
        onText: '庆祝时朗读「太厉害啦」这类夸奖语（玩家自己关了声音就不读）。打开前要先把语音文件上传到云存储 speech/ 文件夹',
        offText: '只有动画和音效，不朗读',
        defaultOn: false
      }
    ]
  }
]

const toGroups = (values) =>
  SWITCH_GROUPS.map((group) => ({
    ...group,
    switches: group.switches.map((item) => {
      if (item.type === 'number') {
        const value = Number.isInteger(values[item.key]) ? values[item.key] : item.defaultValue
        return { ...item, value, highlight: true, stateText: `现在：${value} ${item.unit}`, defaultText: `默认 ${item.defaultValue}`, canLower: value > item.min, canRaise: value < item.max }
      }
      const on = typeof values[item.key] === 'boolean' ? values[item.key] : item.defaultOn
      return { ...item, on, highlight: on, stateText: on ? '现在：已开启' : '现在：已关闭', defaultText: item.defaultOn ? '默认开启' : '默认关闭' }
    })
  }))

Page({
  data: {
    loading: true,
    failed: false,
    saving: '',
    groups: toGroups({})
  },

  onShow() {
    this.load()
  },

  async load() {
    try {
      const { switches } = await admin.switches()
      this.setData({ loading: false, failed: false, groups: toGroups(switches) })
    } catch (error) {
      console.error('[control] switches unavailable', error)
      this.setData({ loading: false, failed: true })
    }
  },

  // The ? next to a switch: what it controls and what players see when it is on or off.
  showDetail(event) {
    const group = SWITCH_GROUPS.find((candidate) => candidate.switches.some((item) => item.key === event.currentTarget.dataset.key))
    const item = group.switches.find((candidate) => candidate.key === event.currentTarget.dataset.key)
    const effectLines =
      item.type === 'number'
        ? [`可以设成：${item.min}–${item.max} ${item.unit}`, `默认：${item.defaultValue} ${item.unit}`]
        : [`开启时：${item.onText}`, `关闭时：${item.offText}`, item.defaultOn ? '默认：开启' : '默认：关闭']
    const lines = [`模块：${group.module}`, `场景：${item.scene}`, `控制什么：${item.controls}`, ...effectLines]
    wx.showModal({
      title: item.name,
      content: lines.join('\n\n'),
      showCancel: false,
      confirmText: '知道了'
    })
  },

  // The data path of a switch, so a cancelled change can be put back on screen.
  switchPathOf(key) {
    for (let groupIndex = 0; groupIndex < this.data.groups.length; groupIndex += 1) {
      const itemIndex = this.data.groups[groupIndex].switches.findIndex((item) => item.key === key)
      if (itemIndex >= 0) return `groups[${groupIndex}].switches[${itemIndex}].on`
    }
    return ''
  },

  // The native switch has already flipped; data still holds the old value, so writing the new value and then the old
  // one makes the view redraw the switch back to where it was.
  restoreSwitch(key, on) {
    const path = this.switchPathOf(key)
    if (!path) return
    this.setData({ [path]: on }, () => this.setData({ [path]: !on }))
  },

  confirmChange(content = '这个开关对所有玩家生效') {
    return new Promise((resolve) => {
      wx.showModal({
        title: '确定修改？',
        content,
        success: (result) => resolve(result.confirm),
        fail: () => resolve(false)
      })
    })
  },

  // − / + on a number setting (e.g. 口算竞速 stamina): one step at a time, asked once before saving.
  async changeNumber(event) {
    const { key, step } = event.currentTarget.dataset
    const item = this.data.groups.flatMap((group) => group.switches).find((candidate) => candidate.key === key)
    const value = Math.min(item.max, Math.max(item.min, item.value + Number(step)))
    if (value === item.value || !(await this.confirmChange(`改成 ${value} ${item.unit}，对所有玩家生效`))) return
    this.setData({ saving: key })
    try {
      const { switches } = await admin.updateSwitches({ [key]: value })
      this.setData({ groups: toGroups(switches) })
      wx.showToast({ title: `已改成 ${value}`, icon: 'success' })
    } catch (error) {
      console.error('[control] setting not saved', error)
      wx.showToast({ title: error.message || '没保存上，再试一次', icon: 'none' })
      this.load()
    } finally {
      this.setData({ saving: '' })
    }
  },

  // Every switch is live for all players at once, so a stray tap must not change anything without a second yes.
  async toggle(event) {
    const { key } = event.currentTarget.dataset
    const on = event.detail.value
    if (!(await this.confirmChange())) {
      this.restoreSwitch(key, on)
      return
    }
    this.setData({ saving: key })
    try {
      const { switches } = await admin.updateSwitches({ [key]: on })
      this.setData({ groups: toGroups(switches) })
      wx.showToast({ title: on ? '已开启' : '已关闭', icon: 'success' })
    } catch (error) {
      console.error('[control] switch not saved', error)
      wx.showToast({ title: error.message || '没保存上，再试一次', icon: 'none' })
      this.load()
    } finally {
      this.setData({ saving: '' })
    }
  }
})
