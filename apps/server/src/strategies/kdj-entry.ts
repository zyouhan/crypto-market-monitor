import type {
  EntryStatus,
  SignalDirection,
  TrendStatus
} from "../db/types";
import { calculateKDJ } from "../indicators/kdj";
import type { KdjPoint } from "../indicators/types";

import {
  DEFAULT_KDJ_PARAMS,
  normalizeKdjParams,
  type KdjEntryParams
} from "./params";
import type {
  SignalDraft,
  StrategyRunInput,
  StrategyRunResult,
  StrategyRunner,
  StrategyStateView
} from "./types";

export function entryStatusForTrend(
  trend: TrendStatus,
  params: KdjEntryParams
): EntryStatus {
  if (trend === "BULL_WAITING" && params.longEnabled) {
    return "ARMED_LONG";
  }

  if (trend === "BEAR_WAITING" && params.shortEnabled) {
    return "ARMED_SHORT";
  }

  return "IDLE";
}

function latestPoint(points: KdjPoint[]): KdjPoint | null {
  return points.length > 0 ? points[points.length - 1] : null;
}

function buildEntrySignal(
  eventType: "ENTRY_LONG" | "ENTRY_SHORT",
  direction: SignalDirection,
  point: KdjPoint,
  params: KdjEntryParams,
  previousJ: number
): SignalDraft {
  return {
    kind: "KDJ_ENTRY",
    eventType,
    direction,
    price: point.close,
    eventTime: point.time,
    threshold:
      eventType === "ENTRY_LONG"
        ? params.oversold
        : params.overbought,
    priceDiff: null,
    emaDiff: null,
    triggerMet: true,
    reason: null,
    payload: {
      period: params.period,
      kSmooth: params.kSmooth,
      dSmooth: params.dSmooth,
      oversold: params.oversold,
      overbought: params.overbought,
      previousJ,
      k: point.k,
      d: point.d,
      j: point.j
    }
  };
}

function runKdjEntry(
  input: StrategyRunInput
): StrategyRunResult {
  const params = input.params as KdjEntryParams;

  const points = calculateKDJ(input.klines, params);

  const trend = input.shared.trend;

  const status = entryStatusForTrend(trend, params);

  // 预热：只记录最新 J 值，不产生历史入场信号
  if (input.warmup) {
    const last = latestPoint(points);

    return {
      state: {
        status,
        baselineType: null,
        baselinePrice: null,
        baselineEma: null,
        baselineTime: null,
        extra: {
          k: last?.k ?? null,
          d: last?.d ?? null,
          j: last?.j ?? null,
          prevJ: last?.j ?? null
        }
      },
      signals: []
    };
  }

  const indexByTime = new Map<number, number>();

  points.forEach((point, index) => {
    indexByTime.set(point.time, index);
  });

  let previousJ: number | null =
    typeof input.state.extra.prevJ === "number"
      ? (input.state.extra.prevJ as number)
      : null;

  let state: StrategyStateView = input.state;

  const signals: SignalDraft[] = [];

  for (const kline of input.newKlines) {
    const index = indexByTime.get(kline.closeTime);

    if (index === undefined) {
      continue;
    }

    const point = points[index];

    if (!point || point.j === null) {
      continue;
    }

    const currentJ = point.j;

    const candleTrend =
      input.shared.trendByCloseTime.get(kline.closeTime) ??
      trend;

    if (previousJ !== null) {
      const crossDown =
        previousJ >= params.oversold &&
        currentJ < params.oversold;

      const crossUp =
        previousJ <= params.overbought &&
        currentJ > params.overbought;

      if (
        candleTrend === "BULL_WAITING" &&
        params.longEnabled &&
        crossDown
      ) {
        signals.push(
          buildEntrySignal(
            "ENTRY_LONG",
            "BULL",
            point,
            params,
            previousJ
          )
        );
      } else if (
        candleTrend === "BEAR_WAITING" &&
        params.shortEnabled &&
        crossUp
      ) {
        signals.push(
          buildEntrySignal(
            "ENTRY_SHORT",
            "BEAR",
            point,
            params,
            previousJ
          )
        );
      }
    }

    previousJ = currentJ;

    state = {
      ...state,
      status: entryStatusForTrend(candleTrend, params),
      extra: {
        k: point.k,
        d: point.d,
        j: currentJ,
        prevJ: currentJ
      }
    };
  }

  // 没有新 K 线时也同步等待方向
  state = {
    ...state,
    status: entryStatusForTrend(trend, params)
  };

  return { state, signals };
}

export const kdjEntryRunner: StrategyRunner = {
  kind: "KDJ_ENTRY",
  sortOrder: 1,
  defaultParams() {
    return { ...DEFAULT_KDJ_PARAMS };
  },
  normalizeParams(raw, klineLimit) {
    return normalizeKdjParams(raw, klineLimit);
  },
  run: runKdjEntry
};
