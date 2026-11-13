# Crypto Market Monitor

加密货币多指标、多周期组合监控系统。

- 一个监控项 = **标的 + 条件组合 + 自动检查周期**；
- 同一标的可以同时存在多个监控项，例如 BTCUSDT 1m 趋势、BTCUSDT 5m KDJ、BTCUSDT 5m EMA 30/200；
- 条件支持 **触发（trigger）** 与 **过滤（filter）**，按 AND 组合；
- 支持跨周期组合，例如 1h J<5 过滤 + 15m J 下穿 5 触发；
- 检查周期自动取所有触发条件中的最小周期；
- 行情优先请求 OKX，异常时回退 Binance；
- 每个监控项独立记录信号、独立控制微信/声音、独立立即请求；
- 信号记录支持按标的、K 线周期、监控项、类型筛选。

## 数据模型

```
monitors             监控项：标的、检查周期、开关、状态、错误、数据源
monitor_conditions   条件：类型、角色、自己的周期、参数、运行状态
signals              信号：监控项、条件快照、周期、方向、通知状态
```

### 条件角色

- **触发条件**：在检查周期收盘时检查；条件可使用检查周期或更高周期；
- **过滤条件**：触发发生时必须同时有效；可使用任意周期；
- 检查周期取所有触发条件中的最小周期；过滤条件低于检查周期时，取检查时点最近一根已收盘数据；
- 至少一个触发条件，过滤条件可选。

### 跨周期示例

“1h 进入 J<5，15m 找 J<5 做多”：

```json
{
  "symbol": "BTCUSDT",
  "conditions": [
    {
      "kind": "KDJ_EXTREME",
      "role": "filter",
      "interval": "1h",
      "params": {
        "period": 9,
        "kSmooth": 3,
        "dSmooth": 3,
        "oversold": 5,
        "overbought": 85,
        "longEnabled": true,
        "shortEnabled": false
      }
    },
    {
      "kind": "KDJ_EXTREME",
      "role": "trigger",
      "interval": "15m",
      "params": {
        "period": 9,
        "kSmooth": 3,
        "dSmooth": 3,
        "oversold": 5,
        "overbought": 85,
        "longEnabled": true,
        "shortEnabled": false
      }
    }
  ]
}
```

高周期条件使用最近一根已收盘 K 线，且 `closeTime <= 入场 K 线 closeTime`，不会使用未来数据。

## 条件类型

### `EMA_CROSS`

- 参数：`fast`、`slow`、`threshold`、`priceSide`；
- 触发事件：达到距离阈值的金叉 / 死叉；
- 过滤状态：`BULL_WAITING` / `BEAR_WAITING`；
- `priceSide` 可要求收盘价在慢线上方或下方，用于排除 DEA/EMA 仍向上但价格已经跌破均线的情况；
- 展示：多空排列、最近交叉、交叉价、EMA 距离、阈值、价格位置。

### `KDJ_EXTREME`

- 参数：`period`、`kSmooth`、`dSmooth`、`oversold`、`overbought`、`longEnabled`、`shortEnabled`、`triggerMode`；
- `triggerMode`：
  - `cross`：J 首次进入超卖区 → 做多；首次进入超买区 → 做空；监控启动时如果 J 已在区域内，也会立即判定一次；
  - `reversal`：J 在超卖区由下跌转为回升 → 做多；J 在超买区由上涨转为回落 → 做空；
- 过滤状态：当前 J 低于超卖阈值（多头）或高于超买阈值（空头）；
- 展示：J/K/D、超买/超卖状态、阈值、J钝化止损。

`reversal` 更偏向拐点入场，`cross` 是进入极值触发；同一段极值内只触发一次，J 离开区域后重新进入才会再次触发。

监控启动时如果 J 已经在极值区，预热完成后会复核最新 K 线并立即判定一次，不需要等待下一次 J 重新进入。

> TradingView 没有内置 KDJ，只有 Stochastic；需要社区 Pine 脚本，或用 `J = 3K - 2D` 自行计算。

### `VOLUME_SPIKE`

- 参数：`lookback`（默认 5）、`multiplier`（默认 3）；
- 触发事件：当前 K 线成交量 > 前 N 根成交均量 × X；
- 方向：阳线为向上，阴线为向下；
- 展示：当前成交量、前 N 根均量、阈值、放量倍数；
- 可作为触发条件，也可作为过滤条件。

### `PRICE_LEVEL`

- 参数：`level`（指定价位）、`direction`（`up` / `down` / `both`）；
- 触发事件：
  - 向上触及：前一根收盘 < 价位，当前最高价 ≥ 价位；
  - 向下触及：前一根收盘 > 价位，当前最低价 ≤ 价位；
- 展示：价位、触及方向、当前状态；
- 可作为触发条件，也可作为过滤条件。

### `MACD_DEA_TURN`

- 参数：`fast`（默认 12）、`slow`（默认 26）、`signal`（默认 9）、`direction`（`up` / `down` / `both`）、`freshBars`（默认 3）、`zeroSide`（`any` / `positive` / `negative`）；
- 触发事件：DEA 由走平/下行转为上行，或由走平/上行转为下行；
- 过滤状态：DEA 当前持续向上或持续向下，拐头发生在最近 `freshBars` 根内，并满足零轴位置要求；
- 展示：DIF、DEA、MACD 柱、DEA 位置、DEA 斜率状态、拐头时效。

### `KDJ_JK_CROSS`

- 参数：`period`（默认 9）、`kSmooth`（默认 3）、`dSmooth`（默认 3）、`direction`（`up` / `down` / `both`）；
- 触发事件：J 值上穿 K 值，或 J 值下穿 K 值；
- 过滤状态：J 当前在 K 上方或下方；
- J 下穿 K 常作为上涨动能耗尽的预警；
- 展示：J/K/D、J/K 位置关系、交叉方向；
- 可作为触发条件或过滤条件。

### `MACD_DIF_ZERO`

- 参数：`fast`（默认 12）、`slow`（默认 26）、`signal`（默认 9）、`direction`（`up` / `down` / `both`）；
- 触发事件：DIF 由零轴下方上穿零轴，或由零轴上方下穿零轴；
- 过滤状态：DIF 当前位于零轴上方或下方；
- 展示：DIF、DEA、MACD 柱、零轴位置；
- 可作为触发条件或过滤条件。

### 条件逻辑组合

监控项中的每个条件都有一个逻辑选项：

- `与`：AND，必须同时满足；
- `或`：OR，满足任意一个即可；
- `非`：AND NOT，条件为假时才通过。

条件按列表顺序参与组合，第一个条件的逻辑不参与运算。至少需要一个正向触发条件产生信号，避免单独使用「非」时每根 K 线都触发。

### `MACD_DEA_ZONE`

- 参数：`fast`（默认 12）、`slow`（默认 26）、`signal`（默认 9）；
- 触发事件：
  - DEA 上拐且 DIF 上移：进入多头区间；
  - 多头区间内 DIF 下拐：多头区间衰竭；
  - DEA 下拐且 DIF 下移：进入空头区间；
  - 空头区间内 DIF 上拐：空头区间衰竭；
- 不使用 `freshBars`，不按第几根 K 线判断；区间持续到反向 DEA 拐头；
- 展示：当前多空区间、DIF/DEA 方向、是否已衰竭。

### `EMA_FAST_TURN`

- 参数：`fast`（默认 25）、`slow`（默认 60）、`turn`（`up` / `down`）、`minSeparationPct`（默认 0.5）；
- 触发事件：快线 EMA 斜率发生拐头；
- 过滤状态：快线当前向上/向下，且快慢线分离度 `|快线-慢线| / 慢线 × 100` 达到阈值；
- 用于大级别趋势后，价格仍远离均线时的动能转弱/转强确认。

### `ADX_TREND`

- 参数：`period`（默认 14）、`threshold`（默认 20）、`direction`（`bull` / `bear` / `both`）；
- 过滤状态：ADX ≥ 阈值，且 +DI/-DI 方向匹配；
- 触发事件：ADX 上穿阈值并出现方向；
- 用于排除横盘：ADX 低于阈值时，不认为存在可交易趋势；
- 展示：ADX、+DI、-DI、阈值。

### KDJ 钝化止损参考

KDJ 条件会额外显示「J钝化止损」：

- 做多时，取当前 J<超卖阈值钝化区间内 J 最低那根 K 线的低点；
- 做空时，取当前 J>超买阈值钝化区间内 J 最高那根 K 线的高点；
- 该值仅作为止损参考，不会自动下单。

### 止损触发跟踪

KDJ 入场信号会创建 `stop_watches` 止损观察：

- 做多：后续 K 线最低价 ≤ 止损价时触发；
- 做空：后续 K 线最高价 ≥ 止损价时触发；
- 触发后生成独立的 `STOP_LOSS_HIT` 信号，并走微信/声音通知；
- 每个入场信号只触发一次止损；
- 入场当根 K 线不参与止损判断，从下一根开始检查。

当前只在监控项启用且 Worker 正常运行时检查；手工平仓不会自动取消观察。

止损观察会记录最大有利波动 MFE 和最大不利波动 MAE（以初始风险 R 为单位），用于评估入场后走势质量。

同一监控项、同一方向出现新的入场信号时，旧的活动止损观察会被取消，只保留最新一笔；不同方向可以同时保留。

当浮盈达到 1R 时会产生「达到 1R」提醒；达到 1R 后价格回到入场价时产生「回到入场价」提醒。它们只作为保护/正T/反T/清仓的参考，不会自动交易。

监控项展开详情中提供「标记已平仓」，会取消该监控项所有活动中的止损观察，避免人工平仓后继续收到旧仓位的止损提醒。

同时提供「记录正T」「记录反T」按钮，将人工 T 操作写入 `trade_actions`。当前仅记录操作，不自动判断 T 点。

未来新增其他指标时，只需增加条件定义和字段元数据，前端条件编辑器会自动渲染。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查，含 Worker 状态 |
| POST | `/api/auth/login` / `/api/auth/logout` | 登录 / 退出 |
| GET | `/api/auth/me` | 登录状态 |
| GET | `/api/conditions` | 条件目录与字段定义 |
| GET | `/api/monitors` | 监控项、条件、快照、pending、错误 |
| POST | `/api/monitors` | 新建监控项 |
| PUT | `/api/monitors/:id` | 修改监控项/条件 |
| PATCH | `/api/monitors/:id` | 只修改启用、微信、声音开关 |
| DELETE | `/api/monitors/:id` | 删除监控项，历史信号保留 |
| POST | `/api/monitors/:id/refresh` | 单项立即请求，返回 pending |
| GET | `/api/signals` | 信号记录，支持 `symbol/interval/monitor_id/event_type/triggered/limit/offset` |
| GET | `/api/signals/stats` | 今日/累计信号，以及按预设分组的策略统计 |
| GET | `/api/signals/stats/entries` | 策略统计明细，支持 `search/limit/offset`；搜索覆盖触发条件和备注 |
| GET | `/api/signals/stats/results` | 按标的统计已填写结果的数量和占比 |
| GET | `/api/signals/stats/export` | 按标的和时间段导出 Excel |
| POST | `/api/signals/stats/batch-delete` | 批量软删除策略统计记录 |
| POST | `/api/signals/stats/import-legacy` | 将旧版未纳入统计的入场信号纳入统计 |
| POST | `/api/signals/stats/backfill-trends` | 尝试还原历史信号的大级别趋势 |
| PATCH | `/api/signals/:id/stats` | 修改统计备注或结果 |
| DELETE | `/api/signals/:id/stats` | 从策略统计中软删除一条记录 |
| GET/POST | `/api/notes` | 笔记列表/新建；列表支持 `page/limit/tag/search` |
| PUT/DELETE | `/api/notes/:id` | 修改/删除笔记 |
| GET | `/api/notes/tags` | 标签及使用次数 |
| GET/POST | `/api/cases` | 交易案例列表/新建 |
| GET/PUT/DELETE | `/api/cases/:id` | 案例详情/修改/删除 |
| POST | `/api/cases/:id/images` | 上传案例截图 |
| DELETE | `/api/cases/:id/images/:imageId` | 删除案例截图 |
| GET | `/api/cases/images/:imageId` | 读取案例图片，`variant=thumb\|full` |
| GET/PUT | `/api/settings` | 全局监控开关、全局微信通知开关 |

## 笔记

登录后页面右侧显示悬浮「笔记」按钮，打开后可以：

- 新建、编辑、删除笔记；
- 按标题/正文搜索；
- 为笔记添加多个标签，点击标签快速筛选；
- 分页浏览，支持按标签和关键词组合查询。

笔记数据存储在主数据库中，标签使用 `note_tags` 关联表；删除笔记会级联删除标签关系。

## 交易案例库

`/cases` 页面提供交易案例记录：

- 添加标题和描述；
- 上传多张截图，上传前在浏览器压缩为完整图和缩略图；
- 列表和详情只加载缩略图，查看时才加载完整图；
- 支持案例搜索、分页、编辑和删除；
- 图片限制：单案例最多 50 张，总计最多 200 张；
- 图片文件保存在 `data/case-images`，随 `monitor-data` 卷持久化。

## 通知与控制

- **全局监控**：关闭后停止自动轮询，单项手动请求仍可执行；
- **监控项开关**：每项独立启用/停用；
- **微信通知**：全局开关 + 监控项开关 + Server酱 SendKey + 信号新鲜度；
- **声音提醒**：全局开关 + 监控项开关；做多入场、做空入场、金叉、死叉、放量、到价使用不同提示音；
- 浏览器声音需要保持标签页打开。

## 数据源

优先 OKX USDT 永续：

- `BTCUSDT` → `BTC-USDT-SWAP`；
- OKX 网络错误、业务错误、空数据或解析失败时回退 Binance；
- OKX 连续失败时会短时熔断，减少重复超时；
- 每个监控项的条件可以来自不同周期，监控项会记录 `OKX`、`BINANCE` 或 `MIXED`；
- OKX 不支持的周期（如 8h）直接使用 Binance。

`.env` 配置：

```env
OKX_BASE_URL=https://www.okx.com
BINANCE_BASE_URL=https://fapi.binance.com
PROXY_URL=
```

## 数据库迁移

当前 `PRAGMA user_version = 14`。

- v6 增加 `stop_watches` 止损观察；
- v7 增加 `trade_actions` 人工 T/清仓记录；
- v8 增加止损观察的 MFE / MAE 进度；
- v9 增加 1R / 回到入场价提醒标记；
- v10 增加监控项和信号的 `preset_id` / `preset_name`；
- v11 增加 `track_stats` 策略统计开关和 `stats_deleted` 软删除标记；
- v12 增加策略统计的 `stats_note` 备注和 `stats_result` 结果；
- v13 将旧结果迁移为轻仓结果；
- v14 增加监控项的大级别参考周期和信号的大级别趋势快照；
- v4 → v5 前会自动备份到 `data/archive/v4-<时间戳>/`；
- 旧的 `symbols` / `strategies` / `strategy_states` / `signals_v4` 保留用于回滚；
- 旧策略迁移规则：
  - `EMA_TREND` → EMA 触发条件；
  - `KDJ_TIMING` → KDJ 触发条件（旧“简易 KDJ”不再作为新策略提供）；
  - `KDJ_ENTRY` → EMA 过滤 + KDJ 触发；
- 历史信号复制到新 `signals`，显示为“历史记录”，不强行归属到新监控项；
- 旧标的/策略配置不会丢失。

## 开发

```bash
npm install
npm run dev          # server(4000) + web(3000)
npm run typecheck
npm run build
```

登录后访问 <http://localhost:3000>。

## 监控预设

新建监控项提供 1 个区间预设：

- 15m / 1h / 4h DEA 区间：一个标的创建一个监控项，内部包含 15m、1h、4h 三个区间条件；
- DEA 上拐且 DIF 上移进入多头区间，DIF 拐头提示多头衰竭，DEA 下拐且 DIF 下移进入空头区间；
- 不再使用 KDJ，也不再计算 DEA 拐头后的第几根 K 线；
- 区间开始和衰竭都会产生信号；区间信号默认不进入策略统计；
- 市场状态同时显示该标的 15m、1h、4h 的当前区间。

预设支持批量标的：逗号或换行分隔，最多 20 个；每个标的创建一个包含 15m/1h/4h 三个条件的监控项。多个标的默认关闭微信和声音，避免统计样本消耗 Server酱额度。也可以不选预设，直接用当前自定义条件批量创建。

监控项和信号会记录 `preset_id` / `preset_name`。新建监控时可以打开「纳入策略统计」开关；只有打开开关的监控入场信号会进入策略统计。选择预设会自动打开，修改条件后会自动关闭，需要手动重新确认。

首页通过「策略统计」进入独立统计页面，查看预设汇总、搜索、分页明细，并可从统计中软删除记录。统计明细的「触发条件」列展示信号生成时实际满足的条件（含周期和与/或/非逻辑），不再只展示预设名称。统计明细支持备注和结果标注，备注在列表中省略显示，点击后在弹框查看和编辑完整内容。

结果分类：

- 轻仓成功；
- 重仓成功；
- 轻仓合理止损；
- 重仓合理止损；
- 轻仓失败；
- 重仓失败；
- 不适合入场；
- 其他。

旧版本的「成功 / 合理止损 / 失败」会自动迁移为对应的轻仓结果。统计页面可以按标的筛选结果，展示每种结果的数量和占比。

新建监控项可以选择记录 15m、1h、4h 的 DEA 走势作为参考。参考走势只用于展示和统计记录，不参与过滤或触发。信号产生时会保存当时三个周期的 DEA 方向、拐头、加速、走弱状态；历史信号可在统计页面点击「还原历史趋势」尝试从行情历史补全，无法获取的周期保持为空。

监控列表会显示大级别参考周期标签；信号记录和策略统计使用不同颜色的方向标签与大级别趋势标签，向上/向下、拐头/加速/走弱可直接区分。监控列表按最近信号排序，市场状态中展示每个参考周期的当前趋势。

策略统计支持页码跳转、当前页批量删除、按标的/类型/结果筛选和 Excel 导出，并显示未填写结果数量；未填写行使用淡色背景。导出可选择全部标的或指定标的，并可按信号发生时间设置起止范围；工作簿包含统计明细、标的统计、结果统计，以及一张以标的为横轴、结果占比为纵轴的分组柱状图。柱子上标注对应结果的实际次数，未填写结果的记录不参与柱状图统计，数量为 0 的结果和标的不会出现在图表中。

旧版信号默认 `track_stats=0`，不会进入统计和导出。

监控项列表支持勾选后批量请求、批量删除，以及批量修改微信通知和声音提醒开关。

当前阶段风险类信号（止损触发、达到 1R、回到入场价）只落库，不展示在信号记录，也不发送通知；后续再启用。

## 部署

仍使用 `docker-compose.yml` 的 `monitor-data` 数据卷。不要执行 `docker compose down -v`，否则会删除数据库卷。

### 一键部署脚本

服务器上进入项目目录后执行：

```bash
cd /opt/crypto-market-monitor
./scripts/deploy.sh
```

脚本会依次完成：

1. 部署锁，避免并发部署；
2. 检查工作区是否有已跟踪文件改动；
3. 备份数据库；
4. `git pull --ff-only origin main`；
5. `docker compose build`；
6. `docker compose up -d --remove-orphans`；
7. 轮询 `/api/health`，最多等待约 3 分钟；
8. 失败时打印容器状态、server 日志和回滚命令。

也可以手动分步执行：

```bash
./scripts/backup-db.sh
git status
git pull --ff-only
docker compose build
docker compose up -d
docker compose logs --tail=100 server
curl -fsS http://127.0.0.1/api/health
```

### GitHub Actions 自动部署

推送 `main` 后，`.github/workflows/deploy.yml` 会通过 SSH 登录服务器执行 `scripts/deploy.sh`，并校验服务器实际部署的 commit 与本次工作流 commit 一致。

前置条件：

- 服务器项目目录固定为 `/opt/crypto-market-monitor`，或通过 `DEPLOY_PATH` 指定；
- 服务器上 `git pull` 能非交互执行，例如已配置 GitHub Deploy Key；
- 服务器安装 Docker、Docker Compose、curl、flock；
- 仓库 Settings → Secrets and variables → Actions 添加：

| Secret | 必填 | 说明 |
|---|---|---|
| `DEPLOY_HOST` | 是 | 服务器 IP 或域名 |
| `DEPLOY_USER` | 是 | SSH 用户名 |
| `DEPLOY_SSH_KEY` | 是* | CI 登录服务器的私钥全文 |
| `DEPLOY_SSH_KEY_B64` | 是* | 私钥文件的 Base64，推荐使用，避免换行被破坏 |
| `DEPLOY_PORT` | 否 | SSH 端口，默认 `22` |
| `DEPLOY_PATH` | 否 | 项目路径，默认 `/opt/crypto-market-monitor` |
| `DEPLOY_KNOWN_HOSTS` | 否 | 服务器 host key；不填则工作流使用 `ssh-keyscan` |

\* `DEPLOY_SSH_KEY` 和 `DEPLOY_SSH_KEY_B64` 二选一。

注意：workflow 声明了 `environment: production`，如果 `production` 环境 Secret 和 Repository Secret 同名，**Environment Secret 会覆盖 Repository Secret**。更新 Secret 后如果仍读到旧值，检查这两个位置是否都配置了同名项，删掉旧的那一份。

生成 CI 登录密钥：

```bash
ssh-keygen -t ed25519 -C "crypto-market-monitor-ci" -f ~/.ssh/crypto-monitor-ci
cat ~/.ssh/crypto-monitor-ci.pub >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

推荐把私钥转成 Base64 后填入 `DEPLOY_SSH_KEY_B64`。

私钥在服务器上生成即可，不要求本机有私钥文件。PowerShell 命令只是 Windows 本地文件转 Base64 的写法；如果私钥只在服务器上，直接执行：

```bash
base64 -w0 ~/.ssh/crypto-monitor-ci
```

把输出填入 `DEPLOY_SSH_KEY_B64`。不要把 Base64 字符串填到 `DEPLOY_SSH_KEY`，后者需要私钥原文。

Linux：

```bash
base64 -w0 ~/.ssh/crypto-monitor-ci
```

macOS：

```bash
base64 < ~/.ssh/crypto-monitor-ci | tr -d '\n'
```

Windows PowerShell：

```powershell
[Convert]::ToBase64String(
  [IO.File]::ReadAllBytes("$HOME\.ssh\crypto-monitor-ci")
)
```

也可以直接填私钥原文到 `DEPLOY_SSH_KEY`，工作流会兼容字面量 `\n` 和 CRLF，并在使用前校验私钥格式、打印指纹。

### SSH 报错排查

如果日志出现：

```text
Load key ... error in libcrypto
```

说明私钥内容无法解析，常见原因是 Secret 中的换行被破坏、填成了 `.pub` 公钥、私钥有 passphrase，或使用了 PuTTY `.ppk` 格式。优先改用 `DEPLOY_SSH_KEY_B64`，并在本地验证：

```bash
ssh-keygen -y -f ~/.ssh/crypto-monitor-ci
```

能输出公钥才说明私钥格式正确。

如果出现：

```text
Permission denied (publickey)
```

说明密钥格式正确，但服务器不接受这把公钥。检查：

```bash
whoami
grep "crypto-market-monitor-ci" ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

并在本地直接测试：

```bash
ssh -i ~/.ssh/crypto-monitor-ci -p 22 <DEPLOY_USER>@<DEPLOY_HOST>
```

服务器拉代码的 GitHub 权限单独配置，例如生成只读 Deploy Key：

```bash
ssh-keygen -t ed25519 -C "crypto-market-monitor-server" -f ~/.ssh/crypto-market-monitor-git
cat ~/.ssh/crypto-market-monitor-git.pub
```

把公钥添加到 GitHub 仓库 Settings → Deploy keys，并在服务器 `~/.ssh/config` 中为 `github.com` 指定该私钥，确保：

```bash
git -C /opt/crypto-market-monitor fetch origin main
```

可以非交互执行。

如需人工审批后再部署，可在 GitHub 仓库 Settings → Environments 创建 `production` 环境并配置 Required reviewers。

### 回滚

脚本失败时不会自动回滚数据库迁移，会打印部署前 commit。代码回滚：

```bash
git reset --hard <部署前-commit>
docker compose build
docker compose up -d
```

数据库回滚需要结合 `data/archive/` 和 `backups/` 中的备份人工处理。

## 说明

- 只做行情监控和提醒，不执行自动交易；
- 浏览器声音提醒需要保持标签页打开；
- 微信通知需要同时满足全局开关、监控项开关、SendKey 配置和信号新鲜度。
