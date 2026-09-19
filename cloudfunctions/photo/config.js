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

  // ---------- 开发者 / 体验成员 免额度 ----------
  // ① 开发版 + 体验版自动不限次：小程序后台的「开发者」和「体验成员」才能打开
  //    develop / trial 版本，所以这两类成员天然免额度，无需任何配置。
  //    正式上线后不想保留，把云函数环境变量 ENV_FREE 设为 false 即可。
  ENV_FREE: String(process.env.ENV_FREE || 'true').toLowerCase() === 'true',

  // ② 开发者口令：在「我的」页连点标题 5 次唤出入口令框，输入正确即把当前
  //    微信永久写入 members 白名单（level=free、不限次、永久有效）。
  //    建议在云函数环境变量里改成自己的口令；DEV_PASS 留空则关闭该功能。
  DEV_PASS: process.env.DEV_PASS || 'aitool2026',

  // ---------- 联调测试开关（正式上线前务必关闭）----------
  // DEV_UNLIMITED=true  → 所有用户不校验免费额度
  // DEV_OPENIDS=oXxx,oYyy → 仅这些 openid 不校验额度（等价于临时白名单，无需建库）
  // 两者都未配置时走「白名单/会员 → 免费额度」正常逻辑。
  DEV_UNLIMITED: String(process.env.DEV_UNLIMITED || '').toLowerCase() === 'true',
  DEV_OPENIDS,

  // ---------- 证件照规格（像素，与小程序 utils/config.js 的 id 对应）----------
  // ---------- 证件照构图（像素示意：295×413 为一寸）----------
  ID_SPECS: {
    one_inch:  { w: 295, h: 413, name: '一寸' },
    two_inch:  { w: 413, h: 579, name: '二寸' },
    small_two: { w: 413, h: 531, name: '小二寸' },
    exam:      { w: 295, h: 413, name: '考试照' }
  },
  ID_SPEC_DEFAULT: 'one_inch',

  // 统一底片比例（宽/高）：所有规格都先用这一个比例做人脸居中裁剪。
  // 这样"同一张照片换尺寸"= 同一份人像等比缩放，而不是每个尺寸重新裁剪一遍，
  // 否则不同规格裁出来的构图（肩宽、留白）会不一致。
  ID_BASE_RATIO: Number(process.env.ID_BASE_RATIO || 0.78),

  // 人像在画布中的构图（以"头部"为标尺，非整人包围盒），对齐标准证件照规范：
  //   头部（发际→下巴）占画面高约 2/3；脸宽约占画面宽 50%~60%；头顶留白约 10%
  //   headW/headH 测量含头发/含脖颈，因此标尺取 60%/62%（换算后正好落在规范区间）
  //   头部识别失败时回退旧逻辑：肩宽最多 92%、人像高度不低于 72%
  ID_TOP_RATIO: Number(process.env.ID_TOP_RATIO || 0.10),
  ID_HEAD_HEIGHT_RATIO: Number(process.env.ID_HEAD_HEIGHT_RATIO || 0.62),
  ID_HEAD_WIDTH_RATIO: Number(process.env.ID_HEAD_WIDTH_RATIO || 0.60),
  ID_WIDTH_RATIO: Number(process.env.ID_WIDTH_RATIO || 0.92),
  ID_MIN_HEIGHT_RATIO: Number(process.env.ID_MIN_HEIGHT_RATIO || 0.72),

  // 抠图输入的最大边长：过大会明显增加数据万象失败/超时概率（实测 933×1200 偶发返回原图）
  ID_MATTE_MAX_SIDE: Number(process.env.ID_MATTE_MAX_SIDE || 1000)
}
