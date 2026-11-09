import type {
  ConditionDisplayItem,
  SignalDirection
} from "../db/types";
import type { Kline } from "../indicators/types";

import type {
  ConditionDefinition,
  ConditionPoint,
  ConditionRunInput,
  ConditionRunResult
} from "./types";

type LevelDirection = "up" | "down" | "both";

interface LevelParams {
  level: number;
  direction: LevelDirection;
}

function readParams(raw: unknown): LevelParams {
  const input =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const level = Number(input.level ?? 0);
  const direction =
    input.direction === "up" ||
    input.direction === "down" ||
    input.direction === "both"
      ? input.direction
      : "both";

  if (!Number.isFinite(level) || level <= 0) {
    throw new Error("压力/支撑价位必须大于 0");
  }

  return { level, direction };
}

function directionLabel(direction: LevelDirection): string {
  if (direction === "up") {
    return "向上触及";
  }

  if (direction === "down") {
    return "向下触及";
  }

  return "上下触及";
}

function display(
  point: {
    eventDirection: SignalDirection | null;
    high: number;
    low: number;
    close: number;
  },
  params: LevelParams
): ConditionDisplayItem[] {
  return [
    {
      label: "价位",
      value: params.level.toLocaleString("en-US", {
        maximumFractionDigits: 8
      })
    },
    {
      label: "方向",
      value: directionLabel(params.direction)
    },
    {
      label: "状态",
      value: point.eventDirection
        ? `${point.eventDirection === "BULL" ? "向上" : "向下"}触及`
        : "等待触及",
      tone: point.eventDirection === "BULL"
        ? "bull"
        : point.eventDirection === "BEAR"
          ? "bear"
          : "neutral"
    }
  ];
}

function buildPoint(
  klines: Kline[],
  index: number,
  params: LevelParams
): ConditionPoint | null {
  const kline = klines[index];

  if (!kline) {
    return null;
  }

  const previous = klines[index - 1];
  const previousClose = previous?.close ?? kline.open;

  const upHit =
    (params.direction === "up" ||
      params.direction === "both") &&
    previousClose < params.level &&
    kline.high >= params.level;

  const downHit =
    (params.direction === "down" ||
      params.direction === "both") &&
    previousClose > params.level &&
    kline.low <= params.level;

  let eventDirection: SignalDirection | null = null;

  if (upHit) {
    eventDirection = "BULL";
  } else if (downHit) {
    eventDirection = "BEAR";
  }

  const close = kline.close;
  let activeDirection: SignalDirection | null = null;

  if (params.direction === "up" && close >= params.level) {
    activeDirection = "BULL";
  } else if (
    params.direction === "down" &&
    close <= params.level
  ) {
    activeDirection = "BEAR";
  } else if (params.direction === "both") {
    activeDirection =
      close >= params.level ? "BULL" : "BEAR";
  }

  return {
    time: kline.closeTime,
    eventType: eventDirection ? "PRICE_LEVEL" : null,
    direction: eventDirection ?? activeDirection,
    active: activeDirection !== null,
    threshold: params.level,
    payload: {
      level: params.level,
      direction: params.direction,
      previousClose,
      high: kline.high,
      low: kline.low,
      close
    },
    display: display(
      {
        eventDirection,
        high: kline.high,
        low: kline.low,
        close
      },
      params
    )
  };
}

function runLevel(
  input: ConditionRunInput
): ConditionRunResult {
  const params = readParams(input.params);
  const latest =
    input.klines.length > 0
      ? buildPoint(
          input.klines,
          input.klines.length - 1,
          params
        )
      : null;

  if (input.warmup) {
    return {
      state: {},
      points: new Map(),
      latest,
      statusText: latest?.display[2]?.value ?? "等待数据"
    };
  }

  const points = new Map<number, ConditionPoint>();
  const indexByTime = new Map<number, number>();

  input.klines.forEach((kline, index) => {
    indexByTime.set(kline.closeTime, index);
  });

  for (const kline of input.newKlines) {
    const index = indexByTime.get(kline.closeTime);

    if (index === undefined) {
      continue;
    }

    const point = buildPoint(input.klines, index, params);

    if (point) {
      points.set(kline.closeTime, point);
    }
  }

  return {
    state: {},
    points,
    latest,
    statusText: latest?.display[2]?.value ?? "等待数据"
  };
}

export const priceLevelDefinition: ConditionDefinition = {
  kind: "PRICE_LEVEL",
  label: "压力 / 支撑价",
  description:
    "价格从下方触及指定价位，或从上方下跌触及指定价位时触发。",
  roles: ["trigger", "filter"],
  defaultRole: "trigger",
  summaryTemplate: "{directionLabel} {level}",
  fields: [
    {
      key: "level",
      label: "价位",
      type: "number",
      min: 0.00000001,
      step: "any",
      defaultValue: 100
    },
    {
      key: "direction",
      label: "触及方向",
      type: "select",
      defaultValue: "both",
      options: [
        { value: "up", label: "向上触及" },
        { value: "down", label: "向下触及" },
        { value: "both", label: "上下均可" }
      ]
    }
  ],
  normalizeParams(raw) {
    return { ...readParams(raw) };
  },
  summarize(params) {
    const direction =
      params.direction === "up"
        ? "向上触及"
        : params.direction === "down"
          ? "向下触及"
          : "上下触及";

    return `${direction} ${params.level}`;
  },
  run: runLevel
};
