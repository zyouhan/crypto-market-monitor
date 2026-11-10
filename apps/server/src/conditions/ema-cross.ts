import type {
  ConditionDisplayItem,
  SignalDirection,
  TrendStatus
} from "../db/types";
import type { Kline } from "../indicators/types";
import { calculateEMA } from "../indicators/ema";
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

function priceAllowed(
  close: number | null,
  slowEma: number | null,
  params: EmaTrendParams
): boolean {
  if (params.priceSide === "none" || params.priceSide === undefined) {
    return true;
  }

  if (close === null || slowEma === null) {
    return false;
  }

  return params.priceSide === "above"
    ? close >= slowEma
    : close <= slowEma;
}

function buildDisplay(
  state: StrategyStateView,
  params: EmaTrendParams,
  close: number | null = null,
  slowEma: number | null = null
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

  const display: ConditionDisplayItem[] = [
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

  if (params.priceSide !== "none" && params.priceSide !== undefined) {
    const above =
      close !== null && slowEma !== null
        ? close >= slowEma
        : null;

    display.push({
      label: "价格位置",
      value:
        above === null
          ? "--"
          : `${above ? "慢线上方" : "慢线下方"}（${
              close?.toLocaleString("en-US", {
                maximumFractionDigits: 8
              }) ?? "--"
            } / ${
              slowEma?.toLocaleString("en-US", {
                maximumFractionDigits: 8
              }) ?? "--"
            }）`,
      tone: above === null ? "neutral" : above ? "bull" : "bear"
    });
  }

  return display;
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

  const slowEma =
    calculateEMA(
      klines.map((kline) => kline.close),
      params.slow
    )[klines.length - 1] ?? null;
  const allowed = priceAllowed(last.close, slowEma, params);

  return {
    time: last.closeTime,
    eventType: null,
    direction: statusDirection(state.status),
    active: state.status !== "NEUTRAL" && allowed,
    threshold: params.threshold,
    payload: {
      fast: params.fast,
      slow: params.slow,
      threshold: params.threshold,
      close: last.close,
      slowEma,
      priceSide: params.priceSide ?? "none",
      priceAllowed: allowed
    },
    display: buildDisplay(
      state,
      params,
      last.close,
      slowEma
    )
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
  const slowEmas = calculateEMA(
    input.klines.map((kline) => kline.close),
    params.slow
  );
  const indexByTime = new Map<number, number>();

  input.klines.forEach((kline, index) => {
    indexByTime.set(kline.closeTime, index);
  });

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
      const index = indexByTime.get(kline.closeTime);
      const slowEma =
        index === undefined
          ? null
          : slowEmas[index] ?? null;
      const allowed = priceAllowed(
        kline.close,
        slowEma,
        params
      );

      points.set(kline.closeTime, {
        time: kline.closeTime,
        eventType: allowed
          ? event?.eventType ?? null
          : null,
        direction:
          event?.direction ?? statusDirection(status),
        active: status !== "NEUTRAL" && allowed,
        threshold: params.threshold,
        payload: {
          ...(event?.payload ?? {
            fast: params.fast,
            slow: params.slow,
            threshold: params.threshold
          }),
          close: kline.close,
          slowEma,
          priceSide: params.priceSide ?? "none",
          priceAllowed: allowed
        },
        display: buildDisplay(
          result.state,
          params,
          kline.close,
          slowEma
        )
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
    },
    {
      key: "priceSide",
      label: "价格位置过滤",
      type: "select",
      defaultValue: "none",
      options: [
        { value: "none", label: "不限制" },
        { value: "above", label: "收盘在慢线上方" },
        { value: "below", label: "收盘在慢线下方" }
      ],
      help: "用于排除 DEA/EMA 仍向上但价格已经跌破慢线的情况"
    }
  ],
  normalizeParams(raw, klineLimit) {
    return { ...normalizeEmaParams(raw, klineLimit) };
  },
  summarize(params) {
    const side =
      params.priceSide === "above"
        ? " · 价格在慢线上方"
        : params.priceSide === "below"
          ? " · 价格在慢线下方"
          : "";

    return `EMA ${params.fast}/${params.slow}${side}`;
  },
  run: runEmaCondition
};
