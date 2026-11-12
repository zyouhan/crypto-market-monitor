import type { ConditionDisplayItem } from "../db/types";
import { calculateKDJ } from "../indicators/kdj";
import type { KdjPoint } from "../indicators/types";

import type {
  ConditionDefinition,
  ConditionPoint,
  ConditionRunInput,
  ConditionRunResult
} from "./types";

type CrossDirection = "up" | "down" | "both";

interface JkParams {
  period: number;
  kSmooth: number;
  dSmooth: number;
  direction: CrossDirection;
}

function readParams(raw: unknown): JkParams {
  const input =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const params: JkParams = {
    period: Number(input.period ?? 9),
    kSmooth: Number(input.kSmooth ?? 3),
    dSmooth: Number(input.dSmooth ?? 3),
    direction:
      input.direction === "down" || input.direction === "both"
        ? input.direction
        : "up"
  };

  if (
    !Number.isInteger(params.period) ||
    params.period < 1 ||
    !Number.isInteger(params.kSmooth) ||
    params.kSmooth < 1 ||
    !Number.isInteger(params.dSmooth) ||
    params.dSmooth < 1
  ) {
    throw new Error("KDJ 参数必须为正整数");
  }

  return params;
}

function buildDisplay(
  point: KdjPoint,
  params: JkParams
): ConditionDisplayItem[] {
  const relation =
    point.j === null || point.k === null
      ? "未知"
      : point.j > point.k
        ? "J 在 K 上方"
        : point.j < point.k
          ? "J 在 K 下方"
          : "J = K";

  return [
    {
      label: "J / K / D",
      value: `${point.j?.toFixed(2) ?? "--"} / ${
        point.k?.toFixed(2) ?? "--"
      } / ${point.d?.toFixed(2) ?? "--"}`
    },
    {
      label: "J / K",
      value: relation,
      tone:
        point.j === null || point.k === null
          ? "neutral"
          : point.j > point.k
            ? "bull"
            : point.j < point.k
              ? "bear"
              : "neutral"
    },
    {
      label: "交叉方向",
      value:
        params.direction === "up"
          ? "J 上穿 K"
          : params.direction === "down"
            ? "J 下穿 K"
            : "双向"
    }
  ];
}

function pointAt(
  current: KdjPoint,
  previous: KdjPoint | null,
  params: JkParams
): ConditionPoint {
  const hasValues =
    current.j !== null &&
    current.k !== null &&
    previous?.j !== null &&
    previous?.j !== undefined &&
    previous?.k !== null &&
    previous?.k !== undefined;
  const upCross =
    hasValues &&
    (previous as KdjPoint).j! <= (previous as KdjPoint).k! &&
    current.j! > current.k!;
  const downCross =
    hasValues &&
    (previous as KdjPoint).j! >= (previous as KdjPoint).k! &&
    current.j! < current.k!;
  const allowed =
    params.direction === "both" ||
    (params.direction === "up" && upCross) ||
    (params.direction === "down" && downCross);
  const eventType = allowed
    ? upCross
      ? "KDJ_J_UP_K"
      : downCross
        ? "KDJ_J_DOWN_K"
        : null
    : null;
  const active =
    current.j !== null &&
    current.k !== null &&
    (params.direction === "both"
      ? current.j !== current.k
      : params.direction === "up"
        ? current.j > current.k
        : current.j < current.k);
  const direction =
    eventType === "KDJ_J_UP_K"
      ? "BULL"
      : eventType === "KDJ_J_DOWN_K"
        ? "BEAR"
        : current.j !== null &&
            current.k !== null &&
            current.j > current.k
          ? "BULL"
          : current.j !== null &&
              current.k !== null &&
              current.j < current.k
            ? "BEAR"
            : null;

  return {
    time: current.time,
    eventType,
    direction,
    active,
    threshold: null,
    payload: {
      close: current.close,
      j: current.j,
      k: current.k,
      d: current.d,
      direction: params.direction
    },
    display: buildDisplay(current, params)
  };
}

function runJkCondition(
  input: ConditionRunInput
): ConditionRunResult {
  const params = readParams(input.params);
  const kdj = calculateKDJ(input.klines, {
    period: params.period,
    kSmooth: params.kSmooth,
    dSmooth: params.dSmooth
  });
  const points = new Map<number, ConditionPoint>();

  if (!input.warmup) {
    for (const kline of input.newKlines) {
      const index = kdj.findIndex(
        (point) => point.time === kline.closeTime
      );

      if (index >= 0) {
        points.set(
          kline.closeTime,
          pointAt(
            kdj[index],
            index > 0 ? kdj[index - 1] : null,
            params
          )
        );
      }
    }
  }

  const lastIndex = kdj.length - 1;
  const latest =
    lastIndex >= 0
      ? pointAt(
          kdj[lastIndex],
          lastIndex > 0 ? kdj[lastIndex - 1] : null,
          params
        )
      : null;

  return {
    state: {},
    points,
    latest,
    statusText: latest
      ? latest.eventType === "KDJ_J_UP_K"
        ? "J 上穿 K，动能转强"
        : latest.eventType === "KDJ_J_DOWN_K"
          ? "J 下穿 K，上涨动能耗尽"
          : latest.active
            ? latest.direction === "BULL"
              ? "J 在 K 上方"
              : "J 在 K 下方"
            : "等待 J/K 交叉"
      : "KDJ 数据不足"
  };
}

export const kdjJkCrossDefinition: ConditionDefinition = {
  kind: "KDJ_JK_CROSS",
  label: "KDJ J/K 交叉",
  description:
    "J 值上穿 K 值表示短期动能转强；J 下穿 K 值表示上涨动能大概率耗尽，提示可能下跌。",
  roles: ["trigger", "filter"],
  defaultRole: "trigger",
  summaryTemplate: "KDJ {period}/{kSmooth}/{dSmooth} · J {direction} K",
  fields: [
    {
      key: "period",
      label: "KDJ 周期",
      type: "number",
      min: 1,
      defaultValue: 9
    },
    {
      key: "kSmooth",
      label: "K 平滑",
      type: "number",
      min: 1,
      defaultValue: 3
    },
    {
      key: "dSmooth",
      label: "D 平滑",
      type: "number",
      min: 1,
      defaultValue: 3
    },
    {
      key: "direction",
      label: "交叉方向",
      type: "select",
      defaultValue: "both",
      options: [
        { value: "up", label: "J 上穿 K" },
        { value: "down", label: "J 下穿 K" },
        { value: "both", label: "双向" }
      ]
    }
  ],
  normalizeParams(raw) {
    return { ...readParams(raw) };
  },
  summarize(params) {
    const direction =
      params.direction === "up"
        ? "上穿"
        : params.direction === "down"
          ? "下穿"
          : "双向";

    return `KDJ ${params.period}/${params.kSmooth}/${params.dSmooth} · J ${direction} K`;
  },
  run: runJkCondition
};
