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
- **过滤条件**：触发发生时必须同时有效；可使用检查周期或更高周期；
- 条件周期不得低于自动计算出的检查周期；至少一个触发条件，过滤条件可选。
- 检查周期取所有触发条件中的最小周期。例如 EMA 15m + KDJ 5m，检查周期自动为 5m。

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

- 参数：`fast`、`slow`、`threshold`；
- 触发事件：达到距离阈值的金叉 / 死叉；
- 过滤状态：`BULL_WAITING` / `BEAR_WAITING`；
- 展示：多空排列、最近交叉、交叉价、EMA 距离、阈值。

### `KDJ_EXTREME`

- 参数：`period`、`kSmooth`、`dSmooth`、`oversold`、`overbought`、`longEnabled`、`shortEnabled`；
- 触发事件：J 下穿超卖 → 做多；J 上穿超买 → 做空；
- 过滤状态：当前 J 低于超卖阈值（多头）或高于超买阈值（空头）；
- 展示：J/K/D、超买/超卖状态、阈值。

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

未来新增 MACD 等指标时，只需增加条件定义和字段元数据，前端条件编辑器会自动渲染。

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
| GET/PUT | `/api/settings` | 全局监控开关、全局微信通知开关 |

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

当前 `PRAGMA user_version = 5`。

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

## 部署

仍使用 `docker-compose.yml` 的 `monitor-data` 数据卷。升级时执行：

```bash
./scripts/backup-db.sh
git pull
docker compose up -d --build
```

不要执行 `docker compose down -v`，否则会删除数据库卷。

## 说明

- 只做行情监控和提醒，不执行自动交易；
- 浏览器声音提醒需要保持标签页打开；
- 微信通知需要同时满足全局开关、监控项开关、SendKey 配置和信号新鲜度。
