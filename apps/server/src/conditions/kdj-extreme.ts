import type {
  ConditionDisplayItem,
  SignalDirection
} from "../db/types";
import { calculateKDJ } from "../indicators/kdj";
import type { Kline, KdjPoint } from "../indicators/types";
import {
  DEFAULT_KDJ_PARAMS,
  normalizeKdjParams,
  type KdjEntryParams
} from "../strategies/params";

import type {
  ConditionDefinition,
  ConditionPoint,
  ConditionRunInput,
  ConditionRunResult
} from "./types";

function latestPoint(
  points: KdjPoint[]
): KdjPoint | null {
  return points.length > 0 ? points[points.length - 1] : null;
}

function directionState(
  point: KdjPoint,
  params: KdjEntryParams
): SignalDirection | null {
  if (point.j === null) {
    return null;
  }

  if (params.longEnabled && point.j < params.oversold) {
    return "BULL";
  }

  if (params.shortEnabled && point.j > params.overbought) {
    return "BEAR";
  }

  return null;
}

function statusText(
  point: KdjPoint | null,
  params: KdjEntryParams
): string {
  if (!point || point.j === null) {
    return "等待数据";
  }

  if (params.longEnabled && point.j < params.oversold) {
    return `超卖区 J=${point.j.toFixed(2)}，等待做多触发`;
  }

  if (params.shortEnabled && point.j > params.overbought) {
    return `超买区 J=${point.j.toFixed(2)}，等待做空触发`;
  }

  if (params.longEnabled && params.shortEnabled) {
    return `等待 J<${params.oversold} 做多 / J>${params.overbought} 做空`;
  }

  if (params.longEnabled) {
    return `等待 J<${params.oversold} 做多`;
  }

  if (params.shortEnabled) {
    return `等待 J>${params.overbought} 做空`;
  }

  return "未启用方向";
}

interface StopInfo {
  j: number;
  price: number;
}

function buildStopMaps(
  klines: Kline[],
  points: KdjPoint[],
  params: KdjEntryParams
): {
  long: Map<number, StopInfo>;
  short: Map<number, StopInfo>;
} {
  const long = new Map<number, StopInfo>();
  const short = new Map<number, StopInfo>();
  let longStop: StopInfo | null = null;
  let shortStop: StopInfo | null = null;

  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    const kline = klines[index];

    if (!kline || point.j === null) {
      longStop = null;
      shortStop = null;
      continue;
    }

    if (
      params.longEnabled &&
      point.j < params.oversold
    ) {
      if (!longStop || point.j < longStop.j) {
        longStop = { j: point.j, price: kline.low };
      }

      long.set(point.time, longStop);
    } else {
      longStop = null;
    }

    if (
      params.shortEnabled &&
      point.j > params.overbought
    ) {
      if (!shortStop || point.j > shortStop.j) {
        shortStop = { j: point.j, price: kline.high };
      }

      short.set(point.time, shortStop);
    } else {
      shortStop = null;
    }
  }

  return { long, short };
}

function display(
  point: KdjPoint | null,
  params: KdjEntryParams,
  stop: StopInfo | null
): ConditionDisplayItem[] {
  const isOversold =
    point?.j !== null &&
    point?.j !== undefined &&
    params.longEnabled &&
    point.j < params.oversold;

  const isOverbought =
    point?.j !== null &&
    point?.j !== undefined &&
    params.shortEnabled &&
    point.j > params.overbought;

  return [
    {
      label: "状态",
      value: statusText(point, params),
      tone: isOversold ? "bull" : isOverbought ? "bear" : "neutral"
    },
    {
      label: "J / K / D",
      value: point
        ? `${point.j?.toFixed(2) ?? "--"} / ${
            point.k?.toFixed(2) ?? "--"
          } / ${point.d?.toFixed(2) ?? "--"}`
        : "--"
    },
    {
      label: "阈值",
      value: `J<${params.oversold} 做多 · J>${params.overbought} 做空`
    },
    {
      label: "J钝化止损",
      value: stop
        ? `${stop.price.toLocaleString("en-US", {
            maximumFractionDigits: 8
          })}（J=${stop.j.toFixed(2)}）`
        : "--",
      tone: stop ? "warn" : "neutral"
    }
  ];
}

interface EntryFlags {
  oversold: boolean;
  overbought: boolean;
}

function pointFrom(
  point: KdjPoint,
  params: KdjEntryParams,
  previousJ: number | null,
  previousPreviousJ: number | null,
  stop: StopInfo | null,
  entryFlags: EntryFlags
): ConditionPoint {
  const currentJ = point.j;

  let eventType: ConditionPoint["eventType"] = null;
  let eventDirection: SignalDirection | null = null;

  if (currentJ !== null) {
    const mode = params.triggerMode ?? "cross";

    if (mode === "reversal") {
      if (previousJ !== null) {
        const reversalLong =
          params.longEnabled &&
          previousJ < params.oversold &&
          previousPreviousJ !== null &&
          previousJ <= previousPreviousJ &&
          currentJ > previousJ;
        const reversalShort =
          params.shortEnabled &&
          previousJ > params.overbought &&
          previousPreviousJ !== null &&
          previousJ >= previousPreviousJ &&
          currentJ < previousJ;

        if (reversalLong) {
          eventType = "ENTRY_LONG";
          eventDirection = "BULL";
        } else if (reversalShort) {
          eventType = "ENTRY_SHORT";
          eventDirection = "BEAR";
        }
      }
    } else {
      const inOversold = currentJ < params.oversold;
      const inOverbought = currentJ > params.overbought;

      if (
        params.longEnabled &&
        inOversold &&
        !entryFlags.oversold
      ) {
        eventType = "ENTRY_LONG";
        eventDirection = "BULL";
      } else if (
        params.shortEnabled &&
        inOverbought &&
        !entryFlags.overbought
      ) {
        eventType = "ENTRY_SHORT";
        eventDirection = "BEAR";
      }
    }
  }

  const activeDirection = directionState(point, params);

  return {
    time: point.time,
    eventType,
    direction: eventDirection ?? activeDirection,
    active: activeDirection !== null,
    threshold:
      eventType === "ENTRY_LONG"
        ? params.oversold
        : eventType === "ENTRY_SHORT"
          ? params.overbought
          : null,
    payload: {
      period: params.period,
      kSmooth: params.kSmooth,
      dSmooth: params.dSmooth,
      oversold: params.oversold,
      overbought: params.overbought,
      previousJ,
      k: point.k,
      d: point.d,
      j: point.j,
      stopPrice: stop?.price ?? null,
      stopJ: stop?.j ?? null
    },
    display: display(point, params, stop)
  };
}

function latestConditionPoint(
  point: KdjPoint | null,
  params: KdjEntryParams,
  stop: StopInfo | null
): ConditionPoint | null {
  if (!point) {
    return null;
  }

  const activeDirection = directionState(point, params);

  return {
    time: point.time,
    eventType: null,
    direction: activeDirection,
    active: activeDirection !== null,
    threshold: null,
    payload: {
      period: params.period,
      kSmooth: params.kSmooth,
      dSmooth: params.dSmooth,
      oversold: params.oversold,
      overbought: params.overbought,
      k: point.k,
      d: point.d,
      j: point.j,
      stopPrice: stop?.price ?? null,
      stopJ: stop?.j ?? null
    },
    display: display(point, params, stop)
  };
}

function runKdjCondition(
  input: ConditionRunInput
): ConditionRunResult {
  const params = input.params as unknown as KdjEntryParams;
  const points = calculateKDJ(input.klines, params);
  const stopMaps = buildStopMaps(
    input.klines,
    points,
    params
  );
  const last = latestPoint(points);
  const lastStop = last
    ? stopMaps.long.get(last.time) ??
      stopMaps.short.get(last.time) ??
      null
    : null;
  const latest = latestConditionPoint(
    last,
    params,
    lastStop
  );

  if (input.warmup) {
    const secondLast =
      points.length >= 2
        ? points[points.length - 2]
        : null;

    return {
      state: {
        prevJ: last?.j ?? null,
        prevPrevJ: secondLast?.j ?? null,
        oversoldEntryFired: false,
        overboughtEntryFired: false,
        latest
      },
      points: new Map(),
      latest,
      statusText: statusText(last, params)
    };
  }

  const pointByTime = new Map<number, KdjPoint>();

  for (const point of points) {
    pointByTime.set(point.time, point);
  }

  let previousJ: number | null =
    typeof input.state.prevJ === "number"
      ? (input.state.prevJ as number)
      : null;
  let previousPreviousJ: number | null =
    typeof input.state.prevPrevJ === "number"
      ? (input.state.prevPrevJ as number)
      : null;

  if (previousJ === null) {
    const firstNew = input.newKlines[0];

    if (firstNew) {
      const index = points.findIndex(
        (point) => point.time === firstNew.closeTime
      );

      if (index > 0) {
        previousJ = points[index - 1]?.j ?? null;
        previousPreviousJ = points[index - 2]?.j ?? null;
      }
    }
  }

  const entryFlags: EntryFlags = {
    oversold:
      input.state.oversoldEntryFired === true,
    overbought:
      input.state.overboughtEntryFired === true
  };

  const resultPoints = new Map<number, ConditionPoint>();

  for (const kline of input.newKlines) {
    const point = pointByTime.get(kline.closeTime);

    if (!point || point.j === null) {
      continue;
    }

    const stop =
      stopMaps.long.get(point.time) ??
      stopMaps.short.get(point.time) ??
      null;

    const conditionPoint = pointFrom(
      point,
      params,
      previousJ,
      previousPreviousJ,
      stop,
      entryFlags
    );

    if (point.j < params.oversold) {
      if (conditionPoint.eventType === "ENTRY_LONG") {
        entryFlags.oversold = true;
      }
    } else {
      entryFlags.oversold = false;
    }

    if (point.j > params.overbought) {
      if (conditionPoint.eventType === "ENTRY_SHORT") {
        entryFlags.overbought = true;
      }
    } else {
      entryFlags.overbought = false;
    }

    resultPoints.set(kline.closeTime, conditionPoint);

    previousPreviousJ = previousJ;
    previousJ = point.j;
  }

  return {
    state: {
      prevJ: previousJ,
      prevPrevJ: previousPreviousJ,
      oversoldEntryFired: entryFlags.oversold,
      overboughtEntryFired: entryFlags.overbought,
      latest
    },
    points: resultPoints,
    latest,
    statusText: statusText(last, params)
  };
}

function summary(params: KdjEntryParams): string {
  const pieces: string[] = [];
  const mode =
    params.triggerMode === "reversal"
      ? "J拐头"
      : "进极值";

  if (params.longEnabled) {
    pieces.push(`J<${params.oversold} 做多`);
  }

  if (params.shortEnabled) {
    pieces.push(`J>${params.overbought} 做空`);
  }

  return `KDJ ${params.period}/${params.kSmooth}/${params.dSmooth} · ${mode} · ${
    pieces.length > 0 ? pieces.join(" / ") : "未选方向"
  }`;
}

export const kdjExtremeDefinition: ConditionDefinition = {
  kind: "KDJ_EXTREME",
  label: "KDJ 极值",
  description:
    "监控 J 值进入超卖/超买区，或从极值拐头；进入极值模式首次进入区域即判定一次。",
  roles: ["trigger", "filter"],
  defaultRole: "trigger",
  summaryTemplate:
    "KDJ {period}/{kSmooth}/{dSmooth} · J<{oversold} 做多 / J>{overbought} 做空",
  fields: [
    {
      key: "period",
      label: "KDJ 周期",
      type: "number",
      min: 2,
      defaultValue: DEFAULT_KDJ_PARAMS.period
    },
    {
      key: "kSmooth",
      label: "K 平滑",
      type: "number",
      min: 1,
      max: 20,
      defaultValue: DEFAULT_KDJ_PARAMS.kSmooth
    },
    {
      key: "dSmooth",
      label: "D 平滑",
      type: "number",
      min: 1,
      max: 20,
      defaultValue: DEFAULT_KDJ_PARAMS.dSmooth
    },
    {
      key: "oversold",
      label: "J 超卖阈值（做多）",
      type: "number",
      min: 0,
      max: 50,
      step: "any",
      defaultValue: DEFAULT_KDJ_PARAMS.oversold
    },
    {
      key: "overbought",
      label: "J 超买阈值（做空）",
      type: "number",
      min: 50,
      max: 100,
      step: "any",
      defaultValue: DEFAULT_KDJ_PARAMS.overbought
    },
    {
      key: "triggerMode",
      label: "触发方式",
      type: "select",
      defaultValue: "cross",
      options: [
        {
          value: "cross",
          label: "进入极值（首次进入即判定）"
        },
        {
          value: "reversal",
          label: "极值后拐头（J 回升/回落）"
        }
      ],
      help: "进入极值模式会在首次观察到 J 进入区域时判定一次；拐头模式等待 J 转向"
    },
    {
      key: "longEnabled",
      label: "监控做多",
      type: "boolean",
      defaultValue: true
    },
    {
      key: "shortEnabled",
      label: "监控做空",
      type: "boolean",
      defaultValue: true
    }
  ],
  normalizeParams(raw, klineLimit) {
    return { ...normalizeKdjParams(raw, klineLimit) };
  },
  summarize(params) {
    return summary(params as unknown as KdjEntryParams);
  },
  run: runKdjCondition
};
