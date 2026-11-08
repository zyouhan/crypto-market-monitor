import {
  getEnabledSymbols,
  getSetting
} from "../db/repo";

import { runSymbolCycle } from "./cycle";
import {
  computeBackoffMs,
  isSymbolDue
} from "./schedule";

const POLL_INTERVAL_MS = Math.max(
  Number(process.env.POLL_INTERVAL_MS) || 10000,
  5000
);

const MAX_CONCURRENT_SYMBOLS = Math.min(
  Math.max(
    Math.floor(Number(process.env.MAX_CONCURRENT_SYMBOLS)) || 3,
    1
  ),
  10
);

export interface WorkerHealth {
  running: boolean;
  lastCycleAt: number | null;
  lastCycleDurationMs: number | null;
  lastDueSymbols: number | null;
  lastTotalSymbols: number | null;
  lastError: string | null;
}

const health: WorkerHealth = {
  running: false,
  lastCycleAt: null,
  lastCycleDurationMs: null,
  lastDueSymbols: null,
  lastTotalSymbols: null,
  lastError: null
};

export function getWorkerHealth(): WorkerHealth {
  return { ...health };
}

interface RetryState {
  failures: number;
  nextRetryAt: number;
}

const retryState = new Map<number, RetryState>();

let timer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let isStopped = false;
let manualRefreshPromise: Promise<void> | null = null;

/**
 * 有界并发执行，避免标的增多后串行拉取把一轮拖长。
 */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  handler: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (!isStopped) {
        const index = nextIndex;
        nextIndex += 1;

        if (index >= items.length) {
          return;
        }

        await handler(items[index]);
      }
    }
  );

  await Promise.all(workers);
}

/**
 * 执行一轮监控。
 *
 * 扫描节拍由 POLL_INTERVAL_MS 决定，但每个标的只在
 * 「上一根 K 线收盘 + 周期」之后才会真正请求 Binance。
 */
async function runMonitorCycle(force = false): Promise<void> {
  if (isRunning || isStopped) {
    return;
  }

  isRunning = true;
  health.running = true;

  const startedAt = Date.now();

  try {
    const symbols = getEnabledSymbols();
    const now = Date.now();

    const dueSymbols = force
      ? symbols
      : symbols.filter((symbol) =>
          isSymbolDue(
            symbol,
            now,
            retryState.get(symbol.id)?.nextRetryAt ?? 0
          )
        );

    health.lastTotalSymbols = symbols.length;
    health.lastDueSymbols = dueSymbols.length;

    const globalNotifyEnabled =
      getSetting("global_wechat_enabled") === "true";

    let cycleError: string | null = null;

    await runWithConcurrency(
      dueSymbols,
      MAX_CONCURRENT_SYMBOLS,
      async (symbol) => {
        try {
          await runSymbolCycle(symbol, globalNotifyEnabled);
          retryState.delete(symbol.id);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : String(error);

          const previous = retryState.get(symbol.id);
          const failures = (previous?.failures ?? 0) + 1;

          retryState.set(symbol.id, {
            failures,
            nextRetryAt:
              Date.now() + computeBackoffMs(failures)
          });

          cycleError = `${symbol.symbol}: ${message}`;
          health.lastError = cycleError;

          console.error(
            `[Worker] ${symbol.symbol} 监控失败:`,
            message
          );
        }
      }
    );

    if (dueSymbols.length > 0 && cycleError === null) {
      health.lastError = null;
    }
  } catch (error) {
    health.lastError =
      error instanceof Error ? error.message : String(error);

    console.error("[Worker] 监控周期执行失败:", error);
  } finally {
    isRunning = false;

    health.running = false;
    health.lastCycleAt = Date.now();
    health.lastCycleDurationMs = Date.now() - startedAt;
  }
}

/**
 * 手动刷新：等待当前轮询结束后，强制拉取全部启用标的。
 *
 * 返回 false 表示已有手动请求在排队或 Worker 已停止。
 * 该函数只负责排队，不等待 Binance 请求完成，避免 API 被网络超时拖住。
 */
export function requestManualRefresh(): boolean {
  if (isStopped || manualRefreshPromise) {
    return false;
  }

  manualRefreshPromise = (async () => {
    while (isRunning && !isStopped) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    if (isStopped) {
      return;
    }

    console.log("[Worker] 手动刷新：立即请求全部启用标的");

    await runMonitorCycle(true);
  })()
    .catch((error) => {
      health.lastError =
        error instanceof Error ? error.message : String(error);

      console.error("[Worker] 手动刷新失败:", error);
    })
    .finally(() => {
      manualRefreshPromise = null;
    });

  return true;
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
    `[Worker] 启动，扫描间隔 ${POLL_INTERVAL_MS}ms，并发 ${MAX_CONCURRENT_SYMBOLS}`
  );

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
