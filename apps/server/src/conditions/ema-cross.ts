import type {
  ConditionDisplayItem,
  SignalDirection,
  TrendStatus
} from "../db/types";
import type { Kline } from "../indicators/types";
import {
  DEFAULT_EMA_PARAMS,
  normalizeEmaParams,
  type EmaTrendParams
} from "../strategies/params";
import { emaTrendRunner } from "../strategies/ema-trend";
import type { StrategyStateView } from "../strategies/types";

import type {
  ConditionDefinition,
  ConditionPoint,
  ConditionRunInput,
  ConditionRunResult
} from "./types";

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function toStateView(
  state: Record<string, unknown>
): StrategyStateView {
  const status =
    state.status === "BULL_WAITING" ||
    state.status === "BEAR_WAITING" ||
    state.status === "NEUTRAL"
      ? (state.status as TrendStatus)
      : "NEUTRAL";

  return {
    status,
    baselineType:
      state.baselineType === "GOLDEN" ||
      state.baselineType === "DEATH"
        ? state.baselineType
        : null,
    baselinePrice: asNumber(state.baselinePrice),
    baselineEma: asNumber(state.baselineEma),
    baselineTime: asNumber(state.baselineTime),
    extra:
      typeof state.extra === "object" &&
      state.extra !== null &&
      !Array.isArray(state.extra)
        ? (state.extra as Record<string, unknown>)
        : {}
  };
}

function fromStateView(
  state: StrategyStateView
): Record<string, unknown> {
  return {
    status: state.status,
    baselineType: state.baselineType,
    baselinePrice: state.baselinePrice,
    baselineEma: state.baselineEma,
    baselineTime: state.baselineTime,
    extra: state.extra
  };
}

function trendText(status: string): string {
  if (status === "BULL_WAITING") {
    return "多头等待";
  }

  if (status === "BEAR_WAITING") {
    return "空头等待";
  }

  return "中性";
}

function statusDirection(
  status: string
): SignalDirection | null {
  if (status === "BULL_WAITING") {
    return "BULL";
  }

  if (status === "BEAR_WAITING") {
    return "BEAR";
  }

  return null;
}

function buildDisplay(
  state: StrategyStateView,
  params: EmaTrendParams
): ConditionDisplayItem[] {
  const aligned =
    typeof state.extra.aligned === "boolean"
      ? state.extra.aligned
      : null;

  const cross = state.baselineType
    ? state.baselineType === "GOLDEN"
      ? "金叉"
      : "死叉"
    : "--";

  return [
    {
      label: "状态",
      value: trendText(state.status),
      tone:
        state.status === "BULL_WAITING"
          ? "bull"
          : state.status === "BEAR_WAITING"
            ? "bear"
            : "neutral"
    },
    {
      label: "排列",
      value:
        aligned === null
          ? "未知"
          : aligned
            ? "多头排列"
            : "空头排列",
      tone:
        aligned === null
          ? "neutral"
          : aligned
            ? "bull"
            : "bear"
    },
    { label: "最近交叉", value: cross },
    {
      label: "交叉 EMA",
      value:
        state.baselineEma === null
          ? "--"
          : state.baselineEma.toLocaleString("en-US", {
              maximumFractionDigits: 8
            })
    },
    {
      label: "距离阈值",
      value: params.threshold.toLocaleString("en-US")
    }
  ];
}

function latestPoint(
  state: StrategyStateView,
  params: EmaTrendParams,
  klines: Kline[]
): ConditionPoint | null {
  const last = klines[klines.length - 1];

  if (!last) {
    return null;
  }

  return {
    time: last.closeTime,
    eventType: null,
    direction: statusDirection(state.status),
    active: state.status !== "NEUTRAL",
    threshold: params.threshold,
    payload: {
      fast: params.fast,
      slow: params.slow,
      threshold: params.threshold
    },
    display: buildDisplay(state, params)
  };
}

function runEmaCondition(
  input: ConditionRunInput
): ConditionRunResult {
  const params = input.params as unknown as EmaTrendParams;
  const shared = {
    trend: "NEUTRAL" as TrendStatus,
    trendByCloseTime: new Map<number, TrendStatus>()
  };

  const result = emaTrendRunner.run({
    state: toStateView(input.state),
    params,
    klines: input.klines,
    newKlines: input.warmup ? [] : input.newKlines,
    warmup: input.warmup,
    shared
  });

  const latest = latestPoint(result.state, params, input.klines);
  const points = new Map<number, ConditionPoint>();

  if (!input.warmup) {
    const eventByTime = new Map<number, (typeof result.signals)[number]>();

    for (const signal of result.signals) {
      if (
        signal.triggerMet &&
        (signal.eventType === "TREND_GOLDEN" ||
          signal.eventType === "TREND_DEATH")
      ) {
        eventByTime.set(signal.eventTime, signal);
      }
    }

    for (const kline of input.newKlines) {
      const status =
        shared.trendByCloseTime.get(kline.closeTime) ??
        result.state.status;
      const event = eventByTime.get(kline.closeTime);

      points.set(kline.closeTime, {
        time: kline.closeTime,
        eventType: event?.eventType ?? null,
        direction:
          event?.direction ?? statusDirection(status),
        active: status !== "NEUTRAL",
        threshold: params.threshold,
        payload: event?.payload ?? {
          fast: params.fast,
          slow: params.slow,
          threshold: params.threshold
        },
        display: latest?.display ?? []
      });
    }
  }

  return {
    state: fromStateView(result.state),
    points,
    latest,
    statusText: latest?.display[0]?.value ?? trendText(result.state.status)
  };
}

export const emaCrossDefinition: ConditionDefinition = {
  kind: "EMA_CROSS",
  label: "EMA 交叉",
  description:
    "快慢线交叉，并用两次交叉的慢线 EMA 距离确认趋势；可作为触发或过滤条件。",
  roles: ["trigger", "filter"],
  defaultRole: "trigger",
  summaryTemplate: "EMA {fast}/{slow} 交叉",
  fields: [
    {
      key: "fast",
      label: "快线 EMA",
      type: "number",
      min: 2,
      defaultValue: DEFAULT_EMA_PARAMS.fast
    },
    {
      key: "slow",
      label: "慢线 EMA",
      type: "number",
      min: 3,
      defaultValue: DEFAULT_EMA_PARAMS.slow
    },
    {
      key: "threshold",
      label: "EMA 距离阈值",
      type: "number",
      min: 0,
      step: "any",
      defaultValue: DEFAULT_EMA_PARAMS.threshold
    }
  ],
  normalizeParams(raw, klineLimit) {
    return { ...normalizeEmaParams(raw, klineLimit) };
  },
  summarize(params) {
    return `EMA ${params.fast}/${params.slow}`;
  },
  run: runEmaCondition
};
