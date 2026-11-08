import type { TrendStatus } from "../db/types";
import {
  calculateEmaSeries,
  detectCrosses,
  getEmaSnapshot
} from "../indicators/ema";
import type {
  CrossSignal,
  Kline
} from "../indicators/types";

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
    baselineEma: null,
    baselineTime: null,
    extra: {}
  };
}

/**
 * 处理一次交叉。
 *
 * 趋势判定使用「两次交叉点的慢线 EMA 距离」，
 * 交叉价格仍记录，仅用于展示与排查。
 */
function applyCross(
  cross: CrossSignal,
  params: EmaTrendParams,
  state: StrategyStateView
): {
  state: StrategyStateView;
  signal: SignalDraft | null;
} {
  const crossEma = cross.slowEma;

  // 首叉只建立基准
  if (
    state.baselineType === null ||
    state.baselinePrice === null ||
    state.baselineEma === null ||
    state.baselineTime === null
  ) {
    return {
      state: {
        ...state,
        baselineType: cross.type,
        baselinePrice: cross.price,
        baselineEma: crossEma,
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

  const emaDiff = Math.abs(
    crossEma - state.baselineEma
  );

  // 必须严格大于阈值
  const triggerMet = emaDiff > params.threshold;

  const previousPrice = state.baselinePrice;
  const previousEma = state.baselineEma;

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
    emaDiff,
    triggerMet,
    reason: triggerMet ? null : "ema_diff_not_exceeded",
    payload: {
      fast: params.fast,
      slow: params.slow,
      threshold: params.threshold,
      previousPrice,
      previousEma,
      crossEma,
      priceDiff,
      emaDiff,
      fastEma: cross.fastEma,
      slowEma: cross.slowEma
    }
  };

  // 无论是否达到阈值，反向交叉都更新基准
  return {
    state: {
      ...state,
      status: nextStatus,
      baselineType: cross.type,
      baselinePrice: cross.price,
      baselineEma: crossEma,
      baselineTime: cross.time
    },
    signal
  };
}

/**
 * 等待状态失效检查。
 *
 * 看跌等待时，当前慢线 EMA 高于基准 EMA 超过阈值 → 看跌预期失效；
 * 看涨等待时，当前慢线 EMA 低于基准 EMA 超过阈值 → 看涨预期失效。
 *
 * 失效只把状态置为 NEUTRAL，不改基准；下一次交叉重新判定。
 */
function applyInvalidation(
  kline: Kline,
  slowEma: number,
  params: EmaTrendParams,
  state: StrategyStateView
): {
  state: StrategyStateView;
  signal: SignalDraft | null;
} {
  if (state.baselineEma === null) {
    return { state, signal: null };
  }

  let deviation: number | null = null;
  let direction: "BULL" | "BEAR" | null = null;

  if (state.status === "BEAR_WAITING") {
    const diff = slowEma - state.baselineEma;

    if (diff > params.threshold) {
      deviation = diff;
      direction = "BEAR";
    }
  } else if (state.status === "BULL_WAITING") {
    const diff = state.baselineEma - slowEma;

    if (diff > params.threshold) {
      deviation = diff;
      direction = "BULL";
    }
  }

  if (deviation === null || direction === null) {
    return { state, signal: null };
  }

  const signal: SignalDraft = {
    kind: "EMA_TREND",
    eventType: "TREND_INVALIDATED",
    direction,
    price: kline.close,
    eventTime: kline.closeTime,
    threshold: params.threshold,
    priceDiff: null,
    emaDiff: deviation,
    triggerMet: false,
    reason: "ema_reverse_deviation",
    payload: {
      fast: params.fast,
      slow: params.slow,
      threshold: params.threshold,
      baselineType: state.baselineType,
      baselineEma: state.baselineEma,
      currentEma: slowEma,
      deviation
    }
  };

  return {
    state: {
      ...state,
      status: "NEUTRAL"
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

  const slowEmaByTime = new Map<number, number>();
  const alignmentByTime = new Map<number, boolean>();

  for (const point of series) {
    if (point.slowEma !== null) {
      slowEmaByTime.set(point.time, point.slowEma);
    }

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

  const latestSlowEma =
    slowEmaByTime.get(latestKline.closeTime) ?? null;

  const latestAlignment =
    alignmentByTime.get(latestKline.closeTime) ?? null;

  // 预热：完整重放历史交叉，只恢复状态，不产生信号
  if (input.warmup) {
    let state = createEmaState();

    for (const cross of crosses) {
      state = applyCross(cross, params, state).state;
    }

    // 用最后一根 K 线补一次失效检查，确保重启后状态与实时逻辑一致
    if (latestSlowEma !== null) {
      state = applyInvalidation(
        latestKline,
        latestSlowEma,
        params,
        state
      ).state;
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

    return { state, signals: [] };
  }

  const crossByTime = new Map<number, CrossSignal>();

  for (const cross of crosses) {
    crossByTime.set(cross.time, cross);
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

    const slowEma = slowEmaByTime.get(kline.closeTime);

    if (slowEma !== undefined) {
      const invalidation = applyInvalidation(
        kline,
        slowEma,
        params,
        state
      );

      state = invalidation.state;

      if (invalidation.signal) {
        signals.push(invalidation.signal);
      }
    }

    input.shared.trendByCloseTime.set(
      kline.closeTime,
      state.status as TrendStatus
    );
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
