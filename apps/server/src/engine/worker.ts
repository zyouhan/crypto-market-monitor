import type {
  ConditionRole,
  MonitorConditionRecord,
  MonitorRecord
} from "../db/types";
import { db } from "../db";
import {
  createStopWatch,
  getActiveStopWatches,
  getMonitorById,
  getMonitorConditions,
  getEnabledMonitors,
  getSignalById,
  insertSignalIgnore,
  markStopWatchAlert,
  markStopWatchHit,
  updateConditionState,
  updateMonitorError,
  updateMonitorProgress,
  updateMonitorSnapshot,
  updateStopWatchProgress,
  type StopWatchRecord
} from "../db/monitor-repo";
import {
  getConditionDefinition,
  isConditionKind
} from "../conditions/registry";
import type {
  ConditionDefinition,
  ConditionRunResult
} from "../conditions/types";
import { getKlineLimit } from "../market/binance";
import { getMarketKlines } from "../market";
import type { MarketKlines } from "../market";
import { evaluateMonitorSignals } from "../monitors/evaluator";
import type {
  ConditionRuntime,
  MonitorSignalDraft
} from "../monitors/evaluator";
import type { Kline } from "../indicators/types";
import { getSetting } from "../db/repo";
import { getNextCloseTime } from "./time";
import { dispatchMonitorNotification } from "./notify";

const POLL_INTERVAL_MS = Math.max(
  Number(process.env.POLL_INTERVAL_MS) || 10000,
  5000
);

const MAX_CONCURRENT_MONITORS = Math.min(
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
  lastDueMonitors: number | null;
  lastTotalMonitors: number | null;
  lastError: string | null;
  pending: number;
}

const health: WorkerHealth = {
  running: false,
  lastCycleAt: null,
  lastCycleDurationMs: null,
  lastDueMonitors: null,
  lastTotalMonitors: null,
  lastError: null,
  pending: 0
};

export function getWorkerHealth(): WorkerHealth {
  return {
    ...health,
    pending: pendingMonitorIds.size
  };
}

const pendingMonitorIds = new Set<number>();

export function getPendingMonitorIds(): number[] {
  return Array.from(pendingMonitorIds);
}

let timer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let isStopped = false;
let refreshPromise: Promise<void> | null = null;

function parseJsonObject(
  value: string | null
): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function conditionInterval(
  condition: MonitorConditionRecord,
  monitor: MonitorRecord
): string {
  return condition.interval || monitor.interval;
}

function isMonitorDue(
  monitor: MonitorRecord,
  now: number
): boolean {
  if (monitor.last_processed_close_time === 0) {
    return true;
  }

  return (
    now >=
    getNextCloseTime(
      monitor.last_processed_close_time,
      monitor.interval
    )
  );
}

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

function buildSnapshot(
  runtimes: ConditionRuntime[],
  marketByInterval: Map<string, MarketKlines>,
  price: number | null
): string {
  return JSON.stringify({
    price,
    conditions: runtimes.map((runtime) => {
      const market = marketByInterval.get(runtime.interval);

      return {
        kind: runtime.kind,
        role: runtime.role,
        interval: runtime.interval,
        summary: runtime.definition.summarize(runtime.params),
        statusText: runtime.result.statusText,
        display: runtime.result.latest?.display ?? [],
        time: runtime.result.latest?.time ?? null,
        source: market?.source ?? null
      };
    }),
    updatedAt: Date.now()
  });
}

function combineSource(
  marketByInterval: Map<string, MarketKlines>
): { source: string | null; note: string | null } {
  const sources = new Set<string>();
  const warnings = new Set<string>();

  for (const market of marketByInterval.values()) {
    sources.add(market.source);

    for (const warning of market.warnings) {
      warnings.add(warning);
    }
  }

  if (sources.size === 0) {
    return { source: null, note: null };
  }

  return {
    source:
      sources.size === 1
        ? (Array.from(sources)[0] as string)
        : "MIXED",
    note:
      warnings.size > 0
        ? Array.from(warnings).join("；").slice(0, 800)
        : null
  };
}

function toSignalRecord(
  monitor: MonitorRecord,
  draft: MonitorSignalDraft
) {
  return {
    monitor_id: monitor.id,
    monitor_name: monitor.name,
    symbol: monitor.symbol,
    interval: monitor.interval,
    kind: "MONITOR",
    event_type: draft.eventType,
    direction: draft.direction,
    price: draft.price,
    event_time: draft.eventTime,
    primary_condition: draft.primaryCondition,
    conditions: JSON.stringify(draft.conditions),
    source: null,
    threshold: draft.threshold,
    price_diff: null,
    ema_diff: null,
    trigger_met: 1,
    push_state: "PENDING" as const,
    reason: null,
    payload: JSON.stringify({
      ...draft.payload,
      stopPrice: draft.stopPrice
    }),
    created_at: Date.now()
  };
}

export function findStopHit(
  watch: StopWatchRecord,
  newKlines: Kline[]
): Kline | null {
  for (const kline of newKlines) {
    if (kline.closeTime <= watch.entry_time) {
      continue;
    }

    if (
      watch.direction === "BULL" &&
      kline.low <= watch.stop_price
    ) {
      return kline;
    }

    if (
      watch.direction === "BEAR" &&
      kline.high >= watch.stop_price
    ) {
      return kline;
    }
  }

  return null;
}

export function stopProgress(
  watch: StopWatchRecord,
  klines: Kline[]
): {
  maxPrice: number | null;
  minPrice: number | null;
  maxFavorableR: number;
  maxAdverseR: number;
  lastCheckedTime: number | null;
} {
  const risk = Math.abs(watch.entry_price - watch.stop_price);
  let maxPrice = watch.max_price;
  let minPrice = watch.min_price;
  let maxFavorableR = watch.max_favorable_r;
  let maxAdverseR = watch.max_adverse_r;
  let lastCheckedTime = watch.last_checked_time;

  for (const kline of klines) {
    if (kline.closeTime <= watch.entry_time) {
      continue;
    }

    maxPrice =
      maxPrice === null
        ? kline.high
        : Math.max(maxPrice, kline.high);
    minPrice =
      minPrice === null
        ? kline.low
        : Math.min(minPrice, kline.low);
    lastCheckedTime = kline.closeTime;

    if (risk <= 0) {
      continue;
    }

    const favorableR =
      watch.direction === "BULL"
        ? (kline.high - watch.entry_price) / risk
        : (watch.entry_price - kline.low) / risk;
    const adverseR =
      watch.direction === "BULL"
        ? (watch.entry_price - kline.low) / risk
        : (kline.high - watch.entry_price) / risk;

    maxFavorableR = Math.max(maxFavorableR, favorableR);
    maxAdverseR = Math.max(maxAdverseR, adverseR);
  }

  return {
    maxPrice,
    minPrice,
    maxFavorableR,
    maxAdverseR,
    lastCheckedTime
  };
}

function stopHitRecord(
  monitor: MonitorRecord,
  watch: StopWatchRecord,
  hitKline: Kline,
  source: string | null
) {
  return {
    monitor_id: monitor.id,
    monitor_name: monitor.name,
    symbol: monitor.symbol,
    interval: monitor.interval,
    kind: "RISK",
    event_type: "STOP_LOSS_HIT" as const,
    direction: watch.direction,
    price: watch.stop_price,
    event_time: hitKline.closeTime,
    primary_condition: "RISK",
    conditions: JSON.stringify([]),
    source,
    threshold: watch.stop_price,
    price_diff: null,
    ema_diff: null,
    trigger_met: 1,
    push_state: "PENDING" as const,
    reason: null,
    payload: JSON.stringify({
      entrySignalId: watch.signal_id,
      entryPrice: watch.entry_price,
      stopPrice: watch.stop_price,
      hitPrice: watch.stop_price,
      hitHigh: hitKline.high,
      hitLow: hitKline.low
    }),
    created_at: Date.now()
  };
}

function managementSignalRecord(
  monitor: MonitorRecord,
  watch: StopWatchRecord,
  eventType: "TRADE_1R" | "TRADE_BREAKEVEN",
  price: number,
  eventTime: number,
  source: string | null
) {
  return {
    monitor_id: monitor.id,
    monitor_name: monitor.name,
    symbol: monitor.symbol,
    interval: monitor.interval,
    kind: "MANAGEMENT",
    event_type: eventType,
    direction: watch.direction,
    price,
    event_time: eventTime,
    primary_condition: "RISK",
    conditions: JSON.stringify([]),
    source,
    threshold: watch.stop_price,
    price_diff: null,
    ema_diff: null,
    trigger_met: 1,
    push_state: "PENDING" as const,
    reason: null,
    payload: JSON.stringify({
      entrySignalId: watch.signal_id,
      entryPrice: watch.entry_price,
      stopPrice: watch.stop_price,
      maxFavorableR: watch.max_favorable_r
    }),
    created_at: Date.now()
  };
}

async function runMonitor(  monitor: MonitorRecord,
  cache: Map<string, Promise<MarketKlines>>,
  globalNotifyEnabled: boolean
): Promise<void> {
  const conditions = getMonitorConditions(monitor.id);

  if (conditions.length === 0) {
    throw new Error("监控项没有配置条件");
  }

  if (!conditions.some((condition) => condition.role === "trigger")) {
    throw new Error("监控项至少需要一个触发条件");
  }

  const intervals = new Set<string>([monitor.interval]);

  for (const condition of conditions) {
    intervals.add(conditionInterval(condition, monitor));
  }

  const marketByInterval = new Map<string, MarketKlines>();

  try {
    await Promise.all(
      Array.from(intervals).map(async (interval) => {
        const key = `${monitor.symbol}|${interval}`;
        let promise = cache.get(key);

        if (!promise) {
          promise = getMarketKlines(
            monitor.symbol,
            interval,
            getKlineLimit()
          );
          cache.set(key, promise);
        }

        marketByInterval.set(interval, await promise);
      })
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    throw new Error(
      `[${monitor.symbol} ${monitor.interval}] 行情获取失败: ${message}`
    );
  }

  const baseKlines = marketByInterval.get(monitor.interval)?.klines ?? [];

  if (baseKlines.length === 0) {
    throw new Error("入场周期没有可用 K 线");
  }

  const warmup =
    monitor.last_processed_close_time === 0 ||
    conditions.some(
      (condition) =>
        condition.last_processed_close_time === 0 ||
        !condition.state
    );

  const runtimes: ConditionRuntime[] = [];
  const stateUpdates: Array<{
    condition: MonitorConditionRecord;
    result: ConditionRunResult;
    lastProcessedCloseTime: number;
  }> = [];

  for (const condition of conditions) {
    if (!isConditionKind(condition.kind)) {
      throw new Error(`未知条件类型: ${condition.kind}`);
    }

    const definition = getConditionDefinition(condition.kind);
    const interval = conditionInterval(condition, monitor);
    const klines = marketByInterval.get(interval)?.klines ?? [];

    if (klines.length === 0) {
      throw new Error(`条件周期 ${interval} 没有可用 K 线`);
    }

    const params = definition.normalizeParams(
      parseJsonObject(condition.params),
      getKlineLimit()
    );

    const newKlines = warmup
      ? []
      : klines.filter(
          (kline) =>
            kline.closeTime > condition.last_processed_close_time
        );

    const result = definition.run({
      state: parseJsonObject(condition.state),
      params,
      klines,
      newKlines,
      warmup
    });

    runtimes.push({
      id: condition.id,
      kind: condition.kind,
      role: condition.role as ConditionRole,
      interval,
      params,
      definition,
      result
    });

    stateUpdates.push({
      condition,
      result,
      lastProcessedCloseTime:
        klines[klines.length - 1]?.closeTime ??
        condition.last_processed_close_time
    });
  }

  const latestBase = baseKlines[baseKlines.length - 1];
  const { source, note } = combineSource(marketByInterval);
  const snapshot = buildSnapshot(
    runtimes,
    marketByInterval,
    latestBase.close
  );
  const successAt = Date.now();

  if (warmup) {
    const updateWarmup = () => {
      for (const update of stateUpdates) {
        updateConditionState({
          id: update.condition.id,
          state: JSON.stringify(update.result.state),
          lastProcessedCloseTime: update.lastProcessedCloseTime,
          updatedAt: successAt
        });
      }

      updateMonitorProgress({
        id: monitor.id,
        lastPrice: latestBase.close,
        lastPriceTime: latestBase.closeTime,
        lastProcessedCloseTime: latestBase.closeTime,
        source,
        sourceNote: note,
        snapshot,
        successAt
      });
    };

    const transaction = db.transaction(updateWarmup);
    transaction();

    console.log(
      `[Worker] ${monitor.name} 预热完成: ${runtimes
        .map(
          (runtime) =>
            `${runtime.kind}@${runtime.interval}=${runtime.result.statusText}`
        )
        .join(", ")}`
    );

    return;
  }

  const newBaseKlines = baseKlines.filter(
    (kline) =>
      kline.closeTime > monitor.last_processed_close_time
  );

  if (newBaseKlines.length === 0) {
    const updateSnapshot = () => {
      for (const update of stateUpdates) {
        updateConditionState({
          id: update.condition.id,
          state: JSON.stringify(update.result.state),
          lastProcessedCloseTime: update.lastProcessedCloseTime,
          updatedAt: successAt
        });
      }

      updateMonitorSnapshot({
        id: monitor.id,
        lastPrice: latestBase.close,
        lastPriceTime: latestBase.closeTime,
        source,
        sourceNote: note,
        snapshot,
        successAt
      });
    };

    const transaction = db.transaction(updateSnapshot);
    transaction();

    return;
  }

  const drafts = evaluateMonitorSignals({
    monitor,
    runtimes,
    newBaseKlines,
    source
  });

  const insertedIds: number[] = [];

  const transaction = db.transaction(() => {
    for (const update of stateUpdates) {
      updateConditionState({
        id: update.condition.id,
        state: JSON.stringify(update.result.state),
        lastProcessedCloseTime: update.lastProcessedCloseTime,
        updatedAt: successAt
      });
    }

    for (const draft of drafts) {
      const record = toSignalRecord(monitor, draft);

      const inserted = insertSignalIgnore({
        ...record,
        source
      });

      if (inserted !== null) {
        insertedIds.push(inserted);

        if (
          draft.stopPrice !== null &&
          (draft.eventType === "ENTRY_LONG" ||
            draft.eventType === "ENTRY_SHORT")
        ) {
          createStopWatch({
            signalId: inserted,
            monitorId: monitor.id,
            interval: monitor.interval,
            direction: draft.direction,
            entryPrice: draft.price,
            entryTime: draft.eventTime,
            stopPrice: draft.stopPrice
          });
        }
      }
    }

    updateMonitorProgress({
      id: monitor.id,
      lastPrice: latestBase.close,
      lastPriceTime: latestBase.closeTime,
      lastProcessedCloseTime: latestBase.closeTime,
      source,
      sourceNote: note,
      snapshot,
      successAt
    });
  });

  transaction();

  for (const id of insertedIds) {
    const signal = getSignalById(id);

    if (signal) {
      await dispatchMonitorNotification(
        signal,
        monitor,
        globalNotifyEnabled
      );
    }
  }

  const hitSignalIds: number[] = [];
  const managementSignalIds: number[] = [];
  const stopTransaction = db.transaction(() => {
    for (const watch of getActiveStopWatches(monitor.id)) {
      const hitKline = findStopHit(watch, newBaseKlines);
      const hitIndex = hitKline
        ? newBaseKlines.indexOf(hitKline)
        : -1;
      const progressKlines =
        hitIndex >= 0
          ? newBaseKlines.slice(0, hitIndex + 1)
          : newBaseKlines;
      const progress = stopProgress(watch, progressKlines);
      const lastChecked =
        [...progressKlines]
          .reverse()
          .find(
            (kline) => kline.closeTime > watch.entry_time
          ) ?? null;

      updateStopWatchProgress({
        id: watch.id,
        ...progress
      });

      if (lastChecked) {
        const maxFavorableR = progress.maxFavorableR;

        if (!watch.alerted_1r && maxFavorableR >= 1) {
          const inserted = insertSignalIgnore(
            managementSignalRecord(
              monitor,
              watch,
              "TRADE_1R",
              lastChecked.close,
              lastChecked.closeTime,
              source
            )
          );

          markStopWatchAlert({
            id: watch.id,
            oneR: true
          });

          if (inserted !== null) {
            managementSignalIds.push(inserted);
          }
        }

        const atEntry =
          watch.direction === "BULL"
            ? lastChecked.close <= watch.entry_price
            : lastChecked.close >= watch.entry_price;

        if (
          !watch.alerted_breakeven &&
          (watch.alerted_1r === 1 || maxFavorableR >= 1) &&
          atEntry
        ) {
          const inserted = insertSignalIgnore(
            managementSignalRecord(
              monitor,
              watch,
              "TRADE_BREAKEVEN",
              lastChecked.close,
              lastChecked.closeTime,
              source
            )
          );

          markStopWatchAlert({
            id: watch.id,
            breakeven: true
          });

          if (inserted !== null) {
            managementSignalIds.push(inserted);
          }
        }
      }

      if (!hitKline) {
        continue;
      }

      const inserted = insertSignalIgnore(
        stopHitRecord(monitor, watch, hitKline, source)
      );

      markStopWatchHit({
        id: watch.id,
        hitAt: hitKline.closeTime,
        hitPrice: watch.stop_price,
        hitSignalId: inserted ?? 0
      });

      if (inserted !== null) {
        hitSignalIds.push(inserted);
      }
    }
  });

  stopTransaction();

  for (const id of hitSignalIds) {
    const signal = getSignalById(id);

    if (signal) {
      await dispatchMonitorNotification(
        signal,
        monitor,
        globalNotifyEnabled
      );
    }
  }

  for (const id of managementSignalIds) {
    const signal = getSignalById(id);

    if (signal) {
      await dispatchMonitorNotification(
        signal,
        monitor,
        globalNotifyEnabled
      );
    }
  }
}

async function runMonitorCycle(forceIds?: number[]): Promise<void> {
  if (isRunning || isStopped) {
    return;
  }

  isRunning = true;
  health.running = true;

  const startedAt = Date.now();

  try {
    const globalMonitorEnabled =
      getSetting("global_monitor_enabled") !== "false";

    if (
      !globalMonitorEnabled &&
      (!forceIds || forceIds.length === 0)
    ) {
      health.lastDueMonitors = 0;
      health.lastError = null;
      return;
    }

    const monitors =
      forceIds && forceIds.length > 0
        ? forceIds
            .map((id) => getMonitorById(id))
            .filter((monitor): monitor is MonitorRecord => Boolean(monitor))
        : getEnabledMonitors();

    const now = Date.now();

    const dueMonitors =
      forceIds && forceIds.length > 0
        ? monitors
        : monitors.filter((monitor) => isMonitorDue(monitor, now));

    health.lastTotalMonitors = monitors.length;
    health.lastDueMonitors = dueMonitors.length;

    const globalNotifyEnabled =
      getSetting("global_wechat_enabled") === "true";

    let cycleError: string | null = null;
    const cache = new Map<string, Promise<MarketKlines>>();

    await runWithConcurrency(
      dueMonitors,
      MAX_CONCURRENT_MONITORS,
      async (monitor) => {
        try {
          await runMonitor(monitor, cache, globalNotifyEnabled);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);

          updateMonitorError({
            id: monitor.id,
            message,
            at: Date.now()
          });

          cycleError = `${monitor.name}: ${message}`;
          health.lastError = cycleError;

          console.error(
            `[Worker] ${monitor.name} 监控失败:`,
            message
          );
        }
      }
    );

    if (dueMonitors.length > 0 && cycleError === null) {
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

    for (const id of forceIds ?? []) {
      pendingMonitorIds.delete(id);
    }

    health.pending = pendingMonitorIds.size;
  }
}

/**
 * 单项立即请求。返回 false 表示监控项不存在或 Worker 已停止。
 */
export function requestMonitorRefresh(id: number): boolean {
  if (isStopped) {
    return false;
  }

  const monitor = getMonitorById(id);

  if (!monitor) {
    return false;
  }

  pendingMonitorIds.add(id);
  health.pending = pendingMonitorIds.size;

  if (!refreshPromise) {
    refreshPromise = (async () => {
      while (pendingMonitorIds.size > 0 && !isStopped) {
        while (isRunning && !isStopped) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }

        const ids = Array.from(pendingMonitorIds);
        pendingMonitorIds.clear();

        await runMonitorCycle(ids);
      }
    })()
      .catch((error) => {
        health.lastError =
          error instanceof Error ? error.message : String(error);
        console.error("[Worker] 手动刷新失败:", error);
      })
      .finally(() => {
        refreshPromise = null;
        pendingMonitorIds.clear();
        health.pending = 0;
      });
  }

  return true;
}

export function startWorker(): void {
  if (timer) {
    return;
  }

  isStopped = false;

  console.log(
    `[Worker] 启动，扫描间隔 ${POLL_INTERVAL_MS}ms，并发 ${MAX_CONCURRENT_MONITORS}`
  );

  void runMonitorCycle();

  timer = setInterval(() => {
    void runMonitorCycle();
  }, POLL_INTERVAL_MS);
}

export function stopWorker(): void {
  isStopped = true;

  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  console.log("[Worker] 已停止");
}
