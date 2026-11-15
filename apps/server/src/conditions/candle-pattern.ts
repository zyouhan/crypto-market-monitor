import type { ConditionDisplayItem } from "../db/types";
import {
  averageVolume,
  calculateATR
} from "../indicators/atr";
import {
  CANDLE_PATTERNS,
  CANDLE_PATTERN_KEYS,
  candleMetrics,
  detectCandlePatterns,
  type CandlePatternDefinition,
  type CandlePatternSide
} from "../indicators/candle-patterns";
import { calculateEMA } from "../indicators/ema";
import type { Kline } from "../indicators/types";

import type {
  ConditionDefinition,
  ConditionPoint,
  ConditionRunInput,
  ConditionRunResult
} from "./types";

interface CandlePatternParams {
  patterns: string[];
  minRangeAtr: number;
  minBodyAtr: number;
  minVolumeRatio: number;
  cooldownBars: number;
  trendFilter: boolean;
}

const DEFAULT_PARAMS: Omit<CandlePatternParams, "patterns"> = {
  minRangeAtr: 0.8,
  minBodyAtr: 0.25,
  minVolumeRatio: 0.9,
  cooldownBars: 5,
  trendFilter: true
};

function numberParam(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  label: string
): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = typeof value === "number" ? value : Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed < min ||
    parsed > max
  ) {
    throw new Error(`${label}必须在 ${min} 到 ${max} 之间`);
  }

  return parsed;
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

  const cooldownBars = numberParam(
    input.cooldownBars,
    DEFAULT_PARAMS.cooldownBars,
    0,
    100,
    "冷却 K 线数"
  );

  if (!Number.isInteger(cooldownBars)) {
    throw new Error("冷却 K 线数必须是整数");
  }

  return {
    patterns: Array.from(selected),
    minRangeAtr: numberParam(
      input.minRangeAtr,
      DEFAULT_PARAMS.minRangeAtr,
      0,
      10,
      "最小振幅"
    ),
    minBodyAtr: numberParam(
      input.minBodyAtr,
      DEFAULT_PARAMS.minBodyAtr,
      0,
      10,
      "最小实体"
    ),
    minVolumeRatio: numberParam(
      input.minVolumeRatio,
      DEFAULT_PARAMS.minVolumeRatio,
      0,
      10,
      "最小量比"
    ),
    cooldownBars,
    trendFilter:
      typeof input.trendFilter === "boolean"
        ? input.trendFilter
        : DEFAULT_PARAMS.trendFilter
  };
}

function selectedDefinitions(
  params: CandlePatternParams
): CandlePatternDefinition[] {
  return CANDLE_PATTERNS.filter((pattern) =>
    params.patterns.includes(pattern.key)
  );
}

interface QualityMetrics {
  atr: number | null;
  rangeAtr: number;
  bodyAtr: number;
  volumeRatio: number | null;
  trendOk: boolean;
}

function qualityMetrics(
  klines: Kline[],
  index: number,
  side: CandlePatternSide,
  params: CandlePatternParams,
  atrValues: Array<number | null>,
  emaValues: Array<number | null>
): QualityMetrics | null {
  const kline = klines[index];
  const atr = atrValues[index] ?? null;

  if (!kline || atr === null || atr <= 0) {
    return null;
  }

  const metrics = candleMetrics(kline);
  const rangeAtr = metrics.range / atr;
  const bodyAtr = metrics.body / atr;

  if (rangeAtr < params.minRangeAtr) {
    return null;
  }

  if (bodyAtr < params.minBodyAtr) {
    return null;
  }

  const avgVolume = averageVolume(klines, index, 20);

  if (avgVolume === null || avgVolume <= 0) {
    return null;
  }

  const volumeRatio = (kline.volume ?? 0) / avgVolume;

  if (volumeRatio < params.minVolumeRatio) {
    return null;
  }

  const previousIndex = index - 1;
  const previous = klines[previousIndex];
  const previousEma = emaValues[previousIndex] ?? null;
  const trendOk =
    !params.trendFilter ||
    (previous !== undefined &&
      previousEma !== null &&
      (side === "bottom"
        ? previous.close < previousEma
        : previous.close > previousEma));

  if (!trendOk) {
    return null;
  }

  return {
    atr,
    rangeAtr,
    bodyAtr,
    volumeRatio,
    trendOk
  };
}

function rawHitsAt(
  klines: Kline[],
  index: number,
  params: CandlePatternParams
): CandlePatternDefinition[] {
  if (index < 1) {
    return [];
  }

  return detectCandlePatterns(klines, index).filter((pattern) =>
    params.patterns.includes(pattern.key)
  );
}

function hasRecentSideSignal(
  klines: Kline[],
  index: number,
  side: CandlePatternSide,
  params: CandlePatternParams,
  atrValues: Array<number | null>,
  emaValues: Array<number | null>
): boolean {
  if (params.cooldownBars <= 0) {
    return false;
  }

  const start = Math.max(1, index - params.cooldownBars);

  for (let i = start; i < index; i++) {
    const hits = rawHitsAt(klines, i, params).some(
      (pattern) =>
        pattern.side === side &&
        qualityMetrics(
          klines,
          i,
          pattern.side,
          params,
          atrValues,
          emaValues
        ) !== null
    );

    if (hits) {
      return true;
    }
  }

  return false;
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
  hits: CandlePatternDefinition[],
  quality: QualityMetrics | null
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
      })),
      atr: quality?.atr ?? null,
      range_atr: quality?.rangeAtr ?? null,
      body_atr: quality?.bodyAtr ?? null,
      volume_ratio: quality?.volumeRatio ?? null,
      trend_ok: quality?.trendOk ?? null
    },
    display: [
      ...display(sorted, primary),
      {
        label: "质量",
        value: quality
          ? `振幅 ${quality.rangeAtr.toFixed(2)} ATR · 实体 ${quality.bodyAtr.toFixed(
              2
            )} ATR · 量比 ${quality.volumeRatio?.toFixed(2) ?? "--"}`
          : "--"
      }
    ]
  };
}

function runCandlePattern(
  input: ConditionRunInput
): ConditionRunResult {
  const params = readParams(input.params);
  const atrValues = calculateATR(input.klines, 14);
  const emaValues = calculateEMA(
    input.klines.map((kline) => kline.close),
    20
  );
  const points = new Map<number, ConditionPoint>();

  function validHits(
    klines: Kline[],
    index: number
  ): CandlePatternDefinition[] {
    return rawHitsAt(klines, index, params).filter(
      (pattern) =>
        qualityMetrics(
          klines,
          index,
          pattern.side,
          params,
          atrValues,
          emaValues
        ) !== null
    );
  }

  if (!input.warmup) {
    for (const kline of input.newKlines) {
      const index = input.klines.findIndex(
        (item) => item.closeTime === kline.closeTime
      );

      if (index < 1) {
        continue;
      }

      const hits = validHits(input.klines, index);

      if (hits.length === 0) {
        continue;
      }

      const primary = [...hits].sort(
        (left, right) => right.priority - left.priority
      )[0];

      if (
        hasRecentSideSignal(
          input.klines,
          index,
          primary.side,
          params,
          atrValues,
          emaValues
        )
      ) {
        continue;
      }

      const quality = qualityMetrics(
        input.klines,
        index,
        primary.side,
        params,
        atrValues,
        emaValues
      );

      points.set(
        kline.closeTime,
        buildPoint(kline, hits, quality)
      );
    }
  }

  const lastIndex = input.klines.length - 1;
  const latestHits =
    lastIndex >= 0
      ? validHits(input.klines, lastIndex)
      : [];
  const latestQuality =
    lastIndex >= 0 && latestHits.length > 0
      ? qualityMetrics(
          input.klines,
          lastIndex,
          latestHits[0].side,
          params,
          atrValues,
          emaValues
        )
      : null;
  const latest =
    lastIndex >= 0
      ? buildPoint(
          input.klines[lastIndex],
          latestHits,
          latestQuality
        )
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
    },
    {
      key: "minRangeAtr",
      label: "最小振幅（ATR 倍数）",
      type: "number",
      min: 0,
      max: 10,
      step: 0.1,
      defaultValue: DEFAULT_PARAMS.minRangeAtr,
      help: "过滤小短 K；0 表示关闭"
    },
    {
      key: "minBodyAtr",
      label: "最小实体（ATR 倍数）",
      type: "number",
      min: 0,
      max: 10,
      step: 0.05,
      defaultValue: DEFAULT_PARAMS.minBodyAtr,
      help: "过滤几乎无实体的 K 线；0 表示关闭"
    },
    {
      key: "minVolumeRatio",
      label: "最小量比",
      type: "number",
      min: 0,
      max: 10,
      step: 0.1,
      defaultValue: DEFAULT_PARAMS.minVolumeRatio,
      help: "当前成交量 / 20 根均量；0 表示关闭"
    },
    {
      key: "cooldownBars",
      label: "同方向冷却 K 线数",
      type: "number",
      min: 0,
      max: 100,
      step: 1,
      defaultValue: DEFAULT_PARAMS.cooldownBars,
      help: "避免连续刷屏；0 表示关闭"
    },
    {
      key: "trendFilter",
      label: "趋势背景过滤",
      type: "boolean",
      defaultValue: DEFAULT_PARAMS.trendFilter,
      help: "见底需在 EMA20 下方，见顶需在上方"
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
