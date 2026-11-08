import type { TrendStatus } from "../db/types";
import {
  calculateEmaSeries,
  detectCrosses,
  getEmaSnapshot
} from "../indicators/ema";
import type { CrossSignal } from "../indicators/types";

import {
  DEFAULT_EMA_PARAMS,
  normalizeEmaParams,
  type EmaTrendParams
} from "./params";
import type {
  SignalDraft,
  StrategyRunInput,
  StrategyRunResult,
  StrategyRunner,
  StrategyStateView
} from "./types";

export function createEmaState(): StrategyStateView {
  return {
    status: "NEUTRAL",
    baselineType: null,
    baselinePrice: null,
    baselineTime: null,
    extra: {}
  };
}

function applyCross(
  cross: CrossSignal,
  params: EmaTrendParams,
  state: StrategyStateView
): {
  state: StrategyStateView;
  signal: SignalDraft | null;
} {
  // 首叉只建立基准
  if (
    state.baselineType === null ||
    state.baselinePrice === null ||
    state.baselineTime === null
  ) {
    return {
      state: {
        ...state,
        baselineType: cross.type,
        baselinePrice: cross.price,
        baselineTime: cross.time
      },
      signal: null
    };
  }

  // 同向交叉忽略，不更新基准
  if (cross.type === state.baselineType) {
    return { state, signal: null };
  }

  const priceDiff = Math.abs(
    cross.price - state.baselinePrice
  );

  // 必须严格大于阈值
  const triggerMet = priceDiff > params.threshold;

  const previousPrice = state.baselinePrice;

  const nextStatus: TrendStatus = triggerMet
    ? cross.type === "GOLDEN"
      ? "BULL_WAITING"
      : "BEAR_WAITING"
    : (state.status as TrendStatus);

  const signal: SignalDraft = {
    kind: "EMA_TREND",
    eventType:
      cross.type === "GOLDEN" ? "TREND_GOLDEN" : "TREND_DEATH",
    direction: cross.type === "GOLDEN" ? "BULL" : "BEAR",
    price: cross.price,
    eventTime: cross.time,
    threshold: params.threshold,
    priceDiff,
    triggerMet,
    reason: triggerMet ? null : "price_diff_not_exceeded",
    payload: {
      fast: params.fast,
      slow: params.slow,
      threshold: params.threshold,
      previousPrice,
      fastEma: cross.fastEma,
      slowEma: cross.slowEma
    }
  };

  // 无论是否达到阈值，反向交叉都更新基准（沿用现有算法）
  return {
    state: {
      ...state,
      status: nextStatus,
      baselineType: cross.type,
      baselinePrice: cross.price,
      baselineTime: cross.time
    },
    signal
  };
}

function runEmaTrend(
  input: StrategyRunInput
): StrategyRunResult {
  const params = input.params as EmaTrendParams;

  const crosses = detectCrosses(
    input.klines,
    params.fast,
    params.slow
  );

  const snapshot = getEmaSnapshot(
    input.klines,
    params.fast,
    params.slow
  );

  const series = calculateEmaSeries(
    input.klines,
    params.fast,
    params.slow
  );

  const alignmentByTime = new Map<number, boolean>();

  for (const point of series) {
    if (
      point.fastEma !== null &&
      point.slowEma !== null
    ) {
      alignmentByTime.set(
        point.time,
        point.fastEma > point.slowEma
      );
    }
  }

  const latestKline = input.klines[input.klines.length - 1];

  const latestAlignment =
    alignmentByTime.get(latestKline.closeTime) ?? null;

  // 预热：完整重放历史交叉，只恢复状态，不产生信号
  if (input.warmup) {
    let state = createEmaState();

    for (const cross of crosses) {
      state = applyCross(cross, params, state).state;
    }

    state = {
      ...state,
      extra: {
        emaFast: snapshot.fastEma,
        emaSlow: snapshot.slowEma,
        aligned: latestAlignment
      }
    };

    input.shared.trend = state.status as TrendStatus;
    input.shared.alignment = latestAlignment;

    return { state, signals: [] };
  }

  const freshTimes = new Set(
    input.newKlines.map((kline) => kline.closeTime)
  );

  const crossByTime = new Map<number, CrossSignal>();

  for (const cross of crosses) {
    if (freshTimes.has(cross.time)) {
      crossByTime.set(cross.time, cross);
    }
  }

  let state = input.state;
  const signals: SignalDraft[] = [];

  for (const kline of input.newKlines) {
    const cross = crossByTime.get(kline.closeTime);

    if (cross) {
      const result = applyCross(cross, params, state);

      state = result.state;

      if (result.signal) {
        signals.push(result.signal);
      }
    }

    input.shared.trendByCloseTime.set(
      kline.closeTime,
      state.status as TrendStatus
    );

    const alignment = alignmentByTime.get(kline.closeTime);

    if (alignment !== undefined) {
      input.shared.alignmentByCloseTime.set(
        kline.closeTime,
        alignment
      );
    }
  }

  state = {
    ...state,
    extra: {
      emaFast: snapshot.fastEma,
      emaSlow: snapshot.slowEma,
      aligned: latestAlignment
    }
  };

  input.shared.trend = state.status as TrendStatus;
  input.shared.alignment = latestAlignment;

  return { state, signals };
}

export const emaTrendRunner: StrategyRunner = {
  kind: "EMA_TREND",
  sortOrder: 0,
  defaultParams() {
    return { ...DEFAULT_EMA_PARAMS };
  },
  normalizeParams(raw, klineLimit) {
    return normalizeEmaParams(raw, klineLimit);
  },
  run: runEmaTrend
};
