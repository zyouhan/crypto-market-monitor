import type { ConditionDisplayItem } from "../db/types";
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

type ZeroDirection = "up" | "down" | "both";

interface DifZeroParams extends MacdParams {
  direction: ZeroDirection;
}

function readParams(raw: unknown): DifZeroParams {
  const input =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const params: DifZeroParams = {
    fast: Number(input.fast ?? DEFAULT_MACD_PARAMS.fast),
    slow: Number(input.slow ?? DEFAULT_MACD_PARAMS.slow),
    signal: Number(input.signal ?? DEFAULT_MACD_PARAMS.signal),
    direction:
      input.direction === "down" || input.direction === "both"
        ? input.direction
        : "up"
  };

  validateMacdParams(params);
  return params;
}

function buildDisplay(
  point: MacdPoint,
  params: DifZeroParams
): ConditionDisplayItem[] {
  return [
    {
      label: "DIF",
      value:
        point.dif === null
          ? "--"
          : point.dif.toLocaleString("en-US", {
              maximumFractionDigits: 8
            }),
      tone:
        point.dif === null
          ? "neutral"
          : point.dif > 0
            ? "bull"
            : point.dif < 0
              ? "bear"
              : "neutral"
    },
    {
      label: "零轴",
      value:
        point.dif === null
          ? "未知"
          : point.dif > 0
            ? "零轴上方"
            : point.dif < 0
              ? "零轴下方"
              : "零轴",
      tone:
        point.dif === null
          ? "neutral"
          : point.dif > 0
            ? "bull"
            : point.dif < 0
              ? "bear"
              : "neutral"
    },
    {
      label: "DEA",
      value:
        point.dea === null
          ? "--"
          : point.dea.toLocaleString("en-US", {
              maximumFractionDigits: 8
            })
    },
    {
      label: "MACD 柱",
      value:
        point.histogram === null
          ? "--"
          : point.histogram.toFixed(8),
      tone:
        point.histogram === null
          ? "neutral"
          : point.histogram > 0
            ? "bull"
            : point.histogram < 0
              ? "bear"
              : "neutral"
    },
    {
      label: "方向",
      value:
        params.direction === "up"
          ? "上穿"
          : params.direction === "down"
            ? "下穿"
            : "双向"
    }
  ];
}

function pointAt(
  macd: MacdPoint,
  previous: MacdPoint | null,
  params: DifZeroParams
): ConditionPoint {
  const upCross =
    macd.dif !== null &&
    previous?.dif !== null &&
    previous?.dif !== undefined &&
    previous.dif <= 0 &&
    macd.dif > 0;
  const downCross =
    macd.dif !== null &&
    previous?.dif !== null &&
    previous?.dif !== undefined &&
    previous.dif >= 0 &&
    macd.dif < 0;
  const directionAllowed =
    params.direction === "both" ||
    (params.direction === "up" && upCross) ||
    (params.direction === "down" && downCross);
  const eventType = directionAllowed
    ? upCross
      ? "DIF_ZERO_UP"
      : downCross
        ? "DIF_ZERO_DOWN"
        : null
    : null;
  const active =
    macd.dif !== null &&
    (params.direction === "both" ||
      (params.direction === "up" && macd.dif > 0) ||
      (params.direction === "down" && macd.dif < 0));
  const direction =
    eventType === "DIF_ZERO_UP"
      ? "BULL"
      : eventType === "DIF_ZERO_DOWN"
        ? "BEAR"
        : macd.dif !== null && macd.dif > 0
          ? "BULL"
          : macd.dif !== null && macd.dif < 0
            ? "BEAR"
            : null;

  return {
    time: macd.time,
    eventType,
    direction,
    active,
    threshold: null,
    payload: {
      close: macd.close,
      dif: macd.dif,
      dea: macd.dea,
      histogram: macd.histogram,
      direction: params.direction
    },
    display: buildDisplay(macd, params)
  };
}

function runDifZeroCondition(
  input: ConditionRunInput
): ConditionRunResult {
  const params = readParams(input.params);
  const macd = calculateMACD(input.klines, params);
  const points = new Map<number, ConditionPoint>();

  if (!input.warmup) {
    for (const kline of input.newKlines) {
      const index = macd.findIndex(
        (point) => point.time === kline.closeTime
      );

      if (index >= 0) {
        points.set(
          kline.closeTime,
          pointAt(
            macd[index],
            index > 0 ? macd[index - 1] : null,
            params
          )
        );
      }
    }
  }

  const lastIndex = macd.length - 1;
  const latest =
    lastIndex >= 0
      ? pointAt(
          macd[lastIndex],
          lastIndex > 0 ? macd[lastIndex - 1] : null,
          params
        )
      : null;

  return {
    state: {},
    points,
    latest,
    statusText: latest
      ? latest.eventType === "DIF_ZERO_UP"
        ? "DIF 上穿零轴"
        : latest.eventType === "DIF_ZERO_DOWN"
          ? "DIF 下穿零轴"
          : latest.active
            ? params.direction === "down"
              ? "DIF 零轴下方"
              : "DIF 零轴上方"
            : "等待 DIF 穿越零轴"
      : "MACD 数据不足"
  };
}

export const macdDifZeroDefinition: ConditionDefinition = {
  kind: "MACD_DIF_ZERO",
  label: "MACD DIF 零轴",
  description:
    "DIF 快线上穿或下穿零轴时触发；也可作为过滤条件判断 DIF 当前在零轴哪一侧。",
  roles: ["trigger", "filter"],
  defaultRole: "trigger",
  summaryTemplate: "MACD {fast}/{slow}/{signal} · DIF 零轴{direction}",
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
    },
    {
      key: "direction",
      label: "穿越方向",
      type: "select",
      defaultValue: "up",
      options: [
        { value: "up", label: "上穿零轴" },
        { value: "down", label: "下穿零轴" },
        { value: "both", label: "双向" }
      ]
    }
  ],
  normalizeParams(raw) {
    return { ...readParams(raw) };
  },
  summarize(params) {
    const direction =
      params.direction === "down"
        ? "下穿"
        : params.direction === "both"
          ? "双向"
          : "上穿";

    return `MACD ${params.fast}/${params.slow}/${params.signal} · DIF ${direction}零轴`;
  },
  run: runDifZeroCondition
};
