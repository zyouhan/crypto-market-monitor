# Crypto Market Monitor

加密货币（Binance USDⓈ-M Futures）多指标监控系统：

- **EMA 定趋势**：有效金叉 → 看涨等待；有效死叉 → 看跌等待。
- **KDJ 找入场**：看涨等待中 J 下穿超卖阈值 → 做多提醒；看跌等待中 J 上穿超买阈值 → 做空提醒。
- **threshold** 过滤横盘中的小幅反复交叉。
- SQLite 落库、ServerChan（Server酱）微信推送、Next.js 管理页面。

## 目录结构

```
crypto-market-monitor/
├─ apps/server/src/
│  ├─ config/            默认参数、默认标的、路径
│  ├─ db/                SQLite 连接、v2 schema、数据访问
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

1. 第一根交叉只建立基准。
2. 同向交叉忽略，不更新基准。
3. 反向交叉计算 `|交叉价 - 基准价|`：
   - **严格大于** `threshold` → 确认转折：
     - 金叉 → `BULL_WAITING`（看涨等待）
     - 死叉 → `BEAR_WAITING`（看跌等待）
   - 未过阈值 → 状态不变，仅更新基准，并记录一条 `trigger_met=0` 的信号。
4. 每次满足阈值的交叉都会推送趋势提醒（同状态再确认也推送）。

示例（阈值 10）：

| 步骤 | 交叉 | 价差 | 结果 |
|---|---|---|---|
| 起点 | 有效死叉 100 | — | 看跌等待，基准 100 |
| 1 | 金叉 103 | 3 | 未过阈值，基准改为 103，仍看跌等待 |
| 2 | 死叉 120 | 17 | 过阈值，看跌再确认，基准 120，推送趋势提醒 |

### 2. KDJ 入场（`KDJ_ENTRY`）

- RSV = `(C - LLV(Low, N)) / (HHV(High, N) - LLV(Low, N)) × 100`（区间为 0 时取 50）
- `K = ((kSmooth-1) × 前K + RSV) / kSmooth`
- `D = ((dSmooth-1) × 前D + K) / dSmooth`
- `J = 3K - 2D`

触发条件：

- 趋势 `BULL_WAITING` 且做多开启，J 从 `≥ oversold` 变为 `< oversold` → `ENTRY_LONG`
- 趋势 `BEAR_WAITING` 且做空开启，J 从 `≤ overbought` 变为 `> overbought` → `ENTRY_SHORT`

**排列过滤**：入场还要求「等待方向与当前 EMA 排列一致」——做多必须快线在慢线上方，做空必须快线在慢线下方。这样当死叉 100 → 金叉 103（未过阈值，趋势状态仍是看跌等待）后价格一路走强，EMA 已转为多头排列，不会继续提示超买做空；等到下一次满足阈值的死叉才会重新对齐并恢复做空等待。页面会在状态徽标上标注「排列冲突」，入场徽标显示「暂停入场」。

每次有效上穿/下穿各提醒一次；趋势未翻转前可反复触发，但必须保持排列一致。

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
| GET | `/api/signals` | 信号记录，支持 `limit/offset/symbol/kind/event_type` |
| GET/PUT | `/api/settings` | 全局通知开关（不返回 SendKey） |

## 数据库

- 核心表：`symbols`、`strategies`、`strategy_states`、`signals`、`settings`。
- `PRAGMA user_version` 标记结构版本（当前 2）。
- 启动时若检测到 v1 旧库，会整体移动到 `data/archive/v1-<时间戳>/` 后重建并 seed 默认标的。
- 信号唯一键：`(symbol_id, kind, event_type, event_time)`，重复处理不会重复写库。

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

## 后续扩展（MACD 等）

1. `indicators/macd.ts`：纯计算。
2. `strategies/macd-*.ts`：实现 `StrategyRunner`（状态机 + 信号草稿）。
3. `strategies/registry.ts`：注册一行。
4. `strategies/params.ts`：默认参数与校验。
5. `config/defaults.ts`：需要默认启用时加入 seed。

表结构、引擎编排与通知无需改动。
