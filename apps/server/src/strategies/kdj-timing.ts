import type {
  EntryStatus,
  SignalDirection
} from "../db/types";
import { calculateKDJ } from "../indicators/kdj";
import type { KdjPoint } from "../indicators/types";

import {
  DEFAULT_KDJ_TIMING_PARAMS,
  KDJ_TIMING_D_SMOOTH,
  KDJ_TIMING_K_SMOOTH,
  KDJ_TIMING_PERIOD,
  normalizeKdjTimingParams,
  type KdjTimingParams
} from "./params";
import type {
  SignalDraft,
  StrategyRunInput,
  StrategyRunResult,
  StrategyRunner,
  StrategyStateView
} from "./types";

/**
 * 简易监控只展示正在等待的方向；同时监控超买和超卖时为 IDLE。
 */
function timingStatus(params: KdjTimingParams): EntryStatus {
  if (params.longEnabled && !params.shortEnabled) {
    return "ARMED_LONG";
  }

  if (params.shortEnabled && !params.longEnabled) {
    return "ARMED_SHORT";
  }

  return "IDLE";
}

function latestPoint(points: KdjPoint[]): KdjPoint | null {
  return points.length > 0 ? points[points.length - 1] : null;
}

function buildTimingSignal(
  eventType: "ENTRY_LONG" | "ENTRY_SHORT",
  direction: SignalDirection,
  point: KdjPoint,
  params: KdjTimingParams,
  previousJ: number
): SignalDraft {
  return {
    kind: "KDJ_TIMING",
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
      period: KDJ_TIMING_PERIOD,
      kSmooth: KDJ_TIMING_K_SMOOTH,
      dSmooth: KDJ_TIMING_D_SMOOTH,
      oversold: params.oversold,
      overbought: params.overbought,
      previousJ,
      k: point.k,
      d: point.d,
      j: point.j,
      simple: true
    }
  };
}

/**
 * 简易 J 值入场。
 *
 * 固定 KDJ 9/3/3，不使用 EMA 趋势：
 * - J 从 >= 超卖阈值 下穿到 < 超卖阈值 → 做多提示；
 * - J 从 <= 超买阈值 上穿到 > 超买阈值 → 做空提示。
 */
function runKdjTiming(
  input: StrategyRunInput
): StrategyRunResult {
  const params = input.params as KdjTimingParams;

  const points = calculateKDJ(input.klines, {
    period: KDJ_TIMING_PERIOD,
    kSmooth: KDJ_TIMING_K_SMOOTH,
    dSmooth: KDJ_TIMING_D_SMOOTH
  });

  const status = timingStatus(params);

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

    if (previousJ !== null) {
      const crossDown =
        previousJ >= params.oversold &&
        currentJ < params.oversold;

      const crossUp =
        previousJ <= params.overbought &&
        currentJ > params.overbought;

      if (params.longEnabled && crossDown) {
        signals.push(
          buildTimingSignal(
            "ENTRY_LONG",
            "BULL",
            point,
            params,
            previousJ
          )
        );
      } else if (params.shortEnabled && crossUp) {
        signals.push(
          buildTimingSignal(
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
      status,
      extra: {
        k: point.k,
        d: point.d,
        j: currentJ,
        prevJ: currentJ
      }
    };
  }

  state = {
    ...state,
    status
  };

  return { state, signals };
}

export const kdjTimingRunner: StrategyRunner = {
  kind: "KDJ_TIMING",
  sortOrder: 2,
  defaultParams() {
    return { ...DEFAULT_KDJ_TIMING_PARAMS };
  },
  normalizeParams(raw, klineLimit) {
    return normalizeKdjTimingParams(raw, klineLimit);
  },
  run: runKdjTiming
};
