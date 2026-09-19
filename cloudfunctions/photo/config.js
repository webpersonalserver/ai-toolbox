// cloudfunctions/photo/config.js — 云函数配置
// 优先级：云端环境变量 > config.local.js（本地隐私文件，不入库） > 默认值
let local = {}
try { local = require('./config.local') } catch (e) { /* 文件不存在时忽略 */ }

const DEV_OPENIDS = String(process.env.DEV_OPENIDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

module.exports = {
  // 腾讯云凭据（部署时在云函数控制台"环境变量"中配置，或本地测试时写在 config.local.js 里）
  SECRET_ID: process.env.TENCENT_SECRET_ID || local.TENCENT_SECRET_ID || '',
  SECRET_KEY: process.env.TENCENT_SECRET_KEY || local.TENCENT_SECRET_KEY || '',

  // COS 存储桶（用户数据）
  BUCKET: process.env.COS_BUCKET || 'ai-toolbox-1257738513',
  REGION: process.env.COS_REGION || 'ap-guangzhou',

  // 业务参数
  FREE_QUOTA: Number(process.env.FREE_QUOTA || 3), // 每用户每月免费次数
  MEMBER_MONTHLY: 9.9,                             // 会员价（展示用）

  // ---------- 白名单 / 会员 ----------
  // members 集合：每行一个账号，字段 { openid, level: 'free'|'vip', expireAt: Date|null, disabled: bool, note }
  //   level='free'  → 免费白名单（不限次）
  //   level='vip'   → 付费会员（不限次）
  //   expireAt=null → 永久有效；填日期则到期自动失效
  // 在云开发控制台「数据库」里手动加记录即可生效，无需改代码/重新部署。
  MEMBERS_COLLECTION: process.env.MEMBERS_COLLECTION || 'members',

  // redeem_codes 集合：兑换码，字段 { code, level, days, maxUses, usedCount, expireAt, disabled, note }
  //   days=0 表示永久；maxUses 限制可使用次数
  REDEEM_COLLECTION: process.env.REDEEM_COLLECTION || 'redeem_codes',

  // ---------- 联调测试开关（正式上线前务必关闭）----------
  // DEV_UNLIMITED=true  → 所有用户不校验免费额度
  // DEV_OPENIDS=oXxx,oYyy → 仅这些 openid 不校验额度（等价于临时白名单，无需建库）
  // 两者都未配置时走「白名单/会员 → 免费额度」正常逻辑。
  DEV_UNLIMITED: String(process.env.DEV_UNLIMITED || '').toLowerCase() === 'true',
  DEV_OPENIDS,

  // ---------- 证件照规格（像素，与小程序 utils/config.js 的 id 对应）----------
  ID_SPECS: {
    one_inch:  { w: 295, h: 413, name: '一寸' },
    two_inch:  { w: 413, h: 579, name: '二寸' },
    small_two: { w: 413, h: 531, name: '小二寸' },
    exam:      { w: 295, h: 413, name: '考试照' }
  },
  ID_SPEC_DEFAULT: 'one_inch',

  // 人像在画布中的目标高度占比（0.9 = 上下各留约 5% 留白）
  PORTRAIT_HEIGHT_RATIO: Number(process.env.PORTRAIT_HEIGHT_RATIO || 0.9)
}
