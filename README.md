# 解谜达人（微信小程序）

解谜类小游戏合集：猜成语（1000 关）、成语找错字（500 关）、诗词填空（500 关，按幼儿园→高中分学段）、歇后语（239 关）。微信原生小程序 + 云开发，类目：教育。

- **AppID**: `wxb3265721f68a1847`
- **云环境 ID**: `cloud1-d8g9yyxwe128b2185`
- 旧版「AI 工具箱」代码已存档在 tag `archive/ai-toolbox`
- **上线前待办**：见 [docs/launch-checklist.md](docs/launch-checklist.md)

## 目录结构

```
├── app.js / app.json / app.wxss     入口、路由、全局样式 token
├── pages/
│   ├── index/          游戏大厅（体力/提示余额、每日打卡、玩法入口）
│   ├── game/levels/    关卡地图（?gameType=，每页 50 关，按学段分段）
│   ├── game/play/      答题页（开始挑战、答错扣心、提示、求助、过关奖励）
│   ├── game/book/      收藏本（成语本 / 诗词本 / 歇后语本）
│   ├── rescue/         救助落地页（好友从分享卡片进入）
│   └── mine/           我的（头像昵称、道具余额、当前规则说明）
├── components/idiom-puzzle/   填字格 + 24 字字盘（答题页与救助页共用）
├── utils/
│   ├── api.js          云函数调用封装，所有接口集中在这里
│   ├── session.js      登录态与道具余额的前端缓存
│   ├── item-flow.js    道具不足时的统一流程：打卡 → 视频 → 兜底
│   ├── items.js        道具名称、单位、体力恢复倒计时文案
│   ├── milestone.js    开宝箱、段位进度文案
│   ├── rewarded-ad.js / checkin.js / share.js / rescue-notice.js
├── cloudfunctions/api/ 唯一的云函数，按 action 路由
│   ├── handlers/       account / idiom / rescue
│   └── lib/            规则配置、道具结算、北京时间日期、进度、流水
├── database/           可直接导入云数据库的初始数据
│   ├── levels/          三个玩法的题库（idiom / typo / poetry / xiehouyu.json）
│   └── app_config.json 游戏规则配置
├── assets/             底部导航图标（tabbar/）、体力 / 提示图标与默认头像（icons/），由 scripts/draw_*_icons.py 生成，可直接替换成设计稿
└── scripts/            题库生成（build_levels.py + level_builders/）、清单与补录数据（data/）、校对清单导出
```

## 首次部署（按顺序）

0. **小程序后台 → 设置 → 用户隐私保护指引**：声明收集「头像、昵称」，用途填"展示在求助页和分享卡片上"。不配置的话，选头像、填昵称会直接失败
1. **建集合**（云开发控制台 → 数据库）：
   `users` `daily` `progress` `levels` `rescues` `rescue_help_pairs` `rescue_helper_attempts` `item_logs` `app_config` `completions` `stats_daily`
   - 权限全部设为**自定义规则** `{"read": false, "write": false}`。所有读写都走云函数（管理员权限不受影响），客户端直连数据库读不到答案
2. **导入数据**：`levels` 依次导入 `database/levels/` 下的四个文件（idiom / typo / poetry / xiehouyu），`app_config` 导入 `database/app_config.json`（格式选 JSON（控制台只认 .json 和 .csv 后缀；文件内容是每行一条记录））
3. **部署云函数**：开发者工具右键 `cloudfunctions/api` →「上传并部署：云端安装依赖」
   - 部署后再右键 →「上传触发器」，启用两个定时任务：每天 04:30 清理过期数据（`cleanupExpiredRecords`），每小时整点写入当天统计（`snapshotStats`）
   - `config.json` 同时声明了昵称内容安全检测需要的 `security.msgSecCheck` 权限
4. **建索引（必须）**：没有索引时，打开大厅、关卡页的查询会随数据增长变慢，定时清理也可能超时
   | 集合 | 索引字段 |
   |---|---|
   | `rescues` | `requesterOpenid` + `gameType` + `status` + `noticeSeen` |
   | `item_logs` | `createdAt` |
   | `daily` | `date` |
   | `rescue_help_pairs` | `date` |
   | `rescue_helper_attempts` | `date` |
   | `levels` | `gameType` + `levelNo` |
   | `progress` | `gameType` + `solvedCount`（降序）+ `lastSolvedAt`（升序），排行榜和通关统计都依赖它 |
   | `completions` | `gameType` + `completedAt`；`gameType` + `date` |
   | `stats_daily` | `gameType` + `date` |
5. **云函数超时时间**：控制台把 `api` 的超时时间从默认的 3 秒改成 10 秒（冷启动加多次数据库读写有可能超过 3 秒）

## 游戏规则配置表

所有游戏数值都在 `app_config` 集合的 **`game_rules` 文档**里，**在控制台改完立即生效，不用发版**。
文档里缺的字段会回落到代码默认值（`cloudfunctions/api/lib/rules.js`），所以可以只写想改的那几项。

**手改配置有保护**：每个字段都会检查类型和范围（例如次数必须是非负整数、奖励类型只能是 `hint` / `stamina`）。填错的字段**单独**退回默认值，其他填对的字段照常生效，并在云函数日志里打印 `[rules] invalid config fields`。开了广告但没填 `adUnitId` 时，会自动关闭广告。

| 字段 | 默认 | 含义 |
|---|---|---|
| `signupItems.hint` | 10 | 新账号赠送的提示次数 |
| `signupItems.stamina` | 25 | 新账号赠送的体力 |
| `checkinRewards` | 提示 3、体力 5 | 每日打卡奖励，数组 `[{type, amount}]`，`type` 取 `hint` / `stamina` |
| `ad.enabled` | `false` | 激励视频开关，开通流量主前保持 `false` |
| `ad.adUnitId` | `''` | 激励视频广告位 ID |
| `ad.rewards.hint` / `.stamina` | 2 / 3 | 看完一次视频奖励多少 |
| `ad.dailyLimits.hint` / `.stamina` | 5 / 5 | 每天最多领几次视频奖励（两种道具分开计数） |
| `level.staminaCost` | 1 | 开始一次挑战消耗的体力 |
| `level.maxWrongAttempts` | 3 | 每次挑战可以答错几次，用完即挑战失败 |
| `level.maxHints` | 3 | 每关最多提示几次（同时不会超过「成语字数 − 1」） |
| `levelByGame.<玩法>` | `typo: { maxWrongAttempts: 1 }` | 按玩法覆盖上面三项 `level` 设置，没写的项沿用 `level`。找错字只有 8 个选项，答错 3 次等于能试一半，所以默认 1 次。填错的项退回默认值，未知玩法会被丢弃 |
| `staminaRecovery.enabled` | `true` | 体力是否随时间自动恢复 |
| `staminaRecovery.intervalMinutes` | 30 | 每多少分钟恢复 1 点 |
| `staminaRecovery.cap` | 10 | 自动恢复的上限（打卡、视频发的体力可以超过这个上限） |
| `rescue.dailyLimitPerHelper` | 2 | 同一位好友每天最多帮同一个人解几关 |
| `rescue.maxWrongAnswersPerHelper` | 3 | 每位好友对每条求助最多答错几次，超过就不能再答（防止乱点试出答案） |
| `milestone.everyLevels` | 10 | 每通过多少关解锁一个宝箱 |
| `milestone.rewards` | 提示 2、体力 3 | 每个宝箱的奖励，格式同 `checkinRewards` |
| `maintenance.itemLogRetentionDays` | 180 | 道具流水保留天数，过期由定时任务清理 |
| `maintenance.dailyRecordRetentionDays` | 7 | 每日打卡记录、求助计数这类按天记录的数据保留天数 |
| `leaderboard.size` | 100 | 排行榜展示前多少名（上限 1000） |
| `admin.openids` | `[]` | 管理员 openid 列表，名单内的人在「我的」页能看到「数据统计」入口 |
| `titles.idiom` / `.typo` / `.poetry` / `.xiehouyu` | 每个玩法一套，见下方「段位称号」 | 段位称号，`[{name, minSolved}]`，`minSolved` 表示通过多少关可晋升 |

## 闯关规则

**新手引导**：第一次点「开始挑战」时，先弹出玩法说明（体力、答错机会、提示与求助、怎么补体力），点「知道了，开始挑战」后才真正开始并扣体力。说明里的数字都来自当前配置。看过的记录存在本机（`utils/onboarding.js`），换手机或清理缓存后会再出现一次；之后随时可以在关卡准备页点「玩法说明」再看。玩法有大改动时，把存储键的版本号 `v1` 改成 `v2`，所有人都会重新看到一次。

```
进入未通过的关卡 → 点「开始挑战」，扣 level.staminaCost 点体力，获得 maxWrongAttempts 颗心
  中途退出再进来：继续本次挑战，不再扣体力
  答错：扣 1 颗心
  心扣完：挑战失败 →「再来一次」= 重新扣体力（这就是复活）
  已揭开的字跨挑战保留；已通过的关卡回看免费
  开始挑战前看不到题面，避免"先看题、想好了再开始"
```

### 道具不足时（提示和体力共用一套流程）

```
有余额 → 直接用
今天没打卡 → 弹窗打卡（一次发放全部打卡奖励）→ 自动重试
已打卡 + 视频开着 + 这种道具今天还没到视频上限 → 看视频，看完整才发奖 → 自动重试
都不行 → 提示不足：引导求助好友；体力不足：告诉用户还有几分钟恢复 1 点
```

- 体力恢复不靠定时任务：每次读写体力时，按距离上次结算过去了多少时间补上（`lib/items.js`）
- 「一天」按**北京时间**划分（云函数默认是 UTC 时区，见 `lib/date.js`）
- 道具的扣减和发放都在数据库事务里完成，多端同时操作也不会扣错
- 每笔道具变动都记在 `item_logs`（signup / checkin / ad / use），用户反馈"次数不对"时按 openid 查这张表

## 过关激励

- **里程碑宝箱**：每通过 `milestone.everyLevels` 关解锁一个宝箱。在过关页、关卡页都能打开，攒下的多个宝箱可以一次全部打开
  - 记录的是"已领到第几关的宝箱"（`progress.milestoneClaimedSolvedCount`），所以以后调整 `everyLevels` 也不会重复发奖
  - 好友救助通过的关卡也算通关数
- **段位称号**：按通关数自动计算，不单独存储。**称号只能往后追加**：每个玩法的称号必须原样保留代码里的基线（`lib/rules.js` 的 `BASELINE_TITLES_BY_GAME`），名称、门槛、顺序都不能改，只能在末尾追加门槛更高的新档。不符合规则时云函数会忽略配置、继续使用基线，并在日志里报错，避免玩家的段位被改乱。晋升的那一关在过关页会提示「晋升为 X」；「我的」页可以把段位分享出去（不附带任何奖励）
- **段位称号**（默认 15 档，沿用科举晋升顺序，前期升得快、后期升得慢）：

  | 称号 | 通关数 | 称号 | 通关数 | 称号 | 通关数 |
  |---|---|---|---|---|---|
  | 蒙童 | 0 | 童生 | 10 | 秀才 | 30 |
  | 廪生 | 60 | 贡生 | 100 | 举人 | 150 |
  | 解元 | 220 | 贡士 | 300 | 会元 | 400 |
  | 进士 | 500 | 探花 | 600 | 榜眼 | 700 |
  | 状元 | 800 | 翰林 | 900 | 大学士 | 1000 |

- **收藏本**：每个玩法各有一本（成语本 / 诗词本 / 歇后语本），自动收录已通过的关卡，每页加载 20 条
- **诗词称号**（10 档）：学童 0 · 诗童 10 · 吟者 30 · 诗友 60 · 诗客 100 · 词人 160 · 诗家 240 · 诗翁 320 · 诗仙 400 · 诗圣 500
- **歇后语称号**（7 档）：听众 0 · 学徒 5 · 票友 15 · 说书人 30 · 评书家 50 · 名角 75 · 曲艺大师 100
- **找错字称号**（9 档）：书童 0 · 识字郎 10 · 校对员 30 · 小编辑 60 · 编辑 100 · 主编 160 · 总编 240 · 活字典 350 · 字圣 500
- 不做"每关都发道具"：道具会越攒越多，体力和看视频就失去了意义

## 多玩法

- **共用**：体力、提示、每日打卡、激励视频、配置里的闯关参数（体力消耗、答错次数、提示上限）和宝箱规则
- **各算各的**：关卡进度、段位称号、宝箱累计、排行榜、通关统计、收藏本
- 接口统一为 `game.*`，必须带 `gameType`（`idiom` / `typo` / `poetry` / `xiehouyu`），缺失或未知时返回参数错误
- 提示有两种方式（`lib/games.js` 的 `HINT_STRATEGY_BY_GAME`）：默认「揭开下一个字」；找错字是「排除错误选项」
- 新增玩法需要做的事：`lib/games.js` 注册玩法、解答字段和提示方式；`lib/rules.js` 加称号基线；`utils/games.js` 加前端展示文案；`scripts/level_builders/` 加一个生成器；`tests/levels.test.js` 加体检规则

## 全部通关、统计与排行榜

- **"通关"只针对当前的最高关卡**：现在 1000 关，就是通过全部 1000 关；以后扩关，原来通关的人自动变回未通关，可以接着往下玩
- **全部通关提示**：通过最后一关时，过关页显示「恭喜通关全部关卡！更多挑战正在准备中，敬请期待」；关卡页和大厅也会显示已全部通关。界面上**不显示总关数**（大厅、关卡页、答题页只显示已通过的关数），只有管理员统计页会显示
- **通关记录**：每当有人打通当前全部关卡，就在 `completions` 写一条记录（用户、昵称、当时的关卡总数、日期）。同一个人在同一关卡总数下只记一次，扩关后再次通关会另记一条。目前只记录到数据库，不主动推送通知
- **统计**：
  - 通关率 = `progress.solvedCount ≥ 当前关卡总数` 的用户数 ÷ `users` 总数
  - 实时数据：管理员在「我的」→「数据统计」查看（通关率、最近 20 条通关记录、最近 30 天趋势）
  - 每日快照：定时任务每小时整点覆盖写入 `stats_daily` 中当天的那条记录，控制台可以直接查看
- **设置管理员**：在「我的」页最底部长按「用户编号」复制自己的 openid，填进 `game_rules.admin.openids`。权限在云函数里校验，入口隐藏只是界面层面的处理
- **排行榜**：放在底部导航（大厅 / 排行榜 / 我的）。从关卡页、过关页点「排行榜」会直接打开当前玩法的榜单：底部导航页不能带参数，所以跳转前把玩法记在 `globalData.pendingLeaderboardGameType`，排行榜页显示时读取（`utils/navigation.js`）。按通关数排名，同分时先达到的人排在前面。展示前 `leaderboard.size` 名，在榜外的用户底部单独显示自己的名次，一关都没过的显示「暂未上榜」。前 N 名在每个云函数实例里缓存 1 分钟。接口不返回 openid

## 求助好友

- **发起不消耗任何东西，也不限次数**，但必须先开始过这一关的挑战（防止不花体力先看题面）。同一关只会有一条求助，重复分享也是同一条
- 每位好友对每条求助最多答错 `rescue.maxWrongAnswersPerHelper` 次，防止乱点试出答案
- 求助人自己先答对了，这条求助会自动关闭，好友点开会看到「TA 已经自己解开这一关啦」，不会占用好友的帮助次数
- 求助页显示的是求助人**当前**的头像和昵称，改资料后立刻生效
- 好友从卡片进入后能看到题目，看不到答案；第一个答对的人让求助人**直接过关**，不消耗体力
- **同一位好友每天最多帮同一个人解 `rescue.dailyLimitPerHelper` 关**。超出后，好友点开卡片会看到提示，请求助人换一位好友
- 限制放在好友答题这一步检查，因为分享时微信不会告诉我们卡片发给了谁，只有好友点开时才知道
- **分享本身不发任何奖励**：微信运营规范禁止"分享后获得奖励"（诱导分享）

## 头像与昵称

- **微信不再允许直接读取用户头像昵称**（2022 年 10 月起 `wx.getUserProfile` 只返回灰色头像和「微信用户」）。唯一的官方方式是「头像昵称填写」：点头像时微信提供「用微信头像」，昵称输入框（`type="nickname"`）的键盘上方会出现微信昵称
- **注册即有昵称**：服务端按 openid 生成固定的随机昵称（如「好学的小书童」，`lib/nickname.js`），头像用默认卡通头像，所以排行榜、求助页不会出现空白资料；历史上昵称为空的用户登录时自动补上
- **新用户首次进入大厅**弹出欢迎面板引导设置（只弹一次，记在本机）。点「先随便逛逛」就保留随机昵称；之后可在「我的 → 编辑资料」修改。用户亲自保存过资料后 `profileCustomized` 为 true，不再弹出
- 欢迎面板和「我的」页的编辑面板是同一个组件 `components/profile-editor`

## 安全与运维

- **昵称内容安全**：保存昵称时在服务端调用 `security.msgSecCheck`，只有结果为 `pass` 才保存；接口异常时也拒绝保存。头像使用微信的选头像能力，由微信负责检测
- **头像存储**：每个用户只能上传到自己的目录 `avatars/<用户哈希>/`，服务端拒绝其他路径；换头像时自动删除旧文件
- **定时清理**：每天 04:30 删除过期的道具流水、每日记录、求助计数
- **关卡总数缓存**：每个云函数实例缓存 10 分钟，导入新关卡后最多 10 分钟可见
- **提审风险**：体力、宝箱、段位都是游戏化机制，个人主体开不了游戏类目，审核可能认定为"小程序提供游戏服务"。建议部署后尽早用体验版提审一次；介绍文案和截图突出成语学习（释义、出处、成语本）

## 测试

```
node tests/api.test.js      # 后端：用内存版数据库跑完整业务流程（146 个用例）
node tests/levels.test.js   # 题库体检（四个玩法）：编号连续、字盘包含答案、题面与答案能还原原句、学段连续
```

改云函数或扩关卡之后都要跑这两条。`tests/support/fake-wx-server-sdk.js` 模拟了用到的数据库能力，事务通过"快照 + 回滚"实现，**不能替代真机验证**。

## 题库

| 玩法 | 关数 | 学段 / 分档 | 玩法说明 |
|---|---|---|---|
| 猜成语 `idiom` | 1000 | 5 档（小学常见 → 文言生僻） | 看释义（答案用字遮成 □），拼出四字成语 |
| 诗词填空 `poetry` | 500 | 幼儿园 33 · 小学 96 · 初中 71 · 高中 77 · 进阶 223 | 给出上句，补全下句被挖掉的字；越往后挖得越多（幼儿园 2 字 → 小学 3 字 → 初中 4 字 → 高中起整句） |
| 歇后语 `xiehouyu` | 239 | 幼儿园 28 · 小学 96 · 初中 70 · 高中 45 | 给出前半句，补出后半句（2–7 字） |
| 成语找错字 `typo` | 500 | 小学 208 · 初中 235 · 高中 57 | 成语里有一个字被换成同音字并标红，从 8 个同音 / 近音字中选出正确的字；小学段额外显示释义 |

- 每个玩法的关卡都放在 `database/levels/<玩法>.json`，导入**同一个** `levels` 集合，用 `gameType` 区分
- 带学段的玩法，每关都有 `stage` 字段；关卡页按学段显示分段，可以点击跳转；答题页显示「小学 · 第 N 关」
- 字盘固定 24 个字 = 答案 + 干扰字（取自同玩法其他关卡的答案用字）。以关卡内容作随机种子，每次生成结果都一样
- **内容需要人工校对**：运行 `python3 scripts/export_content_review.py` 生成 `docs/content-review.md`

### 数据来源（均为 MIT 许可，可商用）

- [chinese-xinhua](https://github.com/pwxcoo/chinese-xinhua)：`idiom.json`（成语）、`xiehouyu.json`（歇后语）、`word.json`（汉字拼音，用于找同音字）
- 新华成语数据里的录入乱码（「◇」= 被吞掉的「，后」，以及个别 ↑ ◆ ★）在 `scripts/data/idiom_text_fixes.json` 里统一修正
- [chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)：蒙学版《唐诗三百首》《千家诗》、全唐诗版《唐诗三百首》、《宋词三百首》、《全唐诗》、《全宋词》
- 原始数据下载到 `.cache/`（已加入 `.gitignore`，不入库），下载方式见 `scripts/build_levels.py` 顶部说明

### 各玩法的生成规则

**猜成语**（`scripts/level_builders/idiom.py`）
- `scripts/data/idioms.txt` 用 `# tier N` 分档（人工判断熟悉程度），同档内按用字生僻度排序
- 题面遮挡：答案的两字片段一律遮住；单个字只有生僻时才遮，常用字保留，避免题面满是 □；遮完仍露出 3 个及以上答案字的，就全部遮住
- 遮完仍读不通的题，在 `scripts/data/idiom_clue_overrides.json` 里手写题面（脚本会检查手写题面里有没有答案用字）

**诗词填空**（`scripts/level_builders/poetry.py`）
- 学段清单在 `scripts/data/poetry_stages.txt`，幼儿园到高中按部编版教材必背篇目人工整理；「进阶」自动收录唐诗三百首、宋词三百首里的其余作品
- **版本以课本为准**：取文本的优先级是 `scripts/data/poetry_supplement.json`（按课本手工补录的 24 首）→ 蒙学版唐诗三百首 → 千家诗 → 全唐诗版唐诗三百首 → 宋词三百首 → 全唐诗 / 全宋词。古籍里常见与课本不同的版本，例如全唐诗版《静夜思》是「床前看月光」
- 按**首句**匹配作品（古籍标题常与课本不同，如「钱唐湖春行」「池上二绝 二」），显示的标题统一用课本标题
- 异体字统一替换（穉→稚、遶→绕、徧→遍、篴→笛、沈舟→沉舟 等，见补录文件的 `variantReplacements`）
- 同一首诗的不同版本、开头一句相同的重复作品只保留一个；每首诗最多出几关由学段参数 `couplets` 决定
- 需要 OpenCC 做繁简转换，所以用 `.cache/venv/bin/python` 运行（`python3 -m venv .cache/venv && .cache/venv/bin/pip install opencc-python-reimplemented`）

**成语找错字**（`scripts/level_builders/typo.py`）
- 题目来源：`scripts/data/typo_common.txt` 里人工整理的常见易错成语（排在各学段最前），其余由脚本自动生成：在成语的某个位置换一个**同音常用字**
- 学段沿用猜成语的分档：第 1 档 → 小学，第 2 档 → 初中，第 3 档 → 高中，第 4、5 档 → 进阶
- 字盘 8 个字 = 正确字 + 7 个干扰字。干扰字依次取：正确字的同音字 → 错字的同音字 → 声母相同的常用字，只用常用字
- **两条硬性过滤**：错误写法如果被新华成语词典收录为异形词（如「莫明其妙」「走头无路」），整道题丢弃；字盘里的干扰字如果能拼出词典收录的写法，这个字不用
- **提示方式不同**：答案只有一个字，所以提示是「排除 2 个错误选项」，排除顺序在生成时固定（`eliminationOrder`）；每关最多 3 次，至少保留 2 个选项
- 需要额外下载 `xinhua/word.json`（汉字拼音）

**歇后语**（`scripts/level_builders/xiehouyu.py`）
- **全部人工挑选**，清单在 `scripts/data/xiehouyu_stages.txt`。原始数据有大量粗俗、别扭或多答案的条目，所以不自动收录
- 答案必须是数据源给出的答案之一；去掉括号里的谐音或释义，原始写法保留在 `note`，过关后显示（如「照旧（舅）」）
- 幼儿园到初中由人工按熟悉程度挑选；高中档挑的是历史和文学人物相关的条目。**歇后语没有教材可依，学段划分是主观判断**

### 生成与扩充（只追加）

```
python3 scripts/build_levels.py idiom 1000
.cache/venv/bin/python scripts/build_levels.py poetry 500
python3 scripts/build_levels.py xiehouyu 239
python3 scripts/build_levels.py typo 500
node tests/levels.test.js
```

- 扩充时把新内容写到对应清单的**末尾**（新档位或新学段），把目标关数调大后重新运行，再把整个 `.json` 导入 `levels` 集合，冲突处理选 **Upsert**
- **脚本的三条保护**（`scripts/level_builders/common.py`）：
  - 已有关卡逐字节保留，绝不重新编号、不改字盘。玩家进度是按关卡编号存的，一旦改动，所有人的进度都会错乱
  - 新内容必须比现有最难的关卡更难：放在更靠后的档位或学段，或者和最后一档同档但更难，否则脚本报错并列出这些内容
  - 目标关数小于等于现有关数时什么也不做，不会删除关卡
- 只有在**上线前**想整体重排时，才删除 `database/levels/<玩法>.json` 后重新生成

## 广告上线清单

1. 小程序累计访客满 1000 后，在后台开通流量主，并新建激励视频广告位
2. 把 `game_rules` 里的 `ad.adUnitId` 填上，`ad.enabled` 改成 `true`
3. 不用发版，用户下次打开时就会拿到新配置
