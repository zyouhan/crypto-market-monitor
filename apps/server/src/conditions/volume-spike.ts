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

interface VolumeParams {
  lookback: number;
  multiplier: number;
}

function readParams(raw: unknown): VolumeParams {
  const input =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const lookback = Number(input.lookback ?? 5);
  const multiplier = Number(input.multiplier ?? 3);

  if (!Number.isInteger(lookback) || lookback < 1 || lookback > 100) {
    throw new Error("成交量均量周期必须在 1 到 100 之间");
  }

  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    throw new Error("成交量倍数必须大于 0");
  }

  return { lookback, multiplier };
}

function averageVolume(
  klines: Kline[],
  index: number,
  lookback: number
): number | null {
  if (index < lookback) {
    return null;
  }

  let sum = 0;

  for (let i = index - lookback; i < index; i++) {
    if (!Number.isFinite(klines[i].volume)) {
      return null;
    }

    sum += klines[i].volume;
  }

  return sum / lookback;
}

function directionOf(kline: Kline): SignalDirection {
  return kline.close >= kline.open ? "BULL" : "BEAR";
}

function display(
  kline: Kline,
  average: number | null,
  threshold: number | null,
  spike: boolean
): ConditionDisplayItem[] {
  return [
    {
      label: "状态",
      value: spike
        ? `放量 ${(kline.volume / (average || 1)).toFixed(2)} 倍`
        : "量能正常",
      tone: spike ? "warn" : "neutral"
    },
    {
      label: "当前成交量",
      value: kline.volume.toLocaleString("en-US", {
        maximumFractionDigits: 4
      })
    },
    {
      label: "均量 / 阈值",
      value:
        average === null || threshold === null
          ? "--"
          : `${average.toLocaleString("en-US", {
              maximumFractionDigits: 4
            })} / ${threshold.toLocaleString("en-US", {
              maximumFractionDigits: 4
            })}`
    }
  ];
}

function buildPoint(
  klines: Kline[],
  index: number,
  params: VolumeParams
): ConditionPoint | null {
  const kline = klines[index];

  if (!kline) {
    return null;
  }

  const average = averageVolume(klines, index, params.lookback);
  const threshold =
    average === null ? null : average * params.multiplier;
  const spike =
    average !== null &&
    threshold !== null &&
    kline.volume > threshold;

  return {
    time: kline.closeTime,
    eventType: spike ? "VOLUME_SPIKE" : null,
    direction: spike ? directionOf(kline) : null,
    active: spike,
    threshold,
    payload: {
      lookback: params.lookback,
      multiplier: params.multiplier,
      volume: kline.volume,
      average,
      threshold
    },
    display: display(kline, average, threshold, spike)
  };
}

function runVolume(
  input: ConditionRunInput
): ConditionRunResult {
  const params = readParams(input.params);
  const lastIndex = input.klines.length - 1;
  const latest =
    lastIndex >= 0
      ? buildPoint(input.klines, lastIndex, params)
      : null;

  if (input.warmup) {
    return {
      state: {},
      points: new Map(),
      latest,
      statusText: latest?.display[0]?.value ?? "等待数据"
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
    statusText: latest?.display[0]?.value ?? "等待数据"
  };
}

export const volumeSpikeDefinition: ConditionDefinition = {
  kind: "VOLUME_SPIKE",
  label: "成交量放量",
  description:
    "当前 K 线成交量超过前 N 根均量的 X 倍时触发；方向按阳线/阴线判断。",
  roles: ["trigger", "filter"],
  defaultRole: "trigger",
  summaryTemplate: "量能 > 前 {lookback} 根均量 × {multiplier}",
  fields: [
    {
      key: "lookback",
      label: "均量根数 N",
      type: "number",
      min: 1,
      max: 100,
      defaultValue: 5
    },
    {
      key: "multiplier",
      label: "倍数 X",
      type: "number",
      min: 0.1,
      step: "any",
      defaultValue: 3
    }
  ],
  normalizeParams(raw) {
    return { ...readParams(raw) };
  },
  summarize(params) {
    return `量能 > 前 ${params.lookback} 根均量 × ${params.multiplier}`;
  },
  run: runVolume
};
