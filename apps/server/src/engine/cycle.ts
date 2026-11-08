import type {
  EntryStatus,
  StrategyKind,
  StrategyRecord,
  StrategyStateRecord,
  SymbolRecord,
  TrendStatus
} from "../db/types";
import {
  db,
  getSignalById,
  getStatesBySymbol,
  getStrategiesBySymbol,
  insertSignalIgnore,
  updateSignalPush,
  updateSymbolProgress,
  upsertState
} from "../db/repo";
import { getKlineLimit, getKlines } from "../market/binance";
import { getRunner } from "../strategies/registry";
import type {
  SharedContext,
  SignalDraft,
  StrategyStateView
} from "../strategies/types";

import {
  buildSignalMessage,
  isServerchanConfigured,
  sendWechatNotification
} from "./notify";
import { formatTime, isSignalFresh } from "./time";

export interface CycleSummary {
  symbol: string;
  warmup: boolean;
  signals: number;
  notifications: number;
}

function parseJsonObject(
  value: string | null
): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseStrategyParams(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
}

function stateView(
  record: StrategyStateRecord | undefined,
  kind: StrategyKind
): StrategyStateView {
  if (!record) {
    return {
      status: kind === "EMA_TREND" ? "NEUTRAL" : "IDLE",
      baselineType: null,
      baselinePrice: null,
      baselineEma: null,
      baselineTime: null,
      extra: {}
    };
  }

  return {
    status: record.status as TrendStatus | EntryStatus,
    baselineType: record.baseline_type,
    baselinePrice: record.baseline_price,
    baselineEma: record.baseline_ema,
    baselineTime: record.baseline_time,
    extra: parseJsonObject(record.extra)
  };
}

async function dispatchNotification(
  signalId: number,
  symbol: SymbolRecord,
  strategy: StrategyRecord,
  globalNotifyEnabled: boolean
): Promise<boolean> {
  const row = getSignalById(signalId);

  if (!row || row.trigger_met !== 1) {
    return false;
  }

  if (!isSignalFresh(row.event_time, symbol.interval)) {
    updateSignalPush({
      id: signalId,
      pushState: "SKIPPED",
      pushError: null,
      reason: "stale_signal_suppressed"
    });
    return false;
  }

  if (!globalNotifyEnabled) {
    updateSignalPush({
      id: signalId,
      pushState: "SKIPPED",
      pushError: null,
      reason: "global_notification_disabled"
    });
    return false;
  }

  if (symbol.notify_enabled !== 1) {
    updateSignalPush({
      id: signalId,
      pushState: "SKIPPED",
      pushError: null,
      reason: "symbol_notification_disabled"
    });
    return false;
  }

  if (strategy.notify_enabled !== 1) {
    updateSignalPush({
      id: signalId,
      pushState: "SKIPPED",
      pushError: null,
      reason: "strategy_notification_disabled"
    });
    return false;
  }

  if (!isServerchanConfigured()) {
    updateSignalPush({
      id: signalId,
      pushState: "SKIPPED",
      pushError: null,
      reason: "serverchan_sendkey_missing"
    });
    return false;
  }

  const message = buildSignalMessage(
    {
      symbol: row.symbol,
      kind: row.kind,
      event_type: row.event_type,
      direction: row.direction,
      price: row.price,
      event_time: row.event_time,
      threshold: row.threshold,
      price_diff: row.price_diff,
      ema_diff: row.ema_diff,
      payload: parseJsonObject(row.payload)
    },
    symbol.interval
  );

  try {
    await sendWechatNotification(
      message.title,
      message.description
    );

    updateSignalPush({
      id: signalId,
      pushState: "SENT",
      pushError: null,
      reason: null
    });

    console.log(
      `[Worker] 通知已发送: ${message.title}（${formatTime(
        row.event_time
      )}）`
    );

    return true;
  } catch (error) {
    const text =
      error instanceof Error ? error.message : String(error);

    updateSignalPush({
      id: signalId,
      pushState: "FAILED",
      pushError: text.slice(0, 300),
      reason: "notification_failed"
    });

    console.error(
      `[Worker] 通知失败: ${row.symbol} ${row.kind}`,
      text
    );

    return false;
  }
}

/**
 * 处理一个标的。
 */
export async function runSymbolCycle(
  symbol: SymbolRecord,
  globalNotifyEnabled: boolean
): Promise<CycleSummary> {
  const strategies = getStrategiesBySymbol(symbol.id).filter(
    (item) => item.enabled === 1
  );

  const summary: CycleSummary = {
    symbol: symbol.symbol,
    warmup: false,
    signals: 0,
    notifications: 0
  };

  if (strategies.length === 0) {
    return summary;
  }

  const klines = await getKlines(symbol.symbol, symbol.interval);

  if (klines.length === 0) {
    return summary;
  }

  const latestKline = klines[klines.length - 1];

  const stateRecords = getStatesBySymbol(symbol.id);

  const warmup =
    symbol.last_processed_close_time === 0 ||
    stateRecords.length === 0;

  const newKlines = warmup
    ? []
    : klines.filter(
        (kline) =>
          kline.closeTime >
          symbol.last_processed_close_time
      );

  summary.warmup = warmup;

  // 没有新的已收盘 K 线，只刷新最新价格
  if (!warmup && newKlines.length === 0) {
    updateSymbolProgress(symbol.id, {
      lastPrice: latestKline.close,
      lastPriceTime: latestKline.closeTime,
      lastProcessedCloseTime: symbol.last_processed_close_time
    });

    return summary;
  }

  const shared: SharedContext = {
    trend: "NEUTRAL",
    trendByCloseTime: new Map()
  };

  const pending: Array<{
    id: number;
    strategy: StrategyRecord;
  }> = [];

  const finalStates: Array<{
    kind: StrategyKind;
    status: string;
  }> = [];

  let insertedSignals = 0;

  const transaction = db.transaction(() => {
    for (const strategy of strategies) {
      const runner = getRunner(strategy.kind);

      const params = runner.normalizeParams(
        parseStrategyParams(strategy.params),
        getKlineLimit()
      );

      const previous = stateRecords.find(
        (item) => item.kind === strategy.kind
      );

      const result = runner.run({
        state: stateView(previous, strategy.kind),
        params,
        klines,
        newKlines,
        warmup,
        shared
      });

      upsertState({
        symbolId: symbol.id,
        kind: strategy.kind,
        status: String(result.state.status),
        baselineType: result.state.baselineType,
        baselinePrice: result.state.baselinePrice,
        baselineEma: result.state.baselineEma,
        baselineTime: result.state.baselineTime,
        extra: JSON.stringify(result.state.extra)
      });

      finalStates.push({
        kind: strategy.kind,
        status: String(result.state.status)
      });

      if (warmup) {
        continue;
      }

      for (const draft of result.signals) {
        const insertedId = insertSignalIgnore(
          toSignalRecord(symbol, draft)
        );

        if (insertedId === null) {
          continue;
        }

        insertedSignals += 1;

        if (draft.triggerMet) {
          pending.push({
            id: insertedId,
            strategy
          });
        }
      }
    }

    updateSymbolProgress(symbol.id, {
      lastPrice: latestKline.close,
      lastPriceTime: latestKline.closeTime,
      lastProcessedCloseTime: latestKline.closeTime
    });
  });

  transaction();

  summary.signals = insertedSignals;

  if (warmup) {
    console.log(
      `[Worker] ${symbol.symbol} 预热完成: ${finalStates
        .map((item) => `${item.kind}=${item.status}`)
        .join(", ")}`
    );

    return summary;
  }

  if (insertedSignals > 0) {
    console.log(
      `[Worker] ${symbol.symbol} 新增信号 ${insertedSignals} 条`
    );
  }

  for (const item of pending) {
    const sent = await dispatchNotification(
      item.id,
      symbol,
      item.strategy,
      globalNotifyEnabled
    );

    if (sent) {
      summary.notifications += 1;
    }
  }

  return summary;
}

function toSignalRecord(
  symbol: SymbolRecord,
  draft: SignalDraft
) {
  return {
    symbol_id: symbol.id,
    symbol: symbol.symbol,
    kind: draft.kind,
    event_type: draft.eventType,
    direction: draft.direction,
    price: draft.price,
    event_time: draft.eventTime,
    threshold: draft.threshold,
    price_diff: draft.priceDiff,
    ema_diff: draft.emaDiff,
    trigger_met: draft.triggerMet ? 1 : 0,
    push_state: draft.triggerMet
      ? ("PENDING" as const)
      : ("SKIPPED" as const),
    reason: draft.reason,
    payload: JSON.stringify(draft.payload ?? {}),
    created_at: Date.now()
  };
}
