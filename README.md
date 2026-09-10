# ai-photo-tools · AI 照片工具箱（微信小程序）

老照片修复 + AI 证件照 两大工具，个人开发者虚拟支付变现项目。

## 项目信息

- **AppID**: wxb3265721f68a1847
- **类型**: 微信小程序（原生框架）
- **仓库**: https://github.com/webpersonalserver/ai-photo-tools

## 目录结构

```
ai-photo-tools/
├── app.js / app.json / app.wxss   # 小程序入口与全局配置
├── project.config.json            # 开发者工具项目配置（含 AppID）
├── pages/
│   ├── index/    # 首页（工具入口）
│   ├── restore/  # 老照片修复（清晰增强 + AI上色）
│   ├── idphoto/  # AI 证件照（规格选择 + 背景色）
│   └── mine/     # 我的（会员中心占位）
└── utils/
    ├── config.js  # 全局配置（API 地址、证件照规格）
    └── api.js     # 后端接口封装（上传 + AI 调用）
```

## 如何在微信开发者工具中打开

1. 打开微信开发者工具 → 导入项目
2. 目录选择本文件夹 `D:\WorkBuddy\Projects\ai-photo-tools`
3. AppID 已预填（wxb3265721f68a1847），直接确定即可预览

## 开发路线

- [x] 项目骨架 + 四个页面 UI
- [ ] 接入 AI 能力：老照片修复（腾讯云/阿里云，约 0.1 元/次）、证件照（人像分割+换底，约 0.15 元/次）
- [ ] 后端/云函数（代理 AI API，避免密钥暴露在小程序端）
- [ ] 微信虚拟支付接入（wx.requestVirtualPayment，9.9元/月会员）
- [ ] 激励视频广告（免费额度用完看广告加次数）
- [ ] 提审上架（类目：工具-图片/音频/视频）

## 注意事项

- `utils/config.js` 里的 `API_BASE` 需替换为真实后端域名（需在小程序后台配置 request 合法域名）
- AI 服务密钥只放服务端，严禁写进小程序前端代码
