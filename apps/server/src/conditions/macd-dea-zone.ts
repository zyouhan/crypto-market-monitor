import type {
  ConditionDisplayItem,
  SignalDirection,
  SignalEventType
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

type Zone = "long" | "short" | null;

interface ZoneState {
  zone: Zone;
  exhausted: boolean;
}

interface ZoneEventInfo extends ZoneState {
  eventType: SignalEventType | null;
  direction: SignalDirection | null;
  dif: number;
  dea: number;
  difSlope: number;
  deaSlope: number;
}

function readParams(raw: unknown): MacdParams {
  const input =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const params: MacdParams = {
    fast: Number(input.fast ?? DEFAULT_MACD_PARAMS.fast),
    slow: Number(input.slow ?? DEFAULT_MACD_PARAMS.slow),
    signal: Number(input.signal ?? DEFAULT_MACD_PARAMS.signal)
  };

  validateMacdParams(params);
  return params;
}

function zoneLabel(zone: Zone, exhausted: boolean): string {
  if (zone === "long") {
    return exhausted ? "多头区间衰竭" : "多头区间";
  }

  if (zone === "short") {
    return exhausted ? "空头区间衰竭" : "空头区间";
  }

  return "等待 DEA 拐头";
}

function slopeText(value: number): string {
  if (value > 0) {
    return "上移";
  }

  if (value < 0) {
    return "下移";
  }

  return "走平";
}

function slopeTone(value: number): "bull" | "bear" | "neutral" {
  return value > 0 ? "bull" : value < 0 ? "bear" : "neutral";
}

function buildDisplay(info: ZoneEventInfo): ConditionDisplayItem[] {
  const display: ConditionDisplayItem[] = [
    {
      label: "区间",
      value: zoneLabel(info.zone, info.exhausted),
      tone:
        info.zone === "long"
          ? "bull"
          : info.zone === "short"
            ? "bear"
            : "neutral"
    },
    {
      label: "DIF",
      value: `${info.dif.toFixed(8)} · ${slopeText(
        info.difSlope
      )}`,
      tone: slopeTone(info.difSlope)
    },
    {
      label: "DEA",
      value: `${info.dea.toFixed(8)} · ${slopeText(
        info.deaSlope
      )}`,
      tone: slopeTone(info.deaSlope)
    },
    {
      label: "快线",
      value: slopeText(info.difSlope),
      tone: slopeTone(info.difSlope)
    },
    {
      label: "慢线",
      value: slopeText(info.deaSlope),
      tone: slopeTone(info.deaSlope)
    }
  ];

  if (info.exhausted) {
    display.push({
      label: "状态",
      value: "快线已拐头，区间衰竭",
      tone: "warn"
    });
  }

  return display;
}

function buildPoint(
  macd: MacdPoint,
  info: ZoneEventInfo
): ConditionPoint {
  return {
    time: macd.time,
    eventType: info.eventType,
    direction: info.direction,
    active: info.zone !== null,
    threshold: macd.dea,
    payload: {
      zone: info.zone,
      exhausted: info.exhausted,
      close: macd.close,
      dif: macd.dif,
      dea: macd.dea,
      histogram: macd.histogram,
      difSlope: info.difSlope,
      deaSlope: info.deaSlope
    },
    display: buildDisplay(info)
  };
}

export function scanZoneEvents(
  macd: MacdPoint[]
): Map<number, ZoneEventInfo> {
  const events = new Map<number, ZoneEventInfo>();
  let zone: Zone = null;
  let exhausted = false;
  let previousDifSlope: number | null = null;
  let previousDeaSlope: number | null = null;

  for (let index = 1; index < macd.length; index += 1) {
    const previous = macd[index - 1];
    const current = macd[index];

    if (
      current.dif === null ||
      current.dea === null ||
      previous.dif === null ||
      previous.dea === null
    ) {
      continue;
    }

    const difSlope = current.dif - previous.dif;
    const deaSlope = current.dea - previous.dea;
    const deaUpTurn =
      previousDeaSlope !== null &&
      previousDeaSlope <= 0 &&
      deaSlope > 0;
    const deaDownTurn =
      previousDeaSlope !== null &&
      previousDeaSlope >= 0 &&
      deaSlope < 0;
    const difUpTurn =
      previousDifSlope !== null &&
      previousDifSlope <= 0 &&
      difSlope > 0;
    const difDownTurn =
      previousDifSlope !== null &&
      previousDifSlope >= 0 &&
      difSlope < 0;

    let eventType: SignalEventType | null = null;
    let direction: SignalDirection | null = null;

    if (deaUpTurn && difSlope > 0) {
      if (zone !== "long") {
        zone = "long";
        exhausted = false;
        eventType = "LONG_ZONE_START";
        direction = "BULL";
      }
    } else if (deaDownTurn && difSlope < 0) {
      if (zone !== "short") {
        zone = "short";
        exhausted = false;
        eventType = "SHORT_ZONE_START";
        direction = "BEAR";
      }
    } else if (
      zone === "long" &&
      !exhausted &&
      difDownTurn
    ) {
      exhausted = true;
      eventType = "LONG_ZONE_EXHAUST";
      direction = "BULL";
    } else if (
      zone === "short" &&
      !exhausted &&
      difUpTurn
    ) {
      exhausted = true;
      eventType = "SHORT_ZONE_EXHAUST";
      direction = "BEAR";
    }

    events.set(current.time, {
      zone,
      exhausted,
      eventType,
      direction,
      dif: current.dif,
      dea: current.dea,
      difSlope,
      deaSlope
    });

    previousDifSlope = difSlope;
    previousDeaSlope = deaSlope;
  }

  return events;
}

function fallbackInfo(macd: MacdPoint): ZoneEventInfo | null {
  if (
    macd.dif === null ||
    macd.dea === null
  ) {
    return null;
  }

  return {
    zone: null,
    exhausted: false,
    eventType: null,
    direction: null,
    dif: macd.dif,
    dea: macd.dea,
    difSlope: 0,
    deaSlope: 0
  };
}

function runZoneCondition(
  input: ConditionRunInput
): ConditionRunResult {
  const params = readParams(input.params);
  const macd = calculateMACD(input.klines, params);
  const events = scanZoneEvents(macd);
  const points = new Map<number, ConditionPoint>();
  const latestMacd = macd[macd.length - 1];
  const latestInfo = latestMacd
    ? events.get(latestMacd.time) ?? fallbackInfo(latestMacd)
    : null;
  const latest =
    latestMacd && latestInfo
      ? buildPoint(latestMacd, latestInfo)
      : null;

  if (!input.warmup) {
    for (const kline of input.newKlines) {
      const info = events.get(kline.closeTime);
      const macdPoint = macd.find(
        (item) => item.time === kline.closeTime
      );

      if (info && macdPoint) {
        points.set(
          kline.closeTime,
          buildPoint(macdPoint, info)
        );
      }
    }
  }

  return {
    state: latestInfo
      ? {
          zone: latestInfo.zone,
          exhausted: latestInfo.exhausted
        }
      : { zone: null, exhausted: false },
    points,
    latest,
    statusText: latest
      ? zoneLabel(latestInfo!.zone, latestInfo!.exhausted)
      : "MACD 数据不足"
  };
}

export const macdDeaZoneDefinition: ConditionDefinition = {
  kind: "MACD_DEA_ZONE",
  label: "MACD DEA 区间",
  description:
    "DEA 慢线拐头确认多空区间；DIF 快线拐头提示区间衰竭，不再按固定 K 线根数判断。",
  roles: ["trigger"],
  defaultRole: "trigger",
  summaryTemplate: "MACD {fast}/{slow}/{signal} · DEA 区间",
  fields: [
    {
      key: "fast",
      label: "快线周期",
      type: "number",
      min: 2,
      defaultValue: DEFAULT_MACD_PARAMS.fast
    },
    {
      key: "slow",
      label: "慢线周期",
      type: "number",
      min: 3,
      defaultValue: DEFAULT_MACD_PARAMS.slow
    },
    {
      key: "signal",
      label: "DEA 周期",
      type: "number",
      min: 2,
      defaultValue: DEFAULT_MACD_PARAMS.signal
    }
  ],
  normalizeParams(raw) {
    return { ...readParams(raw) };
  },
  summarize(params) {
    return `MACD ${params.fast}/${params.slow}/${params.signal} · DEA 区间`;
  },
  run: runZoneCondition
};
