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
type ZeroSide = "any" | "positive" | "negative";

interface DeaParams extends MacdParams {
  direction: DeaDirection;
  freshBars: number;
  zeroSide: ZeroSide;
}

interface TurnInfo {
  direction: SignalDirection;
  bars: number;
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
  const freshBars = Number(input.freshBars ?? 3);
  const zeroSide =
    input.zeroSide === "positive" ||
    input.zeroSide === "negative"
      ? input.zeroSide
      : "any";
  const params: DeaParams = {
    fast,
    slow,
    signal,
    direction,
    freshBars,
    zeroSide
  };

  validateMacdParams(params);

  if (
    !Number.isInteger(freshBars) ||
    freshBars < 1 ||
    freshBars > 50
  ) {
    throw new Error("DEA 拐头有效期必须在 1 到 50 根之间");
  }

  return params;
}

function deaSideAllowed(
  point: MacdPoint,
  params: DeaParams
): boolean {
  if (point.dea === null) {
    return false;
  }

  if (
    params.zeroSide === "positive" &&
    point.dea <= 0
  ) {
    return false;
  }

  if (
    params.zeroSide === "negative" &&
    point.dea >= 0
  ) {
    return false;
  }

  return true;
}

function recentTurn(
  points: MacdPoint[],
  index: number,
  params: DeaParams
): TurnInfo | null {
  const start = Math.max(2, index - params.freshBars);

  for (let i = index; i >= start; i--) {
    const current = points[i];
    const previous = points[i - 1];
    const previous2 = points[i - 2];

    if (
      !current ||
      !previous ||
      !previous2 ||
      current.dea === null ||
      previous.dea === null ||
      previous2.dea === null
    ) {
      continue;
    }

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
      return { direction: "BULL", bars: index - i };
    }

    if (turnedDown) {
      return { direction: "BEAR", bars: index - i };
    }
  }

  return null;
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
  const turn = recentTurn(points, index, params);
  const hasSlope =
    current.dea !== null &&
    previous?.dea !== null &&
    previous?.dea !== undefined;
  const rising = hasSlope ? current.dea! > previous!.dea! : false;
  const falling = hasSlope ? current.dea! < previous!.dea! : false;
  const positionAllowed = deaSideAllowed(current, params);

  let eventDirection: SignalDirection | null = null;
  let activeDirection: SignalDirection | null = null;

  if (
    emitEvent &&
    turn?.bars === 0 &&
    positionAllowed
  ) {
    eventDirection = turn.direction;
  }

  if (turn && positionAllowed) {
    if (turn.direction === "BULL" && rising) {
      activeDirection = "BULL";
    } else if (turn.direction === "BEAR" && falling) {
      activeDirection = "BEAR";
    }
  }

  const label = eventDirection
    ? eventDirection === "BULL"
      ? "DEA 刚拐头向上"
      : "DEA 刚拐头向下"
    : activeDirection === "BULL"
      ? `DEA 向上（拐头第${(turn?.bars ?? 0) + 1}根）`
      : activeDirection === "BEAR"
        ? `DEA 向下（拐头第${(turn?.bars ?? 0) + 1}根）`
        : hasSlope
          ? turn
            ? positionAllowed
              ? `DEA ${rising ? "向上" : "向下"}，拐头后走弱`
              : `DEA ${rising ? "向上" : "向下"}，但零轴位置不符`
            : params.direction === "up"
              ? rising
                ? "DEA 向上，但拐头已过期"
                : "DEA 向下，未满足向上"
              : falling
                ? "DEA 向下，但拐头已过期"
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
      label: "DEA 位置",
      value:
        current.dea === null
          ? "--"
          : current.dea >= 0
            ? "零轴上方"
            : "零轴下方",
      tone:
        current.dea === null
          ? "neutral"
          : current.dea >= 0
            ? "bull"
            : "bear"
    },
    {
      label: "周期",
      value: `${params.fast}/${params.slow}/${params.signal}`
    },
    {
      label: "拐头时效",
      value: turn
        ? `第${turn.bars + 1}根 / 有效期${params.freshBars}根`
        : `有效期${params.freshBars}根内无拐头`
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
      freshBars: params.freshBars,
      zeroSide: params.zeroSide,
      positionAllowed,
      barsSinceTurn: turn?.bars ?? null,
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
    },
    {
      key: "freshBars",
      label: "拐头有效期（根）",
      type: "number",
      min: 1,
      max: 50,
      defaultValue: 3,
      help: "过滤条件只在这个根数内认为 DEA 拐头仍然有效"
    },
    {
      key: "zeroSide",
      label: "DEA 零轴位置",
      type: "select",
      defaultValue: "any",
      options: [
        { value: "any", label: "不限制" },
        { value: "positive", label: "零轴上方" },
        { value: "negative", label: "零轴下方" }
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
    const side =
      value.zeroSide === "positive"
        ? " · 零轴上"
        : value.zeroSide === "negative"
          ? " · 零轴下"
          : "";

    return `MACD ${value.fast}/${value.slow}/${value.signal} · DEA ${direction}拐头 · ${value.freshBars}根内${side}`;
  },
  run: runMacd
};
