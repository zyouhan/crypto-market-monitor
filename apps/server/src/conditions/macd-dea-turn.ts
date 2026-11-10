import type {
  ConditionDisplayItem,
  SignalDirection
} from "../db/types";
import {
  calculateMACD,
  DEFAULT_MACD_PARAMS,
  validateMacdParams,
  type MacdParams
} from "../indicators/macd";
import type { MacdPoint } from "../indicators/types";

import type {
  ConditionDefinition,
  ConditionPoint,
  ConditionRunInput,
  ConditionRunResult
} from "./types";

type DeaDirection = "up" | "down" | "both";

interface DeaParams extends MacdParams {
  direction: DeaDirection;
}

function readParams(raw: unknown): DeaParams {
  const input =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const fast = Number(input.fast ?? DEFAULT_MACD_PARAMS.fast);
  const slow = Number(input.slow ?? DEFAULT_MACD_PARAMS.slow);
  const signal = Number(
    input.signal ?? DEFAULT_MACD_PARAMS.signal
  );
  const direction =
    input.direction === "up" ||
    input.direction === "down" ||
    input.direction === "both"
      ? input.direction
      : "up";
  const params: DeaParams = {
    fast,
    slow,
    signal,
    direction
  };

  validateMacdParams(params);

  return params;
}

function buildPoint(
  points: MacdPoint[],
  index: number,
  params: DeaParams,
  emitEvent: boolean
): ConditionPoint | null {
  const current = points[index];

  if (!current) {
    return null;
  }

  const previous = points[index - 1] ?? null;
  const previous2 = points[index - 2] ?? null;

  let eventDirection: SignalDirection | null = null;
  let activeDirection: SignalDirection | null = null;

  if (
    current.dea !== null &&
    previous?.dea !== null &&
    previous?.dea !== undefined
  ) {
    const rising = current.dea > previous.dea;
    const falling = current.dea < previous.dea;

    if (params.direction === "up" && rising) {
      activeDirection = "BULL";
    } else if (params.direction === "down" && falling) {
      activeDirection = "BEAR";
    } else if (params.direction === "both") {
      activeDirection = rising
        ? "BULL"
        : falling
          ? "BEAR"
          : null;
    }

    if (
      emitEvent &&
      previous2?.dea !== null &&
      previous2?.dea !== undefined
    ) {
      const turnedUp =
        (params.direction === "up" ||
          params.direction === "both") &&
        previous.dea <= previous2.dea &&
        current.dea > previous.dea;
      const turnedDown =
        (params.direction === "down" ||
          params.direction === "both") &&
        previous.dea >= previous2.dea &&
        current.dea < previous.dea;

      if (turnedUp) {
        eventDirection = "BULL";
      } else if (turnedDown) {
        eventDirection = "BEAR";
      }
    }
  }

  const label = eventDirection
    ? eventDirection === "BULL"
      ? "DEA 刚拐头向上"
      : "DEA 刚拐头向下"
    : activeDirection === "BULL"
      ? "DEA 持续向上"
      : activeDirection === "BEAR"
        ? "DEA 持续向下"
        : current.dea !== null &&
            previous?.dea !== null &&
            previous?.dea !== undefined
          ? current.dea === previous.dea
            ? "DEA 走平"
            : params.direction === "up"
              ? "DEA 向下，未满足向上"
              : "DEA 向上，未满足向下"
          : "等待 DEA 数据";

  const display: ConditionDisplayItem[] = [
    {
      label: "状态",
      value: label,
      tone: eventDirection === "BULL"
        ? "bull"
        : eventDirection === "BEAR"
          ? "bear"
          : activeDirection === "BULL"
            ? "bull"
            : activeDirection === "BEAR"
              ? "bear"
              : "neutral"
    },
    {
      label: "DIF / DEA",
      value:
        current.dif === null || current.dea === null
          ? "--"
          : `${current.dif.toFixed(6)} / ${current.dea.toFixed(6)}`
    },
    {
      label: "MACD 柱",
      value:
        current.histogram === null
          ? "--"
          : current.histogram.toFixed(6)
    },
    {
      label: "周期",
      value: `${params.fast}/${params.slow}/${params.signal}`
    }
  ];

  return {
    time: current.time,
    eventType: eventDirection ? "MACD_DEA_TURN" : null,
    direction: eventDirection ?? activeDirection,
    active: activeDirection !== null,
    threshold: current.dea,
    payload: {
      fast: params.fast,
      slow: params.slow,
      signal: params.signal,
      direction: params.direction,
      dif: current.dif,
      dea: current.dea,
      previousDea: previous?.dea ?? null,
      histogram: current.histogram
    },
    display
  };
}

function latestPoint(
  points: MacdPoint[],
  params: DeaParams
): ConditionPoint | null {
  if (points.length === 0) {
    return null;
  }

  return buildPoint(
    points,
    points.length - 1,
    params,
    false
  );
}

function statusText(point: ConditionPoint | null): string {
  return point?.display[0]?.value ?? "等待数据";
}

function runMacd(
  input: ConditionRunInput
): ConditionRunResult {
  const params = readParams(input.params);
  const points = calculateMACD(input.klines, params);
  const latest = latestPoint(points, params);

  if (input.warmup) {
    return {
      state: {},
      points: new Map(),
      latest,
      statusText: statusText(latest)
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
    statusText: statusText(latest)
  };
}

export const macdDeaTurnDefinition: ConditionDefinition = {
  kind: "MACD_DEA_TURN",
  label: "MACD DEA 拐头",
  description:
    "监控 MACD 的 DEA 线拐头；可作为入场触发，也可作为高周期趋势过滤。",
  roles: ["trigger", "filter"],
  defaultRole: "filter",
  summaryTemplate:
    "MACD {fast}/{slow}/{signal} · DEA 拐头 {direction}",
  fields: [
    {
      key: "fast",
      label: "快线周期",
      type: "number",
      min: 2,
      max: 100,
      defaultValue: DEFAULT_MACD_PARAMS.fast
    },
    {
      key: "slow",
      label: "慢线周期",
      type: "number",
      min: 3,
      max: 200,
      defaultValue: DEFAULT_MACD_PARAMS.slow
    },
    {
      key: "signal",
      label: "DEA 周期",
      type: "number",
      min: 2,
      max: 100,
      defaultValue: DEFAULT_MACD_PARAMS.signal
    },
    {
      key: "direction",
      label: "拐头方向",
      type: "select",
      defaultValue: "up",
      options: [
        { value: "up", label: "向上拐头" },
        { value: "down", label: "向下拐头" },
        { value: "both", label: "上下均可" }
      ]
    }
  ],
  normalizeParams(raw) {
    return { ...readParams(raw) };
  },
  summarize(params) {
    const value = params as unknown as DeaParams;
    const direction =
      value.direction === "down"
        ? "向下"
        : value.direction === "both"
          ? "上下"
          : "向上";

    return `MACD ${value.fast}/${value.slow}/${value.signal} · DEA ${direction}拐头`;
  },
  run: runMacd
};
