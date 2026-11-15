import type { ConditionDisplayItem } from "../db/types";
import {
  CANDLE_PATTERNS,
  CANDLE_PATTERN_KEYS,
  detectCandlePatterns,
  type CandlePatternDefinition
} from "../indicators/candle-patterns";
import type { Kline } from "../indicators/types";

import type {
  ConditionDefinition,
  ConditionPoint,
  ConditionRunInput,
  ConditionRunResult
} from "./types";

interface CandlePatternParams {
  patterns: string[];
}

function readParams(raw: unknown): CandlePatternParams {
  const input =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const selected = new Set<string>();

  if (Array.isArray(input.patterns)) {
    for (const value of input.patterns) {
      if (
        typeof value === "string" &&
        CANDLE_PATTERN_KEYS.includes(value)
      ) {
        selected.add(value);
      }
    }
  }

  if (selected.size === 0) {
    throw new Error("至少选择一种 K 线形态");
  }

  return { patterns: Array.from(selected) };
}

function selectedDefinitions(
  params: CandlePatternParams
): CandlePatternDefinition[] {
  return CANDLE_PATTERNS.filter((pattern) =>
    params.patterns.includes(pattern.key)
  );
}

function display(
  hits: CandlePatternDefinition[],
  primary: CandlePatternDefinition | null
): ConditionDisplayItem[] {
  return [
    {
      label: "形态",
      value: primary
        ? `${primary.side === "top" ? "见顶" : "见底"} · ${primary.label}`
        : "未命中",
      tone:
        primary?.side === "top"
          ? "bear"
          : primary?.side === "bottom"
            ? "bull"
            : "neutral"
    },
    {
      label: "命中数量",
      value: String(hits.length)
    },
    {
      label: "形态列表",
      value:
        hits.length > 0
          ? hits.map((pattern) => pattern.label).join(" / ")
          : "--"
    }
  ];
}

function buildPoint(
  kline: Kline,
  hits: CandlePatternDefinition[]
): ConditionPoint {
  const sorted = [...hits].sort(
    (left, right) => right.priority - left.priority
  );
  const primary = sorted[0] ?? null;
  const eventType = primary
    ? primary.side === "top"
      ? "CANDLE_TOP"
      : "CANDLE_BOTTOM"
    : null;

  return {
    time: kline.closeTime,
    eventType,
    direction:
      primary?.side === "top"
        ? "BEAR"
        : primary?.side === "bottom"
          ? "BULL"
          : null,
    active: hits.length > 0,
    threshold: null,
    payload: {
      close: kline.close,
      side: primary?.side ?? null,
      pattern: primary?.key ?? null,
      pattern_label: primary?.label ?? null,
      patterns: sorted.map((pattern) => ({
        key: pattern.key,
        label: pattern.label,
        side: pattern.side
      }))
    },
    display: display(sorted, primary)
  };
}

function runCandlePattern(
  input: ConditionRunInput
): ConditionRunResult {
  const params = readParams(input.params);
  const selected = selectedDefinitions(params);
  const points = new Map<number, ConditionPoint>();

  if (!input.warmup) {
    for (const kline of input.newKlines) {
      const index = input.klines.findIndex(
        (item) => item.closeTime === kline.closeTime
      );

      if (index < 1) {
        continue;
      }

      const hits = detectCandlePatterns(
        input.klines,
        index
      ).filter((pattern) =>
        selected.some((item) => item.key === pattern.key)
      );

      if (hits.length > 0) {
        points.set(
          kline.closeTime,
          buildPoint(kline, hits)
        );
      }
    }
  }

  const lastIndex = input.klines.length - 1;
  const latestHits =
    lastIndex >= 0
      ? detectCandlePatterns(input.klines, lastIndex).filter(
          (pattern) =>
            selected.some((item) => item.key === pattern.key)
        )
      : [];
  const latest =
    lastIndex >= 0
      ? buildPoint(input.klines[lastIndex], latestHits)
      : null;

  return {
    state: {},
    points,
    latest,
    statusText: latest
      ? latest.display[0]?.value ?? "未命中"
      : "K线数据不足"
  };
}

export const candlePatternDefinition: ConditionDefinition = {
  kind: "CANDLE_PATTERN",
  label: "K线见顶/见底形态",
  description:
    "识别两根或三根 K 线组成的常见反转形态；可自由多选需要监控的形态。",
  roles: ["trigger"],
  defaultRole: "trigger",
  summaryTemplate: "K线形态 · {patterns}",
  fields: [
    {
      key: "patterns",
      label: "监控形态",
      type: "multiselect",
      defaultValue: [...CANDLE_PATTERN_KEYS],
      options: CANDLE_PATTERNS.map((pattern) => ({
        value: pattern.key,
        label: `${
          pattern.group === "two" ? "两根" : "三根"
        } · ${pattern.label}`
      }))
    }
  ],
  normalizeParams(raw) {
    return { ...readParams(raw) };
  },
  summarize(params) {
    const selected = selectedDefinitions(
      readParams(params)
    ).map((pattern) => pattern.label);

    return `K线形态 · ${selected.join(" / ")}`;
  },
  run: runCandlePattern
};
