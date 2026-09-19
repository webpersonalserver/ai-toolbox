# ai-toolbox · AI 工具箱（微信小程序）

工具类小程序矩阵（首批：老照片修复 + AI 证件照，后续可扩展简历优化、计算器等），个人开发者虚拟支付变现项目。

## 项目信息

- **AppID**: wxb3265721f68a1847
- **类型**: 微信小程序（原生框架）+ 微信云开发
- **云环境 ID**: `cloud1-d8g9yyxwe128b2185`
- **仓库**: https://github.com/webpersonalserver/ai-toolbox
- **COS 存储桶**: `ai-toolbox-1257738513`（地域 ap-guangzhou）

## 目录结构

```
ai-toolbox/
├── app.js / app.json / app.wxss   # 小程序入口与全局配置
├── project.config.json            # 开发者工具项目配置（含 AppID、云函数目录）
├── pages/
│   ├── index/    # 首页（工具入口）
│   ├── restore/  # 老照片修复（清晰增强 + AI 上色）
│   ├── idphoto/  # AI 证件照（规格选择 + 背景色）
│   └── mine/     # 我的（额度/权益状态、兑换码、会员入口）
├── components/
│   └── paywall/  # 额度用完的付费引导弹窗（单次/包月/包季）
├── cloudfunctions/
│   └── photo/    # 云函数：restore / idphoto / quota / redeem / resetQuota
│       ├── index.js         # 入口与额度/权益逻辑
│       ├── config.js        # 配置（读环境变量 > config.local.js > 默认值）
│       ├── config.local.js  # 本地密钥（已 gitignore，不入库）
│       └── lib/
│           ├── tci.js           # 数据万象封装 + 纯 JS 图像合成
│           └── fetch-polyfill.js # Node16 运行时的 fetch 兼容层
└── utils/
    ├── config.js  # 全局配置（证件照规格预设）
    └── api.js     # 云函数调用封装
```

## 技术链路

**老照片修复**
```
上传原图到云存储 → 云函数下载 → 传 COS
→ [可选] ci-process=AIImageColoring（黑白上色）
→ ci-process=AIEnhanceImage&denoise=4&sharpen=3（增强）
→ 结果回传云存储 → 前端展示/保存
```

**证件照**（纯 JS 合成，无原生依赖）
```
ci-process=AIPortraitMatting（人像抠图，透明 PNG）
→ pngjs 解码（自动裁掉 IEND 后的多余字节）
→ alpha 包围盒裁剪 → 双线性缩放（alpha 预乘防黑边）
→ 纯色底合成 → jpeg-js 输出 JPG（295×413 / 413×579 / 413×531）
```

## 云函数需要的配置

### 环境变量（云开发控制台 → 云函数 photo → 配置）

| 变量 | 说明 |
|---|---|
| `TENCENT_SECRET_ID` | 腾讯云密钥 ID（必填） |
| `TENCENT_SECRET_KEY` | 腾讯云密钥 Key（必填） |
| `COS_BUCKET` | 默认 `ai-toolbox-1257738513` |
| `COS_REGION` | 默认 `ap-guangzhou` |
| `FREE_QUOTA` | 每用户每月免费次数，默认 3 |
| `DEV_UNLIMITED` | `true` = 所有人不限次（**上线前必须删掉**） |
| `DEV_OPENIDS` | 逗号分隔的 openid 临时白名单（比上面更安全） |

### 数据库集合（云开发控制台 → 数据库）

| 集合 | 用途 | 权限建议 |
|---|---|---|
| `quota` | 每用户每月用量计数 | 仅创建者可读写 |
| `members` | **白名单/会员**（不限次账号） | 仅创建者可读写 |
| `redeem_codes` | **兑换码** | 仅创建者可读写 |

#### members 记录格式（在控制台手动添加即可生效，无需改代码）

```json
{
  "openid": "oXXXXXXXXXXXXXXXXXXX",
  "level": "free",
  "expireAt": null,
  "disabled": false,
  "note": "赠送账号"
}
```

- `level`: `free`（免费白名单）/ `vip`（付费会员），两者都不限次
- `expireAt`: `null` = 永久；填日期则到期自动失效
- 想取消某人权益：把 `disabled` 改成 `true` 或删除记录

#### redeem_codes 记录格式

```json
{
  "code": "VIP2026ABC",
  "level": "free",
  "days": 0,
  "maxUses": 10,
  "usedCount": 0,
  "expireAt": null,
  "disabled": false,
  "note": "中秋活动赠送"
}
```

- `days`: `0` = 永久；`365` = 一年
- `maxUses`: 该码最多可被几个账号使用
- 用户在小程序「我的 → 兑换码」里输入即可开通

## 额度与权益判定顺序

1. 环境变量 `DEV_OPENIDS` / `DEV_UNLIMITED`（联调临时用）
2. `members` 集合（白名单 free / 会员 vip，支持到期时间）
3. 免费额度 `FREE_QUOTA` 次/月
4. 超出 → 返回 `40010`，前端弹出付费引导窗

> 额度**只在处理成功后扣减**，失败不消耗次数。

## 开发路线

- [x] 项目骨架 + 页面 UI + 底部 tabBar
- [x] 云函数 + 腾讯云数据万象接入（修复 / 上色 / 证件照）
- [x] 额度体系 + 白名单/兑换码
- [x] 付费引导弹窗 UI
- [ ] 微信虚拟支付接入（wx.requestVirtualPayment，9.9 元/月）
- [ ] 激励视频广告（免费额度用完看广告加次数）
- [ ] 提审上架（类目：工具-图片/音频/视频，名称：老照片修复工具箱）

## 注意事项

- 腾讯云密钥只放服务端；`config.local.js` 已在 `.gitignore` 中，不会入库
- 云函数运行时为 Nodejs16，代码里已做 `fetch` 兼容，无需改运行时
- 小程序模拟器里**不要用游客模式打开项目**，会把 AppID 覆盖成 `touristappid`
- 上线前务必删除 `DEV_UNLIMITED` 环境变量
