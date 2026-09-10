// utils/config.js — 全局配置
module.exports = {
  // 后端 API 地址（自有服务器方案）；若用云开发，此配置可去掉
  API_BASE: 'https://your-domain.com/api',

  // AI 能力开关（联调时替换为真实服务）
  FEATURES: {
    restore: true,   // 老照片修复
    idphoto: true    // 证件照
  },

  // 证件照规格预设
  ID_SPECS: [
    { id: 'one_inch',   name: '一寸',   px: '295×413',  bg: ['#FFFFFF', '#438EDB', '#FF0000'] },
    { id: 'two_inch',   name: '二寸',   px: '413×579',  bg: ['#FFFFFF', '#438EDB', '#FF0000'] },
    { id: 'small_two',  name: '小二寸', px: '413×531',  bg: ['#FFFFFF', '#438EDB'] },
    { id: 'exam',       name: '考试照', px: '295×413',  bg: ['#FFFFFF'] }
  ]
}
