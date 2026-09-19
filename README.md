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

**老照片修复**（顺序不能随意调，都是实测出来的）

```
上传原图 → 云函数 → COS
→ ① 去色偏：泛黄老照(R-B>12)先转灰度，避免上色偏蓝紫
→ ② 降噪：AIEnhanceImage&denoise=5&sharpen=0   ← 必须先降噪，否则超分会放大噪点
→ ③ 清晰化：AISuperResolution&magnify=1        ← magnify=1 = 官方"清晰度增强"，不改变分辨率
   （高清模式：先 magnify=2 放大，再 magnify=1 清晰化；分辨率翻倍，约多 2 秒）
→ ④ [可选] 上色：AIImageColoring
→ ⑤ 锐化：AIEnhanceImage&denoise=0&sharpen=4
→ ⑥ 色彩还原（本地 JS）：灰世界白平衡去色偏 + 自适应饱和度拉到 24%
→ 结果回传云存储 → 前端展示/保存
```

实测（480×480 泛黄老照片）：清晰度 21.3→**40.8**、饱和度 10.4%→**20.9%**、动态范围 116→**161**、色偏 R−B 13.4→**−0.1**。

- `magnify` 有效值 {1,2,4}：**1 = 只增强清晰度不改尺寸（实测锐度提升最大）**，2 = 放大 2 倍，4 = 放大 4 倍但实测锐度最低、耗时翻倍，已弃用。
- 饱和度必须**自适应**：同一链路 480px 上色后饱和度仅 8%、960px 有 16%，固定增益会不是没变化就是过饱和。逻辑：量当前饱和度 → 算到目标 24% 所需增益 → 上限 3.2 倍。
- 白平衡修正限幅 ±18%，避免大面积单色画面把整图带歪。
- 本地后处理超过 2.2MP 自动跳过，防止云函数超时。
- **已知限制**：数据万象没有自动去划痕接口（`ImageRepair` 需人工给遮罩图），划痕折痕只能靠降噪减轻。

**证件照**（纯 JS 合成，无原生依赖）
```
统一底片裁剪：imageMogr2/thumbnail/x1000/gravity/face/crop/780x1000
  （固定比例 ID_BASE_RATIO=0.78，与规格无关 —— 保证换尺寸是同一份人像等比缩放）
→ AIPortraitMatting 人像抠图（带重试，校验透明像素占比）
→ pngjs 解码（自动裁掉 IEND 后的多余字节）
→ alpha 包围盒裁剪 → 边缘羽化 → 等比缩放 → 纯色底合成 → jpeg-js 输出 JPG
```

- **同图多尺寸等比适配**：实测一寸/二寸/小二寸的人像宽高比完全一致（0.781 / 0.780 / 0.780），
  人像高度比 347/487 = 0.7125 ≈ 画布宽比 295/413 = 0.7143，无拉伸、无构图漂移。
  旧实现每规格按自身比例重新裁剪原图，不同尺寸肩宽/留白不一致，已修复。
- **构图（头部标尺，v2）**：从抠图遮罩测出头顶/肩线/头宽，按「头高≈画布 62%、头宽≈画布 60%」
  缩放（对齐规范：头部占高约 2/3、脸宽 50%~60%），头顶留白固定 10%，水平按头部质心居中。
  旧版按整人包围盒缩放，躯干长时头顶贴边、肩膀撑满画面（用户实测反馈），已修复；
  头部识别失败自动回退包围盒逻辑（肩宽 92%、高度下限 72%、过宽撑 72% 高并裁两侧）。
- **抠图重试**：数据万象偶发返回未抠图的原图（无透明背景），已改为校验透明像素占比并重试；
  抠图输入边长上限 1000（1200 时失败率明显上升）。
- 可调配置（`cloudfunctions/photo/config.js`，均支持环境变量覆盖）：
  `ID_BASE_RATIO` `ID_TOP_RATIO` `ID_HEAD_HEIGHT_RATIO` `ID_HEAD_WIDTH_RATIO`
  `ID_WIDTH_RATIO` `ID_MIN_HEIGHT_RATIO` `ID_MATTE_MAX_SIDE`。

## 云函数需要的配置

### 环境变量（云开发控制台 → 云函数 photo → 配置）

| 变量 | 说明 |
|---|---|
| `TENCENT_SECRET_ID` | 腾讯云密钥 ID（必填） |
| `TENCENT_SECRET_KEY` | 腾讯云密钥 Key（必填） |
| `COS_BUCKET` | 默认 `ai-toolbox-1257738513` |
| `COS_REGION` | 默认 `ap-guangzhou` |
| `FREE_QUOTA` | 每用户每月免费次数，默认 3 |
| `ENV_FREE` | `true`（默认）= **开发版/体验版自动不限次**，开发者与体验成员零配置免额度；上线后改 `false` 关闭 |
| `DEV_PASS` | 开发者口令，默认 `aitool2026`；小程序「我的」页连点标题 5 次输入口令即可把该微信永久加白名单。置空则关闭 |
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

0. **开发版 / 体验版**（`envVersion` = `develop`/`trial`）→ 自动不限次
   - 只有小程序后台的「开发者」和「体验成员」能打开这两个版本，所以这类成员天然免额度，不用配任何东西。
   - 由 `ENV_FREE` 控制，正式上线后设 `false` 即恢复计数。
1. 环境变量 `DEV_OPENIDS` / `DEV_UNLIMITED`（联调临时用）
2. `members` 集合（白名单 free / 会员 vip，支持到期时间）
3. 免费额度 `FREE_QUOTA` 次/月
4. 超出 → 返回 `40010`，前端弹出付费引导窗

> 额度**只在处理成功后扣减**，失败不消耗次数。

### 给某个微信开永久免费的三种方式（任选）

| 方式 | 操作 | 适用场景 |
|---|---|---|
| 开发版/体验版 | 把他加进小程序后台「成员管理 → 开发者/体验成员」，用体验版打开即免额度 | 内部测试、亲友 |
| 开发者口令 | 「我的」页连点「我的账户」5 次 → 开发者口令激活 | 正式版里给自己人开 |
| `members` 集合 | 控制台加一条 `{openid, level:'free', expireAt:null}` | 精细控制、可随时停用 |

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
