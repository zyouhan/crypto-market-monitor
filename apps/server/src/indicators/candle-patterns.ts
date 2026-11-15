import type { Kline } from "./types";

export type CandlePatternSide = "top" | "bottom";

export interface CandlePatternDefinition {
  key: string;
  label: string;
  group: "two" | "three";
  side: CandlePatternSide;
  priority: number;
}

export const CANDLE_PATTERNS: CandlePatternDefinition[] = [
  {
    key: "bullish_engulfing",
    label: "看涨吞没",
    group: "two",
    side: "bottom",
    priority: 50
  },
  {
    key: "bearish_engulfing",
    label: "看跌吞没",
    group: "two",
    side: "top",
    priority: 50
  },
  {
    key: "piercing",
    label: "刺透形态",
    group: "two",
    side: "bottom",
    priority: 40
  },
  {
    key: "dark_cloud",
    label: "乌云盖顶",
    group: "two",
    side: "top",
    priority: 40
  },
  {
    key: "bullish_harami",
    label: "看涨孕线",
    group: "two",
    side: "bottom",
    priority: 30
  },
  {
    key: "bearish_harami",
    label: "看跌孕线",
    group: "two",
    side: "top",
    priority: 30
  },
  {
    key: "tweezer_bottom",
    label: "镊子底",
    group: "two",
    side: "bottom",
    priority: 20
  },
  {
    key: "tweezer_top",
    label: "镊子顶",
    group: "two",
    side: "top",
    priority: 20
  },
  {
    key: "morning_star",
    label: "早晨之星",
    group: "three",
    side: "bottom",
    priority: 100
  },
  {
    key: "evening_star",
    label: "黄昏之星",
    group: "three",
    side: "top",
    priority: 100
  },
  {
    key: "three_white_soldiers",
    label: "红三兵",
    group: "three",
    side: "bottom",
    priority: 90
  },
  {
    key: "three_black_crows",
    label: "三只乌鸦",
    group: "three",
    side: "top",
    priority: 90
  }
];

export const CANDLE_PATTERN_KEYS = CANDLE_PATTERNS.map(
  (pattern) => pattern.key
);

export interface CandleMetrics {
  body: number;
  range: number;
  bodyRatio: number;
  upper: number;
  lower: number;
  bullish: boolean;
}

export function candleMetrics(kline: Kline): CandleMetrics {
  const body = Math.abs(kline.close - kline.open);
  const range = Math.max(kline.high - kline.low, 0);
  const upper = kline.high - Math.max(kline.open, kline.close);
  const lower = Math.min(kline.open, kline.close) - kline.low;

  return {
    body,
    range,
    bodyRatio: range > 0 ? body / range : 0,
    upper,
    lower,
    bullish: kline.close > kline.open
  };
}

function midpoint(kline: Kline): number {
  return (kline.open + kline.close) / 2;
}

function insideBody(current: Kline, previous: Kline): boolean {
  return (
    Math.max(current.open, current.close) <=
      Math.max(previous.open, previous.close) &&
    Math.min(current.open, current.close) >=
      Math.min(previous.open, previous.close)
  );
}

export function detectCandlePatterns(
  klines: Kline[],
  index: number
): CandlePatternDefinition[] {
  if (index < 1) {
    return [];
  }

  const current = klines[index];
  const previous = klines[index - 1];
  const before = index >= 2 ? klines[index - 2] : null;

  if (!current || !previous) {
    return [];
  }

  const c = candleMetrics(current);
  const p = candleMetrics(previous);
  const hits: CandlePatternDefinition[] = [];
  const add = (key: string) => {
    const pattern = CANDLE_PATTERNS.find((item) => item.key === key);

    if (pattern) {
      hits.push(pattern);
    }
  };
  const bothRanges = Math.max(c.range, p.range);

  if (
    p.bullish === false &&
    c.bullish &&
    current.open <= previous.close &&
    current.close >= previous.open &&
    c.body > p.body
  ) {
    add("bullish_engulfing");
  }

  if (
    p.bullish &&
    c.bullish === false &&
    current.open >= previous.close &&
    current.close <= previous.open &&
    c.body > p.body
  ) {
    add("bearish_engulfing");
  }

  if (
    p.bullish === false &&
    c.bullish &&
    current.open <= previous.close &&
    current.close > midpoint(previous) &&
    current.close < previous.open
  ) {
    add("piercing");
  }

  if (
    p.bullish &&
    c.bullish === false &&
    current.open >= previous.close &&
    current.close < midpoint(previous) &&
    current.close > previous.open
  ) {
    add("dark_cloud");
  }

  if (
    p.bullish === false &&
    c.bullish &&
    insideBody(current, previous) &&
    c.body < p.body
  ) {
    add("bullish_harami");
  }

  if (
    p.bullish &&
    c.bullish === false &&
    insideBody(current, previous) &&
    c.body < p.body
  ) {
    add("bearish_harami");
  }

  if (
    bothRanges > 0 &&
    p.bullish === false &&
    c.bullish &&
    Math.abs(current.low - previous.low) <= bothRanges * 0.08
  ) {
    add("tweezer_bottom");
  }

  if (
    bothRanges > 0 &&
    p.bullish &&
    c.bullish === false &&
    Math.abs(current.high - previous.high) <= bothRanges * 0.08
  ) {
    add("tweezer_top");
  }

  if (before) {
    const b = candleMetrics(before);

    if (
      b.bullish === false &&
      b.bodyRatio >= 0.3 &&
      p.body <= b.body * 0.5 &&
      c.bullish &&
      c.bodyRatio >= 0.2 &&
      current.close > midpoint(before)
    ) {
      add("morning_star");
    }

    if (
      b.bullish &&
      b.bodyRatio >= 0.3 &&
      p.body <= b.body * 0.5 &&
      c.bullish === false &&
      c.bodyRatio >= 0.2 &&
      current.close < midpoint(before)
    ) {
      add("evening_star");
    }

    if (
      b.bullish &&
      p.bullish &&
      c.bullish &&
      b.bodyRatio >= 0.3 &&
      p.bodyRatio >= 0.3 &&
      c.bodyRatio >= 0.3 &&
      before.close < previous.close &&
      previous.close < current.close
    ) {
      add("three_white_soldiers");
    }

    if (
      b.bullish === false &&
      p.bullish === false &&
      c.bullish === false &&
      b.bodyRatio >= 0.3 &&
      p.bodyRatio >= 0.3 &&
      c.bodyRatio >= 0.3 &&
      before.close > previous.close &&
      previous.close > current.close
    ) {
      add("three_black_crows");
    }
  }

  return hits;
}
