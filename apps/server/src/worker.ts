
import { db, getSymbols, getSetting } from "./db";
import type { SymbolConfig, CrossType } from "./db";

import { getKlines } from "./binance";
import { findCrosses, getCurrentEmaState } from "./strategy";
import { sendWechatNotification } from "./notify";

const POLL_INTERVAL_MS = Math.max(
  Number(process.env.POLL_INTERVAL_MS) || 10000,
  5000
);

const INTERVAL_MS: Record<string, number> = {
  "1m": 60 * 1000,
  "3m": 3 * 60 * 1000,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "2h": 2 * 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "8h": 8 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000
};

interface PendingNotification {
  eventId: number;
  symbol: string;
  crossType: CrossType;
  crossPrice: number;
  crossTime: number;
  previousPrice: number;
  priceDiff: number;
  threshold: number;
}

function getCrossName(type: CrossType): string {
  return type === "GOLDEN" ? "金叉" : "死叉";
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false
  });
}

function getIntervalDuration(interval: string): number {
  return INTERVAL_MS[interval] || 60 * 1000;
}

/**
 * 首次启动初始化。
 *
 * 使用当前 K 线数据找到最近一次历史交叉作为比较基准。
 * 不将历史交叉写成实时事件，也不发送历史通知。
 */
function initializeSymbol(
  symbol: SymbolConfig,
  klines: Awaited<ReturnType<typeof getKlines>>
): void {
  const crosses = findCrosses(
    klines,
    symbol.fast_ema,
    symbol.slow_ema
  );

  const latestCross = crosses[crosses.length - 1];

  const latestKline = klines[klines.length - 1];

  if (!latestKline) {
    return;
  }

  const currentState = getCurrentEmaState(
    klines,
    symbol.fast_ema,
    symbol.slow_ema
  );

  db.prepare(`
    UPDATE symbols
    SET
      current_state = ?,
      last_cross_type = ?,
      last_cross_price = ?,
      last_cross_time = ?,
      last_processed_close_time = ?,
      last_price = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    currentState,
    latestCross?.type ?? null,
    latestCross?.price ?? null,
    latestCross?.time ?? null,
    latestKline.closeTime,
    latestKline.close,
    Date.now(),
    symbol.id
  );

  console.log(
    `[Worker] 初始化 ${symbol.symbol}: ${currentState}, ` +
    `最近交叉: ${latestCross ? getCrossName(latestCross.type) : "无"}`
  );
}

/**
 * 处理一个标的。
 */
async function processSymbol(
  symbol: SymbolConfig,
  globalNotifyEnabled: boolean
): Promise<void> {
  const klines = await getKlines(
    symbol.symbol,
    symbol.interval
  );

  if (klines.length === 0) {
    return;
  }

  const latestKline = klines[klines.length - 1];

  const crosses = findCrosses(
    klines,
    symbol.fast_ema,
    symbol.slow_ema
  );

  const currentState = getCurrentEmaState(
    klines,
    symbol.fast_ema,
    symbol.slow_ema
  );

  // 首次初始化，不补发历史交叉通知
  if (symbol.last_processed_close_time === 0) {
    initializeSymbol(symbol, klines);
    return;
  }

  const newCrosses = crosses.filter(
    (cross) =>
      cross.time > symbol.last_processed_close_time
  );

  const pendingNotifications: PendingNotification[] = [];

  const processTransaction = db.transaction(() => {
    let baselineType = symbol.last_cross_type;
    let baselinePrice = symbol.last_cross_price;
    let baselineTime = symbol.last_cross_time;

    const insertEvent = db.prepare(`
      INSERT OR IGNORE INTO events (
        symbol_id,
        symbol,
        cross_type,
        cross_price,
        cross_time,
        previous_cross_type,
        previous_cross_price,
        previous_cross_time,
        price_diff,
        threshold,
        trigger_met,
        push_sent,
        reason,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const cross of newCrosses) {
      // 第一次交叉只建立基准
      if (
        baselineType === null ||
        baselinePrice === null ||
        baselineTime === null
      ) {
        baselineType = cross.type;
        baselinePrice = cross.price;
        baselineTime = cross.time;
        continue;
      }

      // 同方向交叉忽略，不更新基准
      if (cross.type === baselineType) {
        continue;
      }

      // 反向交叉：计算价格差
      const priceDiff = Math.abs(
        cross.price - baselinePrice
      );

      // 必须严格大于阈值
      const triggerMet = priceDiff > symbol.threshold;

      const isFresh =
        cross.time >=
        Date.now() - getIntervalDuration(symbol.interval) * 2;

      const shouldNotify =
        triggerMet &&
        isFresh &&
        globalNotifyEnabled &&
        symbol.notify_enabled === 1 &&
        Boolean(process.env.SERVERCHAN_SENDKEY);

      const reason = !triggerMet
        ? "price_diff_not_exceeded"
        : !isFresh
          ? "stale_cross_suppressed"
          : !globalNotifyEnabled
            ? "global_notification_disabled"
            : symbol.notify_enabled !== 1
              ? "symbol_notification_disabled"
              : !process.env.SERVERCHAN_SENDKEY
                ? "serverchan_sendkey_missing"
                : "notification_pending";

      const result = insertEvent.run(
        symbol.id,
        symbol.symbol,
        cross.type,
        cross.price,
        cross.time,
        baselineType,
        baselinePrice,
        baselineTime,
        priceDiff,
        symbol.threshold,
        triggerMet ? 1 : 0,
        0,
        reason,
        Date.now()
      );

      // 已经处理过的事件不再重复发送
      if (result.changes > 0 && shouldNotify) {
        pendingNotifications.push({
          eventId: Number(result.lastInsertRowid),
          symbol: symbol.symbol,
          crossType: cross.type,
          crossPrice: cross.price,
          crossTime: cross.time,
          previousPrice: baselinePrice,
          priceDiff,
          threshold: symbol.threshold
        });
      }

      // 无论是否达到阈值，反向交叉都更新基准
      baselineType = cross.type;
      baselinePrice = cross.price;
      baselineTime = cross.time;
    }

    db.prepare(`
      UPDATE symbols
      SET
        current_state = ?,
        last_cross_type = ?,
        last_cross_price = ?,
        last_cross_time = ?,
        last_processed_close_time = ?,
        last_price = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      currentState,
      baselineType,
      baselinePrice,
      baselineTime,
      latestKline.closeTime,
      latestKline.close,
      Date.now(),
      symbol.id
    );
  });

  // 事件写入与标的状态更新在同一事务中
  processTransaction();

  // 数据库事务提交后再发送通知
  for (const notification of pendingNotifications) {
    await sendPendingNotification(notification);
  }
}

/**
 * 发送通知并更新事件记录。
 */
async function sendPendingNotification(
  notification: PendingNotification
): Promise<void> {
  const title =
    `${notification.symbol} ${getCrossName(notification.crossType)}`;

  const description = [
    `交易标的：${notification.symbol}`,
    `交叉方向：${getCrossName(notification.crossType)}`,
    `交叉价格：${notification.crossPrice}`,
    `上次反向交叉价格：${notification.previousPrice}`,
    `价格差：${notification.priceDiff}`,
    `触发阈值：${notification.threshold}`,
    `交叉时间：${formatTime(notification.crossTime)}`
  ].join("\n\n");

  try {
    await sendWechatNotification(title, description);

    db.prepare(`
      UPDATE events
      SET
        push_sent = 1,
        reason = 'notification_sent'
      WHERE id = ?
    `).run(notification.eventId);

    console.log(
      `[Worker] 微信通知成功: ${notification.symbol} ${title}`
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    db.prepare(`
      UPDATE events
      SET reason = ?
      WHERE id = ?
    `).run(
      `notification_failed: ${message.slice(0, 300)}`,
      notification.eventId
    );

    console.error(
      `[Worker] 微信通知失败: ${notification.symbol}`,
      message
    );
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let isStopped = false;

/**
 * 执行一轮监控。
 */
async function runMonitorCycle(): Promise<void> {
  if (isRunning || isStopped) {
    return;
  }

  isRunning = true;

  try {
    const symbols = getSymbols().filter(
      (item) => item.enabled === 1
    );

    const globalNotifyEnabled =
      getSetting("global_wechat_enabled") === "true";

    for (const symbol of symbols) {
      if (isStopped) {
        break;
      }

      try {
        await processSymbol(symbol, globalNotifyEnabled);
      } catch (error) {
        console.error(
          `[Worker] ${symbol.symbol} 监控失败:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  } catch (error) {
    console.error(
      "[Worker] 监控周期执行失败:",
      error
    );
  } finally {
    isRunning = false;
  }
}

/**
 * 启动 Worker。
 */
export function startWorker(): void {
  if (timer) {
    return;
  }

  isStopped = false;

  console.log(
    `[Worker] 启动，轮询间隔 ${POLL_INTERVAL_MS}ms`
  );

  // 启动后立即执行一轮
  void runMonitorCycle();

  timer = setInterval(() => {
    void runMonitorCycle();
  }, POLL_INTERVAL_MS);
}

/**
 * 停止 Worker。
 */
export function stopWorker(): void {
  isStopped = true;

  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  console.log("[Worker] 已停止");
}
