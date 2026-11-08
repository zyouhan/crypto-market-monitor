import {
  getEnabledSymbols,
  getSetting
} from "../db/repo";

import { runSymbolCycle } from "./cycle";

const POLL_INTERVAL_MS = Math.max(
  Number(process.env.POLL_INTERVAL_MS) || 10000,
  5000
);

export interface WorkerHealth {
  running: boolean;
  lastCycleAt: number | null;
  lastCycleDurationMs: number | null;
  lastError: string | null;
}

const health: WorkerHealth = {
  running: false,
  lastCycleAt: null,
  lastCycleDurationMs: null,
  lastError: null
};

export function getWorkerHealth(): WorkerHealth {
  return { ...health };
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
  health.running = true;
  health.lastError = null;

  const startedAt = Date.now();

  try {
    const symbols = getEnabledSymbols();

    const globalNotifyEnabled =
      getSetting("global_wechat_enabled") === "true";

    for (const symbol of symbols) {
      if (isStopped) {
        break;
      }

      try {
        await runSymbolCycle(symbol, globalNotifyEnabled);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);

        health.lastError = `${symbol.symbol}: ${message}`;

        console.error(
          `[Worker] ${symbol.symbol} 监控失败:`,
          message
        );
      }
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
