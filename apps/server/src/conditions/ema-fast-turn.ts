import type {
  ConditionDisplayItem,
  SignalDirection
} from "../db/types";
import { calculateEMA, validateEmaPeriods } from "../indicators/ema";
import type { Kline } from "../indicators/types";

import type {
  ConditionDefinition,
  ConditionPoint,
  ConditionRunInput,
  ConditionRunResult
} from "./types";

type FastTurn = "up" | "down";

interface FastTurnParams {
  fast: number;
  slow: number;
  turn: FastTurn;
  minSeparationPct: number;
}

function readParams(raw: unknown): FastTurnParams {
  const input =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const params: FastTurnParams = {
    fast: Number(input.fast ?? 25),
    slow: Number(input.slow ?? 60),
    turn: input.turn === "up" ? "up" : "down",
    minSeparationPct: Number(
      input.minSeparationPct ?? 0.5
    )
  };

  validateEmaPeriods(params.fast, params.slow);

  if (
    !Number.isFinite(params.minSeparationPct) ||
    params.minSeparationPct < 0 ||
    params.minSeparationPct > 20
  ) {
    throw new Error("EMA 分离度必须在 0 到 20% 之间");
  }

  return params;
}

function separationPct(
  fast: number | null,
  slow: number | null
): number | null {
  if (
    fast === null ||
    slow === null ||
    slow === 0
  ) {
    return null;
  }

  return Math.abs((fast - slow) / slow) * 100;
}

function display(
  fast: number | null,
  slow: number | null,
  separation: number | null,
  params: FastTurnParams,
  activeDirection: SignalDirection | null,
  eventDirection: SignalDirection | null
): ConditionDisplayItem[] {
  return [
    {
      label: "状态",
      value: eventDirection
        ? eventDirection === "BULL"
          ? "快线刚拐头向上"
          : "快线刚拐头向下"
        : activeDirection === "BULL"
          ? "快线向上"
          : activeDirection === "BEAR"
            ? "快线向下"
            : "等待快线拐头",
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
      label: "EMA 快/慢",
      value:
        fast === null || slow === null
          ? "--"
          : `${fast.toFixed(8)} / ${slow.toFixed(8)}`
    },
    {
      label: "双线分离度",
      value:
        separation === null
          ? "--"
          : `${separation.toFixed(3)}% / ≥${params.minSeparationPct}%`,
      tone:
        separation !== null &&
        separation >= params.minSeparationPct
          ? "warn"
          : "neutral"
    },
    {
      label: "周期",
      value: `${params.fast}/${params.slow}`
    }
  ];
}

function buildPoint(
  klines: Kline[],
  fastValues: Array<number | null>,
  slowValues: Array<number | null>,
  index: number,
  params: FastTurnParams,
  emitEvent: boolean
): ConditionPoint | null {
  const kline = klines[index];
  const fast = fastValues[index];
  const slow = slowValues[index];
  const prevFast = fastValues[index - 1] ?? null;
  const prevPrevFast = fastValues[index - 2] ?? null;
  const separation = separationPct(fast, slow);
  const hasSeparation =
    separation !== null &&
    separation >= params.minSeparationPct;
  const hasSlope =
    fast !== null &&
    prevFast !== null;

  let eventDirection: SignalDirection | null = null;
  let activeDirection: SignalDirection | null = null;

  if (hasSlope) {
    if (params.turn === "down" && fast < prevFast) {
      activeDirection = "BEAR";
    } else if (params.turn === "up" && fast > prevFast) {
      activeDirection = "BULL";
    }

    if (emitEvent && hasSeparation && prevPrevFast !== null) {
      if (
        params.turn === "down" &&
        prevFast >= prevPrevFast &&
        fast < prevFast
      ) {
        eventDirection = "BEAR";
      } else if (
        params.turn === "up" &&
        prevFast <= prevPrevFast &&
        fast > prevFast
      ) {
        eventDirection = "BULL";
      }
    }
  }

  const active =
    activeDirection !== null && hasSeparation;

  return {
    time: kline.closeTime,
    eventType: eventDirection ? "EMA_FAST_TURN" : null,
    direction: eventDirection ?? activeDirection,
    active,
    threshold: params.minSeparationPct,
    payload: {
      fast: params.fast,
      slow: params.slow,
      turn: params.turn,
      minSeparationPct: params.minSeparationPct,
      fastEma: fast,
      slowEma: slow,
      separationPct: separation,
      previousFastEma: prevFast
    },
    display: display(
      fast,
      slow,
      separation,
      params,
      active ? activeDirection : null,
      eventDirection
    )
  };
}

function runFastTurn(
  input: ConditionRunInput
): ConditionRunResult {
  const params = readParams(input.params);
  const closes = input.klines.map((kline) => kline.close);
  const fastValues = calculateEMA(closes, params.fast);
  const slowValues = calculateEMA(closes, params.slow);
  const lastIndex = input.klines.length - 1;
  const latest =
    lastIndex >= 0
      ? buildPoint(
          input.klines,
          fastValues,
          slowValues,
          lastIndex,
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

  const points = new Map<number, ConditionPoint>();

  for (const kline of input.newKlines) {
    const index = indexByTime.get(kline.closeTime);

    if (index === undefined) {
      continue;
    }

    const point = buildPoint(
      input.klines,
      fastValues,
      slowValues,
      index,
      params,
      true
    );

    if (point) {
      points.set(kline.closeTime, point);
    }
  }

  return {
    state: {},
    points,
    latest,
    statusText: latest?.display[0]?.value ?? "等待数据"
  };
}

export const emaFastTurnDefinition: ConditionDefinition = {
  kind: "EMA_FAST_TURN",
  label: "EMA 快线拐头",
  description:
    "监控快线 EMA 的斜率拐头，并要求快慢线保持足够分离；用于主升/主跌后的动能转弱或转强。",
  roles: ["trigger", "filter"],
  defaultRole: "filter",
  summaryTemplate:
    "EMA {fast}/{slow} 快线拐头 · 分离≥{minSeparationPct}%",
  fields: [
    {
      key: "fast",
      label: "快线 EMA",
      type: "number",
      min: 2,
      defaultValue: 25
    },
    {
      key: "slow",
      label: "慢线 EMA",
      type: "number",
      min: 3,
      defaultValue: 60
    },
    {
      key: "turn",
      label: "拐头方向",
      type: "select",
      defaultValue: "down",
      options: [
        { value: "down", label: "快线拐头向下" },
        { value: "up", label: "快线拐头向上" }
      ]
    },
    {
      key: "minSeparationPct",
      label: "最小双线分离度（%）",
      type: "number",
      min: 0,
      max: 20,
      step: "any",
      defaultValue: 0.5,
      help: "|快线-慢线| / 慢线 × 100"
    }
  ],
  normalizeParams(raw) {
    return { ...readParams(raw) };
  },
  summarize(params) {
    const value = params as unknown as FastTurnParams;

    return `EMA ${value.fast}/${value.slow} 快线${
      value.turn === "down" ? "向下" : "向上"
    }拐头 · 分离≥${value.minSeparationPct}%`;
  },
  run: runFastTurn
};
