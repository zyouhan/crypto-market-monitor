import type {
  ConditionDisplayItem,
  SignalDirection
} from "../db/types";
import {
  calculateADX,
  DEFAULT_ADX_PARAMS,
  validateAdxParams,
  type AdxParams
} from "../indicators/adx";
import type { AdxPoint } from "../indicators/types";

import type {
  ConditionDefinition,
  ConditionPoint,
  ConditionRunInput,
  ConditionRunResult
} from "./types";

function readParams(raw: unknown): AdxParams {
  const input =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const params: AdxParams = {
    period: Number(input.period ?? DEFAULT_ADX_PARAMS.period),
    threshold: Number(
      input.threshold ?? DEFAULT_ADX_PARAMS.threshold
    ),
    direction:
      input.direction === "bull" ||
      input.direction === "bear" ||
      input.direction === "both"
        ? input.direction
        : "both"
  };

  validateAdxParams(params);

  return params;
}

function directionOf(
  point: AdxPoint
): SignalDirection | null {
  if (point.plusDi === null || point.minusDi === null) {
    return null;
  }

  if (point.plusDi > point.minusDi) {
    return "BULL";
  }

  if (point.minusDi > point.plusDi) {
    return "BEAR";
  }

  return null;
}

function directionAllowed(
  direction: SignalDirection | null,
  params: AdxParams
): boolean {
  if (!direction) {
    return false;
  }

  if (params.direction === "both") {
    return true;
  }

  return params.direction === "bull"
    ? direction === "BULL"
    : direction === "BEAR";
}

function display(
  point: AdxPoint,
  params: AdxParams
): ConditionDisplayItem[] {
  const direction = directionOf(point);
  const trending =
    point.adx !== null && point.adx >= params.threshold;

  return [
    {
      label: "状态",
      value:
        point.adx === null
          ? "等待数据"
          : trending
            ? direction === "BULL"
              ? "多头趋势"
              : direction === "BEAR"
                ? "空头趋势"
                : "趋势方向未知"
            : "横盘/弱趋势",
      tone:
        trending && direction === "BULL"
          ? "bull"
          : trending && direction === "BEAR"
            ? "bear"
            : "neutral"
    },
    {
      label: "ADX",
      value:
        point.adx === null
          ? "--"
          : `${point.adx.toFixed(2)} / 阈值 ${params.threshold}`
    },
    {
      label: "+DI / -DI",
      value:
        point.plusDi === null || point.minusDi === null
          ? "--"
          : `${point.plusDi.toFixed(2)} / ${point.minusDi.toFixed(2)}`
    },
    {
      label: "周期",
      value: String(params.period)
    }
  ];
}

function buildPoint(
  points: AdxPoint[],
  index: number,
  params: AdxParams,
  emitEvent: boolean
): ConditionPoint | null {
  const current = points[index];

  if (!current) {
    return null;
  }

  const previous = points[index - 1] ?? null;
  const direction = directionOf(current);
  const allowed = directionAllowed(direction, params);
  const active =
    current.adx !== null &&
    current.adx >= params.threshold &&
    allowed;

  let eventDirection: SignalDirection | null = null;

  if (
    emitEvent &&
    active &&
    previous?.adx !== null &&
    previous?.adx !== undefined &&
    previous.adx < params.threshold &&
    direction
  ) {
    eventDirection = direction;
  }

  return {
    time: current.time,
    eventType: eventDirection ? "ADX_TREND" : null,
    direction: eventDirection ?? direction,
    active,
    threshold: params.threshold,
    payload: {
      period: params.period,
      threshold: params.threshold,
      direction: params.direction,
      adx: current.adx,
      plusDi: current.plusDi,
      minusDi: current.minusDi
    },
    display: display(current, params)
  };
}

function runAdx(
  input: ConditionRunInput
): ConditionRunResult {
  const params = readParams(input.params);
  const points = calculateADX(
    input.klines,
    params.period
  );
  const latest =
    points.length > 0
      ? buildPoint(
          points,
          points.length - 1,
          params,
          false
        )
      : null;

  if (input.warmup) {
    return {
      state: {},
      points: new Map(),
      latest,
      statusText: latest?.display[0]?.value ?? "等待数据"
    };
  }

  const indexByTime = new Map<number, number>();

  input.klines.forEach((kline, index) => {
    indexByTime.set(kline.closeTime, index);
  });

  const resultPoints = new Map<number, ConditionPoint>();

  for (const kline of input.newKlines) {
    const index = indexByTime.get(kline.closeTime);

    if (index === undefined) {
      continue;
    }

    const point = buildPoint(
      points,
      index,
      params,
      true
    );

    if (point) {
      resultPoints.set(kline.closeTime, point);
    }
  }

  return {
    state: {},
    points: resultPoints,
    latest,
    statusText: latest?.display[0]?.value ?? "等待数据"
  };
}

export const adxTrendDefinition: ConditionDefinition = {
  kind: "ADX_TREND",
  label: "ADX 趋势强度",
  description:
    "ADX 高于阈值时认为存在趋势，并用 +DI/-DI 判断多空；用于过滤横盘。",
  roles: ["trigger", "filter"],
  defaultRole: "filter",
  summaryTemplate: "ADX {period} > {threshold}",
  fields: [
    {
      key: "period",
      label: "ADX 周期",
      type: "number",
      min: 2,
      max: 100,
      defaultValue: DEFAULT_ADX_PARAMS.period
    },
    {
      key: "threshold",
      label: "趋势阈值",
      type: "number",
      min: 0,
      max: 100,
      step: "any",
      defaultValue: DEFAULT_ADX_PARAMS.threshold
    },
    {
      key: "direction",
      label: "趋势方向",
      type: "select",
      defaultValue: "both",
      options: [
        { value: "bull", label: "只做多头趋势" },
        { value: "bear", label: "只做空头趋势" },
        { value: "both", label: "多空均可" }
      ]
    }
  ],
  normalizeParams(raw) {
    return { ...readParams(raw) };
  },
  summarize(params) {
    const value = params as unknown as AdxParams;
    const direction =
      value.direction === "bull"
        ? " · 多头"
        : value.direction === "bear"
          ? " · 空头"
          : "";

    return `ADX ${value.period} > ${value.threshold}${direction}`;
  },
  run: runAdx
};
