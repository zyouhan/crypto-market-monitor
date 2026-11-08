# Crypto Market Monitor

加密货币（Binance USDⓈ-M Futures）多指标监控系统：

- **EMA 定趋势**：两次交叉点的**慢线 EMA 距离**超过阈值才确认转折；等待期间 EMA 反向偏离超过阈值则失效。
- **KDJ 找入场**：看涨等待中 J 下穿超卖阈值 → 做多提醒；看跌等待中 J 上穿超买阈值 → 做空提醒。
- **threshold** 过滤横盘中的小幅反复交叉，并作为等待状态的失效距离。
- SQLite 落库、ServerChan（Server酱）微信推送、Next.js 管理页面。

## 目录结构

```
crypto-market-monitor/
├─ apps/server/src/
│  ├─ config/            默认参数、默认标的、路径
│  ├─ db/                SQLite 连接、schema 迁移、数据访问
│  ├─ market/binance.ts  Binance K 线获取（只取已收盘）
│  ├─ indicators/        EMA、KDJ 纯计算
│  ├─ strategies/        策略注册表与状态机（EMA_TREND / KDJ_ENTRY）
│  ├─ engine/            worker 轮询、单轮编排、通知
│  ├─ api/               路由、鉴权、中间件
│  └─ scripts/replay.ts  只读回放脚本
├─ apps/web/app/         Next.js 页面（components / lib / types）
└─ data/                 SQLite 数据（v1 旧库自动归档到 data/archive/）
```

## 策略规则

### 1. EMA 趋势（`EMA_TREND`）

每一次交叉同时记录交叉价格与该根 K 线的**慢线 EMA**，趋势判定使用慢线 EMA：

1. 第一根交叉只建立基准（类型、价格、时间、慢线 EMA）。
2. 同向交叉忽略，不更新基准。
3. 反向交叉计算：
   - `emaDiff = |本次交叉慢线 EMA - 基准交叉慢线 EMA|`（判定依据）
   - `priceDiff = |本次交叉价 - 基准交叉价|`（仅记录，供参考）
   - **严格大于** `threshold` → 确认转折：金叉 → `BULL_WAITING`，死叉 → `BEAR_WAITING`
   - 未过阈值 → 状态不变，仅更新基准，并记录一条 `trigger_met=0` 的信号。
4. 无论是否过阈值，基准都更新为本次交叉。
5. **等待失效**：等待期间持续比较当前慢线 EMA 与基准交叉 EMA：
   - 看跌等待：`当前 EMA - 基准 EMA > threshold` → 失效为中性
   - 看涨等待：`基准 EMA - 当前 EMA > threshold` → 失效为中性
   - 失效只改变状态、不改基准，记录一条不推送的 `TREND_INVALIDATED`；下一次交叉重新判定。

示例（阈值 10，A 形走势）：

| 步骤 | 交叉 | 慢线 EMA | EMA 距离 | 结果 |
|---|---|---|---|---|
| 起点 | 金叉 | 100 | — | 建立基准，中性 |
| 1 | 死叉 | 115 | 15 | 过阈值 → 看跌等待（价格可能只回到 100，但 EMA 已走开） |
| 2 | 金叉 | 101 | 14 | 过阈值 → 看涨等待 |

示例（未过阈值 + 续涨失效，阈值 10）：

| 步骤 | 交叉/状态 | 慢线 EMA | 结果 |
|---|---|---|---|
| 起点 | 有效死叉 | 100 | 看跌等待，基准 100 |
| 1 | 金叉 | 101 | 距离 1，未过阈值；基准更新为 101，仍看跌等待 |
| 2 | 无新交叉，价格续涨 | 112 | 反向偏离 11 > 10 → 失效为中性，暂停做空 |
| 3 | 之后的死叉 | 120 | 距离 19 > 10 → 看跌确认，恢复做空等待 |

> 阈值是绝对数值，与 EMA 同单位。BTC 等高价位标的请按标的调整阈值。

### 2. KDJ 入场（`KDJ_ENTRY`）

- RSV = `(C - LLV(Low, N)) / (HHV(High, N) - LLV(Low, N)) × 100`（区间为 0 时取 50）
- `K = ((kSmooth-1) × 前K + RSV) / kSmooth`
- `D = ((dSmooth-1) × 前D + K) / dSmooth`
- `J = 3K - 2D`

触发条件：

- 趋势 `BULL_WAITING` 且做多开启，J 从 `≥ oversold` 变为 `< oversold` → `ENTRY_LONG`
- 趋势 `BEAR_WAITING` 且做空开启，J 从 `≤ overbought` 变为 `> overbought` → `ENTRY_SHORT`

入场不再要求 EMA 排列一致；趋势是否仍然有效由上面的 EMA 距离/失效规则决定。页面上的「多头排列 / 空头排列」仅为展示。

前端提示：

- 轮询发现新触发信号时，右下角弹出提示卡片（10 秒自动消失，可手动关闭）；
- 每个标的卡片显示该标的最近一条触发信号。

每次有效上穿/下穿各提醒一次；同一等待周期内可反复触发。

### 3. 通知闸门

顺序：新鲜度（`now - 2 × 周期` 内）→ 全局开关 → 标的开关 → 策略开关 → SendKey 是否配置 → 发送。

## 默认参数

| 策略 | 参数 |
|---|---|
| EMA_TREND | fast=25, slow=60, threshold=10 |
| KDJ_ENTRY | period=9, kSmooth=3, dSmooth=3, oversold=5, overbought=85，多空均开启 |

默认标的：`ETHUSDT`、`BTCUSDT`（均为 1m）。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查（含 worker 状态） |
| POST | `/api/auth/login` / `/api/auth/logout` | 登录 / 退出 |
| GET | `/api/auth/me` | 登录状态 |
| GET | `/api/symbols` | 标的 + 策略 + 状态 |
| POST | `/api/symbols` | 新增标的（可带 `strategies[]`） |
| PUT | `/api/symbols/:id` | 改配置；参数/开关/周期变化会静默重新预热 |
| DELETE | `/api/symbols/:id` | 级联删除策略、状态与信号 |
| GET | `/api/signals` | 信号记录，支持 `limit/offset/symbol/kind/event_type/triggered`；`triggered=1` 只返回触发信号 |
| GET/PUT | `/api/settings` | 全局通知开关（不返回 SendKey） |

## 数据库

- 核心表：`symbols`、`strategies`、`strategy_states`、`signals`、`settings`。
- `PRAGMA user_version` 标记结构版本（当前 3）。
- v1 旧库：启动时整体移动到 `data/archive/v1-<时间戳>/` 后重建。
- v2 → v3：原地 `ALTER TABLE` 补 `baseline_ema` / `ema_diff`，随后清空策略状态并把处理进度归零（静默重新预热）；**历史信号与标的配置保留**。
- 信号唯一键：`(symbol_id, kind, event_type, event_time)`，重复处理不会重复写库。
- 旧版趋势信号的 `ema_diff` 为 `NULL`，页面显示 `--`。

## 开发

```bash
npm install
npm run dev          # 同时启动 server(4000) 与 web(3000)
npm run typecheck
npm run build
```

只读回放（不写库、不推送）：

```bash
npm run replay --workspace=crypto-market-monitor-server -- --symbol ETHUSDT --interval 1m
```

也可以离线回放 JSON K 线：

```bash
npx tsx src/scripts/replay.ts --json fixtures/klines.json
```

## 轮询与扩容

- `POLL_INTERVAL_MS` 只是 worker 的**扫描节拍**，不是每个标的的请求间隔。
- 每个标的只在「上一根已处理 K 线收盘时间 + 该标的周期」之后才会请求 Binance：
  - 1m 标的约 1 次/分钟；
  - 5m 标的约 1 次/5 分钟；
  - 15m/1h 标的按各自周期，不会跟着 1m 空转；
  - 1M 标的按 UTC 自然月计算下一根收盘时间，不用 30 天近似。
- `MAX_CONCURRENT_SYMBOLS`（默认 3，最大 10）控制同时拉取的标的数，避免标的多时一轮被串行网络延迟拖长。
- 失败退避：单个标的请求失败后按 30s → 60s → 120s → 240s 退避，最长 5 分钟，成功后恢复。
- 前端看板每 15 秒拉取一次；标签页隐藏时暂停轮询，回到前台立即刷新。
- 粗略容量：Binance `/fapi/v1/klines`（limit=300）单次权重约 2，限流约 2400 权重/分钟；100 个 1m 标的约 200 权重/分钟，远低于限制，真正的瓶颈通常是代理延迟与一轮耗时，所以用并发控制而不是一味拉长间隔。
- 如果想进一步减少 1m 标的请求量，把 `POLL_INTERVAL_MS` 调到 120000/180000 即可（代价是信号最多延迟 2-3 分钟）。

## 后续扩展（MACD 等）

1. `indicators/macd.ts`：纯计算。
2. `strategies/macd-*.ts`：实现 `StrategyRunner`（状态机 + 信号草稿）。
3. `strategies/registry.ts`：注册一行。
4. `strategies/params.ts`：默认参数与校验。
5. `config/defaults.ts`：需要默认启用时加入 seed。

表结构、引擎编排与通知无需改动。
