// Every line 喵算算 says in 数理乐园. Change the tone here, not in the pages.
const { imagesOf } = require('../assets')

// images: illustrated moods cut out by scripts/prepare_art.py. cheer (fists up) encourages after a so-so round,
// wink goes with the step-by-step explanations.
const MASCOT = {
  name: '喵算算',
  emoji: '🐱',
  images: {
    normal: '/assets/mascot/normal.png',
    happy: '/assets/mascot/happy.png',
    cheer: '/assets/mascot/cheer.png',
    wink: '/assets/mascot/wink.png'
  }
}

const COPY = {
  start: '出发冒险！',
  // Endless mode: no question limit, the goal is the longest run of correct answers.
  endless: '继续挑战，看能连对几题',
  nextRound: '再来一轮（10 题）',
  explainButton: '🐱 喵算算教你',
  explainNext: '下一步',
  explainDone: '我会啦！',
  comingSoon: '迷雾还没散开，敬请期待～',
  parkGreetings: ['喵～今天想去哪座乐园冒险呀？', '数理乐园的小岛们在等你哦！', '练一会儿就能攒小红花喵～', '准备好了吗？我们出发吧！'],
  openTag: '开放中',
  buildingTag: '🚧 建造中',
  monsterHouse: '🐾 小怪兽藏身洞',
  monsterHouseEmpty: '藏身洞空空的，一只小怪兽都没有，你太棒啦！',
  monsterCaught: '抓到一只小怪兽！',
  monsterAllCaught: '小怪兽全部抓回来啦！',
  monsterRound: '再抓一轮！',
  nextStop: (islandName) => `下一站：${islandName}！`,
  // Why the boat waits where it does (see recommendationOf in island-map.js).
  recommend: {
    monsters: ({ unitName, mistakeCount }) => `「${unitName}」有 ${mistakeCount} 只小怪兽在等你抓喵～`,
    improve: ({ unitName }) => `「${unitName}」再冲一冲三星！`,
    explore: ({ islandName, unitName }) => `去${islandName}探险吧，试试「${unitName}」～`,
    review: ({ islandName, unitName }) => `好久没去${islandName}了，回去玩玩「${unitName}」～`
  },
  recommendGo: { monsters: '去抓小怪兽', improve: '冲三星', explore: '去探险', review: '去复习' },
  badges: { stars: '⭐ 三星', fullScore: '💯 满分', cleared: '🐾 清空' },
  weekly: '📅 本周小结',
  // 喵算算's line on the weekly report, by days practised this week (first match).
  weeklyComments: [
    { minDays: 5, line: '这周超级勤奋，喵算算为你骄傲！' },
    { minDays: 3, line: '坚持得不错，下周争取再多练一天～' },
    { minDays: 1, line: '开了个好头，每天练一会儿就会越来越厉害喵！' },
    { minDays: 0, line: '这周还没来练习哦，喵算算在岛上等你～' }
  ],
  allMastered: '所有岛屿都插上小旗啦，你是数理小达人喵！',
  correct: ['喵呜～太厉害啦！', '这题被你秒杀了！', '算得又快又准喵！', '你的小脑瓜在发光！', '完全正确，给你一朵小红花～', '喵算算都要佩服你啦！'],
  retryCorrect: ['改对啦，真了不起喵！', '想明白了就是你的啦～'],
  wrong: ['哎呀，差一丢丢～再想想喵？', '没关系，再试一次喵！', '换个办法试试看喵～', '别急，慢慢来～'],
  roundStars: {
    3: '三颗星！你是这座岛的小主人喵！',
    2: '两颗星！再来一轮冲三星吧～',
    1: '拿到一颗星啦，多练几轮会越来越棒！',
    0: '这轮有点难，喵算算陪你再试一次！'
  }
}

const pick = (lines) => lines[Math.floor(Math.random() * lines.length)]

// MASCOT with each picture swapped for its cloud link when one is known; pages set it on show.
const mascotView = () => ({ ...MASCOT, images: imagesOf(MASCOT.images) })

module.exports = { MASCOT, mascotView, COPY, pick }
