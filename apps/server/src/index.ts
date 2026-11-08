
import "dotenv/config";

import express, {
  type Request,
  type Response,
  type NextFunction
} from "express";

import cookieParser from "cookie-parser";

import {
  db,
  getSymbols,
  getSymbolById,
  getEvents,
  getSetting,
  setSetting
} from "./db";

import {
  verifyCredentials,
  setSessionCookie,
  clearSessionCookie,
  requireAuth
} from "./auth";

import { isValidInterval } from "./binance";
import { startWorker, stopWorker } from "./worker";

const app = express();

const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || "0.0.0.0";

const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "http://localhost:3000";

app.disable("x-powered-by");

app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

/**
 * 统一 API 响应格式
 */
function success(data: unknown, message = "操作成功") {
  return {
    success: true,
    message,
    data
  };
}

function failure(message: string) {
  return {
    success: false,
    message
  };
}

/**
 * 基础输入校验
 */
function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0
  );
}

function isValidThreshold(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
  );
}

function isValidSymbol(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Z0-9]{2,30}$/.test(value)
  );
}

/**
 * API 来源校验。
 *
 * 浏览器请求必须来自配置的前端 Origin。
 * 不带 Origin 的服务端请求允许通过。
 */
app.use("/api", (req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") {
    next();
    return;
  }

  const origin = req.headers.origin;

  if (origin && origin !== FRONTEND_ORIGIN) {
    res.status(403).json(failure("请求来源不合法"));
    return;
  }

  next();
});

/**
 * 健康检查
 */
app.get("/api/health", (_req, res) => {
  res.json(
    success({
      status: "ok",
      timestamp: Date.now()
    })
  );
});

/**
 * 登录
 */
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body ?? {};

  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    !username ||
    !password
  ) {
    res.status(400).json(failure("请输入用户名和密码"));
    return;
  }

  if (!verifyCredentials(username, password)) {
    res.status(401).json(failure("用户名或密码错误"));
    return;
  }

  setSessionCookie(res, username);

  res.json(
    success({
      username
    }, "登录成功")
  );
});

/**
 * 退出登录
 */
app.post("/api/auth/logout", (_req, res) => {
  clearSessionCookie(res);

  res.json(success(null, "已退出登录"));
});

/**
 * 查询登录状态
 */
app.get("/api/auth/me", requireAuth, (_req, res) => {
  res.json(
    success({
      authenticated: true,
      username: process.env.ADMIN_USERNAME
    })
  );
});

/**
 * 以下接口全部需要登录
 */
app.use("/api", (req, res, next) => {
  if (
    req.path === "/health" ||
    req.path === "/auth/login" ||
    req.path === "/auth/logout" ||
    req.path === "/auth/me"
  ) {
    next();
    return;
  }

  requireAuth(req, res, next);
});

/**
 * 获取监控标的列表
 */
app.get("/api/symbols", (_req, res) => {
  res.json(success(getSymbols()));
});

/**
 * 添加监控标的
 *
 * 请求示例：
 * {
 *   "symbol": "BTCUSDT",
 *   "interval": "1m",
 *   "fast_ema": 9,
 *   "slow_ema": 21,
 *   "threshold": 10,
 *   "notify_enabled": false
 * }
 */
app.post("/api/symbols", (req, res) => {
  const {
    symbol,
    interval = "1m",
    fast_ema = 9,
    slow_ema = 21,
    threshold = 10,
    notify_enabled = false
  } = req.body ?? {};

  const normalizedSymbol =
    typeof symbol === "string"
      ? symbol.trim().toUpperCase()
      : "";

  if (!isValidSymbol(normalizedSymbol)) {
    res.status(400).json(failure("交易标的格式不正确"));
    return;
  }

  if (
    typeof interval !== "string" ||
    !isValidInterval(interval)
  ) {
    res.status(400).json(failure("不支持的 K 线周期"));
    return;
  }

  if (
    !isPositiveInteger(fast_ema) ||
    !isPositiveInteger(slow_ema) ||
    fast_ema >= slow_ema
  ) {
    res.status(400).json(
      failure("EMA 参数不正确，快线周期必须小于慢线周期")
    );
    return;
  }

  if (!isValidThreshold(threshold)) {
    res.status(400).json(failure("价格差阈值不正确"));
    return;
  }

  if (typeof notify_enabled !== "boolean") {
    res.status(400).json(failure("通知开关必须为布尔值"));
    return;
  }

  const now = Date.now();

  try {
    const result = db.prepare(`
      INSERT INTO symbols (
        symbol,
        interval,
        fast_ema,
        slow_ema,
        threshold,
        enabled,
        notify_enabled,
        current_state,
        last_processed_close_time,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, 'UNKNOWN', 0, ?, ?)
    `).run(
      normalizedSymbol,
      interval,
      fast_ema,
      slow_ema,
      threshold,
      notify_enabled ? 1 : 0,
      now,
      now
    );

    const newSymbol = getSymbolById(
      Number(result.lastInsertRowid)
    );

    res.status(201).json(success(newSymbol, "添加成功"));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "";

    if (message.includes("UNIQUE constraint failed")) {
      res.status(409).json(failure("该交易标的已经存在"));
      return;
    }

    console.error("[API] 添加标的失败:", error);

    res.status(500).json(failure("添加标的失败"));
  }
});

/**
 * 修改监控配置
 */
app.put("/api/symbols/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!isPositiveInteger(id)) {
    res.status(400).json(failure("标的 ID 不正确"));
    return;
  }

  const existing = getSymbolById(id);

  if (!existing) {
    res.status(404).json(failure("监控标的不存在"));
    return;
  }

  const body = req.body ?? {};

  const interval = body.interval ?? existing.interval;
  const fastEma = body.fast_ema ?? existing.fast_ema;
  const slowEma = body.slow_ema ?? existing.slow_ema;
  const threshold = body.threshold ?? existing.threshold;

  const enabled =
    body.enabled === undefined
      ? existing.enabled
      : body.enabled;

  const notifyEnabled =
    body.notify_enabled === undefined
      ? existing.notify_enabled
      : body.notify_enabled;

  if (
    typeof interval !== "string" ||
    !isValidInterval(interval)
  ) {
    res.status(400).json(failure("不支持的 K 线周期"));
    return;
  }

  if (
    !isPositiveInteger(fastEma) ||
    !isPositiveInteger(slowEma) ||
    fastEma >= slowEma
  ) {
    res.status(400).json(failure("EMA 参数不正确"));
    return;
  }

  if (!isValidThreshold(threshold)) {
    res.status(400).json(failure("价格差阈值不正确"));
    return;
  }

  if (
    typeof enabled !== "boolean" &&
    enabled !== 0 &&
    enabled !== 1
  ) {
    res.status(400).json(failure("监控开关不正确"));
    return;
  }

  if (
    typeof notifyEnabled !== "boolean" &&
    notifyEnabled !== 0 &&
    notifyEnabled !== 1
  ) {
    res.status(400).json(failure("通知开关不正确"));
    return;
  }

  const strategyChanged =
    interval !== existing.interval ||
    fastEma !== existing.fast_ema ||
    slowEma !== existing.slow_ema;

  db.prepare(`
    UPDATE symbols
    SET
      interval = ?,
      fast_ema = ?,
      slow_ema = ?,
      threshold = ?,
      enabled = ?,
      notify_enabled = ?,

      current_state = CASE
        WHEN ? = 1 THEN 'UNKNOWN'
        ELSE current_state
      END,

      last_cross_type = CASE
        WHEN ? = 1 THEN NULL
        ELSE last_cross_type
      END,

      last_cross_price = CASE
        WHEN ? = 1 THEN NULL
        ELSE last_cross_price
      END,

      last_cross_time = CASE
        WHEN ? = 1 THEN NULL
        ELSE last_cross_time
      END,

      last_processed_close_time = CASE
        WHEN ? = 1 THEN 0
        ELSE last_processed_close_time
      END,

      updated_at = ?
    WHERE id = ?
  `).run(
    interval,
    fastEma,
    slowEma,
    threshold,
    enabled ? 1 : 0,
    notifyEnabled ? 1 : 0,
    strategyChanged ? 1 : 0,
    strategyChanged ? 1 : 0,
    strategyChanged ? 1 : 0,
    strategyChanged ? 1 : 0,
    strategyChanged ? 1 : 0,
    Date.now(),
    id
  );

  res.json(
    success(getSymbolById(id), "配置已更新")
  );
});

/**
 * 删除监控标的
 */
app.delete("/api/symbols/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!isPositiveInteger(id)) {
    res.status(400).json(failure("标的 ID 不正确"));
    return;
  }

  const result = db.prepare(`
    DELETE FROM symbols
    WHERE id = ?
  `).run(id);

  if (result.changes === 0) {
    res.status(404).json(failure("监控标的不存在"));
    return;
  }

  res.json(success(null, "删除成功"));
});

/**
 * 获取事件历史
 *
 * 支持：
 * /api/events?limit=50&offset=0
 * /api/events?symbol=ETHUSDT
 */
app.get("/api/events", (req, res) => {
  const limitValue = Number(req.query.limit ?? 50);
  const offsetValue = Number(req.query.offset ?? 0);

  const limit = Math.min(
    Math.max(Math.floor(limitValue) || 50, 1),
    200
  );

  const offset = Math.max(
    Math.floor(offsetValue) || 0,
    0
  );

  const symbol =
    typeof req.query.symbol === "string"
      ? req.query.symbol.trim().toUpperCase()
      : "";

  let events;

  if (symbol) {
    events = db.prepare(`
      SELECT *
      FROM events
      WHERE symbol = ?
      ORDER BY cross_time DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(symbol, limit, offset);
  } else {
    events = getEvents(limit, offset);
  }

  res.json(
    success({
      items: events,
      limit,
      offset
    })
  );
});

/**
 * 获取全局设置
 *
 * 不向前端返回 SendKey。
 */
app.get("/api/settings", (_req, res) => {
  const globalWechatEnabled =
    getSetting("global_wechat_enabled") === "true";

  res.json(
    success({
      global_wechat_enabled: globalWechatEnabled,
      serverchan_configured: Boolean(
        process.env.SERVERCHAN_SENDKEY
      )
    })
  );
});

/**
 * 更新全局设置
 */
app.put("/api/settings", (req, res) => {
  const { global_wechat_enabled } = req.body ?? {};

  if (typeof global_wechat_enabled !== "boolean") {
    res.status(400).json(
      failure("global_wechat_enabled 必须为布尔值")
    );
    return;
  }

  setSetting(
    "global_wechat_enabled",
    global_wechat_enabled ? "true" : "false"
  );

  res.json(
    success({
      global_wechat_enabled
    }, "全局设置已更新")
  );
});

/**
 * 404
 */
app.use("/api", (_req, res) => {
  res.status(404).json(failure("API 不存在"));
});

/**
 * 全局错误处理
 */
app.use((
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error("[API] 未处理错误:", error);

  if (res.headersSent) {
    return;
  }

  res.status(500).json(failure("服务器内部错误"));
});

/**
 * 启动服务
 */
const server = app.listen(PORT, HOST, () => {
  console.log(
    `[Server] API 服务已启动: http://${HOST}:${PORT}`
  );

  startWorker();
});

/**
 * 优雅关闭
 */
let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log(`[Server] 收到 ${signal}，准备关闭`);

  stopWorker();

  server.close(() => {
    db.close();

    console.log("[Server] 服务已关闭");

    process.exit(0);
  });

  setTimeout(() => {
    console.error("[Server] 关闭超时，强制退出");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
