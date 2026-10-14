const PRACTICES = [
  {
    // 'math': 数理乐园 (it took over the old 加减运算 record and chests).
    id: 'math',
    name: '数理乐园',
    intro: '跟着喵算算登岛闯关：分与合、加减、比大小、除法',
    icon: '算',
    entryUrl: '/packageMath/pages/map/map',
    chestName: '数理乐园宝箱',
    chestHint: '答对题数和连对数达标就能攒宝箱'
  },
  {
    id: 'multiplication',
    name: '乘法口诀 · 九九神功',
    intro: '九重秘籍逐层修炼，九九大挑战练成神功',
    icon: '乘',
    entryUrl: '/pages/practice/multiplication/index',
    chestName: '九九神功宝箱',
    chestHint: '每练成一重、拿到三星、神功大成都能得宝箱'
  }
]

module.exports = { PRACTICES }
