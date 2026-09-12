// cloudfunctions/photo/config.js — 云函数配置
// 敏感信息通过环境变量注入，不要写死在代码里
module.exports = {
  // 腾讯云凭据（部署时在云函数控制台"环境变量"中配置，或本地测试时写在 .env 里）
  SECRET_ID: process.env.TENCENT_SECRET_ID || '',
  SECRET_KEY: process.env.TENCENT_SECRET_KEY || '',

  // COS 存储桶（用户数据）
  BUCKET: process.env.COS_BUCKET || 'ai-toolbox-1257738513',
  REGION: process.env.COS_REGION || 'ap-guangzhou',

  // 业务参数
  FREE_QUOTA: 3,            // 每用户每月免费次数
  MEMBER_MONTHLY: 9.9       // 会员价（分单位在支付时使用，这里仅为展示）
}
