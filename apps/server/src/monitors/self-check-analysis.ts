import { calculateEMA } from "../indicators/ema";
import { calculateKDJ } from "../indicators/kdj";
import {
  calculateMACD,
  DEFAULT_MACD_PARAMS
} from "../indicators/macd";
import type { Kline } from "../indicators/types";

export type SelfCheckEmaArrangement = "bull" | "bear" | "flat";
export type SelfCheckSpreadState =
  | "expanding"
  | "contracting"
  | "flat"
  | "unknown";
export type SelfCheckTrendStrength =
  | "strong"
  | "weak"
  | "unclear";
export type SelfCheckKdjZone =
  | "overbought"
  | "oversold"
  | "neutral"
  | "unknown";
export type SelfCheckMacdZone =
  | "above"
  | "below"
  | "mixed"
  | "unknown";
export type SelfCheckMacdCross =
  | "golden"
  | "death"
  | "unknown";
export type SelfCheckMacdHistogramState =
  | "expanding"
  | "contracting"
  | "flat"
  | "unknown";
export type SelfCheckVolumeState =
  | "high"
  | "normal"
  | "low"
  | "unknown";

export const SELF_CHECK_EMA_FAST = 25;
export const SELF_CHECK_EMA_SLOW = 60;

export const SELF_CHECK_KDJ_PARAMS = {
  period: 9,
  kSmooth: 3,
  dSmooth: 3
} as const;

export const SELF_CHECK_KDJ_OVERBOUGHT = 80;
export const SELF_CHECK_KDJ_OVERSOLD = 20;

export const SELF_CHECK_VOLUME_LOOKBACK = 5;
export const SELF_CHECK_VOLUME_HIGH = 1.5;
export const SELF_CHECK_VOLUME_LOW = 0.7;

export interface SelfCheckAnalysis {
  /** 兼容旧快照：MACD DEA 方向 */
  trend: "up" | "down";
  /** 兼容旧快照：MACD DEA 加速度强弱 */
  strength: "强" | "中" | "弱" | "拐头";
  strength_pct: number;

  ema25: number | null;
  ema60: number | null;
  ema_arrangement: SelfCheckEmaArrangement;
  ema_duration_minutes: number | null;
  ema_duration_start: number | null;
  ema_spread_state: SelfCheckSpreadState;
  ema_spread_change_pct: number | null;
  trend_strength: SelfCheckTrendStrength;

  j: number | null;
  k: number | null;
  d: number | null;
  kdj_zone: SelfCheckKdjZone;

  macd_zone: SelfCheckMacdZone;
  macd_cross: SelfCheckMacdCross;
  macd_histogram_state: SelfCheckMacdHistogramState;

  volume_state: SelfCheckVolumeState;
  volume_ratio: number | null;

  /** 兼容旧快照：J 极值需求 */
  demand: "上涨需求" | "下跌需求" | null;
  time: number | null;
}

export function emptySelfCheckAnalysis(): SelfCheckAnalysis {
  return {
    trend: "down",
    strength: "弱",
    strength_pct: 0,
    ema25: null,
    ema60: null,
    ema_arrangement: "flat",
    ema_duration_minutes: null,
    ema_duration_start: null,
    ema_spread_state: "unknown",
    ema_spread_change_pct: null,
    trend_strength: "unclear",
    j: null,
    k: null,
    d: null,
    kdj_zone: "unknown",
    macd_zone: "unknown",
    macd_cross: "unknown",
    macd_histogram_state: "unknown",
    volume_state: "unknown",
    volume_ratio: null,
    demand: null,
    time: null
  };
}

function lastFinite(values: Array<number | null>): number | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function emaArrangement(
  fast: number | null,
  slow: number | null
): SelfCheckEmaArrangement {
  if (fast === null || slow === null) {
    return "flat";
  }

  if (fast > slow) {
    return "bull";
  }

  if (fast < slow) {
    return "bear";
  }

  return "flat";
}

function kdjZone(j: number | null): SelfCheckKdjZone {
  if (j === null) {
    return "unknown";
  }

  if (j > SELF_CHECK_KDJ_OVERBOUGHT) {
    return "overbought";
  }

  if (j < SELF_CHECK_KDJ_OVERSOLD) {
    return "oversold";
  }

  return "neutral";
}

function macdZone(
  dif: number | null,
  dea: number | null
): SelfCheckMacdZone {
  if (dif === null || dea === null) {
    return "unknown";
  }

  if (dif >= 0 && dea >= 0) {
    return "above";
  }

  if (dif <= 0 && dea <= 0) {
    return "below";
  }

  return "mixed";
}

function macdCross(
  dif: number | null,
  dea: number | null
): SelfCheckMacdCross {
  if (dif === null || dea === null) {
    return "unknown";
  }

  return dif >= dea ? "golden" : "death";
}

function histogramState(
  current: number | null,
  previous: number | null
): SelfCheckMacdHistogramState {
  if (current === null || previous === null) {
    return "unknown";
  }

  const currentAbs = Math.abs(current);
  const previousAbs = Math.abs(previous);

  if (currentAbs > previousAbs) {
    return "expanding";
  }

  if (currentAbs < previousAbs) {
    return "contracting";
  }

  return "flat";
}

function volumeState(
  klines: Kline[],
  lookback: number
): {
  state: SelfCheckVolumeState;
  ratio: number | null;
} {
  const lastIndex = klines.length - 1;

  if (lastIndex < lookback) {
    return { state: "unknown", ratio: null };
  }

  const current = klines[lastIndex].volume;

  if (!Number.isFinite(current) || current <= 0) {
    return { state: "unknown", ratio: null };
  }

  let sum = 0;

  for (let index = lastIndex - lookback; index < lastIndex; index += 1) {
    const volume = klines[index].volume;

    if (!Number.isFinite(volume) || volume < 0) {
      return { state: "unknown", ratio: null };
    }

    sum += volume;
  }

  const average = sum / lookback;

  if (!Number.isFinite(average) || average <= 0) {
    return { state: "unknown", ratio: null };
  }

  const ratio = current / average;
  const state: SelfCheckVolumeState =
    ratio >= SELF_CHECK_VOLUME_HIGH
      ? "high"
      : ratio <= SELF_CHECK_VOLUME_LOW
        ? "low"
        : "normal";

  return { state, ratio };
}

/**
 * 单个级别的开盘自查分析。
 *
 * 只接收已收盘 K 线；行情/网络失败由调用方处理。
 * 指标数据不足时返回 unknown/null，不抛异常。
 */
export function analyzeKlines(
  klines: Kline[],
  now = Date.now()
): SelfCheckAnalysis {
  const sorted = [...klines].sort(
    (left, right) => left.openTime - right.openTime
  );

  if (sorted.length === 0) {
    return emptySelfCheckAnalysis();
  }

  const analysis = emptySelfCheckAnalysis();
  const lastKline = sorted[sorted.length - 1];
  analysis.time = lastKline.closeTime;

  const closes = sorted.map((kline) => kline.close);
  const emaFast = calculateEMA(closes, SELF_CHECK_EMA_FAST);
  const emaSlow = calculateEMA(closes, SELF_CHECK_EMA_SLOW);
  const lastIndex = sorted.length - 1;
  const fast = lastFinite(emaFast);
  const slow = lastFinite(emaSlow);

  analysis.ema25 = fast;
  analysis.ema60 = slow;
  analysis.ema_arrangement = emaArrangement(fast, slow);

  // EMA60 最近一次斜率转向，作为当前趋势的起点。
  const slopes: Array<number | null> = Array(sorted.length).fill(null);

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = emaSlow[index - 1];
    const current = emaSlow[index];

    if (
      typeof previous === "number" &&
      Number.isFinite(previous) &&
      typeof current === "number" &&
      Number.isFinite(current)
    ) {
      slopes[index] = current - previous;
    }
  }

  let lastFlipIndex = -1;
  let lastFlipDirection: "up" | "down" | null = null;

  for (let index = 2; index <= lastIndex; index += 1) {
    const previousSlope = slopes[index - 1];
    const currentSlope = slopes[index];

    if (previousSlope === null || currentSlope === null) {
      continue;
    }

    if (previousSlope <= 0 && currentSlope > 0) {
      lastFlipIndex = index;
      lastFlipDirection = "up";
    } else if (previousSlope >= 0 && currentSlope < 0) {
      lastFlipIndex = index;
      lastFlipDirection = "down";
    }
  }

  const durationMatches =
    lastFlipIndex >= 0 &&
    ((analysis.ema_arrangement === "bull" &&
      lastFlipDirection === "up") ||
      (analysis.ema_arrangement === "bear" &&
        lastFlipDirection === "down"));

  if (durationMatches) {
    const start = sorted[lastFlipIndex].closeTime;

    analysis.ema_duration_start = start;
    analysis.ema_duration_minutes = Math.max(
      0,
      Math.floor((now - start) / 60000)
    );
  }

  // 双线间距：当前 |EMA25-EMA60| 与上一根比较。
  if (lastIndex >= 1) {
    const previousFast = emaFast[lastIndex - 1];
    const previousSlow = emaSlow[lastIndex - 1];

    if (
      fast !== null &&
      slow !== null &&
      typeof previousFast === "number" &&
      Number.isFinite(previousFast) &&
      typeof previousSlow === "number" &&
      Number.isFinite(previousSlow)
    ) {
      const spread = Math.abs(fast - slow);
      const previousSpread = Math.abs(previousFast - previousSlow);

      analysis.ema_spread_state =
        spread > previousSpread
          ? "expanding"
          : spread < previousSpread
            ? "contracting"
            : "flat";
      analysis.ema_spread_change_pct =
        previousSpread > 0
          ? ((spread - previousSpread) / previousSpread) * 100
          : null;
    }
  }

  if (
    analysis.ema_arrangement === "flat" ||
    analysis.ema_duration_minutes === null ||
    analysis.ema_spread_state === "unknown" ||
    analysis.ema_spread_state === "flat"
  ) {
    analysis.trend_strength = "unclear";
  } else if (analysis.ema_spread_state === "expanding") {
    analysis.trend_strength = "strong";
  } else {
    analysis.trend_strength = "weak";
  }

  const kdj = calculateKDJ(sorted, SELF_CHECK_KDJ_PARAMS);
  const lastKdj = kdj[kdj.length - 1] ?? null;

  analysis.j =
    typeof lastKdj?.j === "number" &&
    Number.isFinite(lastKdj.j)
      ? lastKdj.j
      : null;
  analysis.k =
    typeof lastKdj?.k === "number" &&
    Number.isFinite(lastKdj.k)
      ? lastKdj.k
      : null;
  analysis.d =
    typeof lastKdj?.d === "number" &&
    Number.isFinite(lastKdj.d)
      ? lastKdj.d
      : null;
  analysis.kdj_zone = kdjZone(analysis.j);
  analysis.demand =
    analysis.j !== null && analysis.j < 5
      ? "上涨需求"
      : analysis.j !== null && analysis.j > 80
        ? "下跌需求"
        : null;

  const macd = calculateMACD(sorted, DEFAULT_MACD_PARAMS);
  const lastMacd = macd[lastIndex] ?? null;
  const previousMacd = macd[lastIndex - 1] ?? null;
  const previous2Macd = macd[lastIndex - 2] ?? null;

  analysis.macd_zone = macdZone(
    lastMacd?.dif ?? null,
    lastMacd?.dea ?? null
  );
  analysis.macd_cross = macdCross(
    lastMacd?.dif ?? null,
    lastMacd?.dea ?? null
  );
  analysis.macd_histogram_state = histogramState(
    lastMacd?.histogram ?? null,
    previousMacd?.histogram ?? null
  );

  if (
    lastMacd &&
    previousMacd &&
    previous2Macd &&
    lastMacd.dea !== null &&
    previousMacd.dea !== null &&
    previous2Macd.dea !== null
  ) {
    const currentDelta = lastMacd.dea - previousMacd.dea;
    const previousDelta =
      previousMacd.dea - previous2Macd.dea;
    const sameDirection =
      currentDelta !== 0 &&
      previousDelta !== 0 &&
      Math.sign(currentDelta) === Math.sign(previousDelta);
    const turning =
      (previousDelta <= 0 && currentDelta > 0) ||
      (previousDelta >= 0 && currentDelta < 0);

    analysis.trend = currentDelta >= 0 ? "up" : "down";
    analysis.strength = turning
      ? "拐头"
      : sameDirection &&
          Math.abs(currentDelta) > Math.abs(previousDelta)
        ? "强"
        : sameDirection &&
            Math.abs(currentDelta) < Math.abs(previousDelta)
          ? "弱"
          : "中";
    analysis.strength_pct =
      lastKline.close > 0
        ? (Math.abs(currentDelta) / lastKline.close) * 100
        : 0;
  }

  const volume = volumeState(
    sorted,
    SELF_CHECK_VOLUME_LOOKBACK
  );

  analysis.volume_state = volume.state;
  analysis.volume_ratio = volume.ratio;

  return analysis;
}
