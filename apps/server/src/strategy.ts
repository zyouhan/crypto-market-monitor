import type { Kline } from "./binance";
import type { CrossType } from "./db";

export interface EmaPoint {
  time: number;
  close: number;
  fastEma: number;
  slowEma: number;
}

export interface CrossEvent {
  type: CrossType;
  price: number;
  time: number;
  fastEma: number;
  slowEma: number;
}

export interface StrategyResult {
  points: EmaPoint[];
  crosses: CrossEvent[];
}

/**
 * 计算 EMA 序列。
 *
 * EMA 初始值使用前 period 根数据的 SMA。
 * 返回数组与原始 prices 保持相同长度。
 * 前 period - 1 个位置为 null。
 */
export function calculateEMA(
  prices: number[],
  period: number
): Array<number | null> {
  if (!Number.isInteger(period) || period < 1) {
    throw new Error(`Invalid EMA period: ${period}`);
  }

  if (prices.length === 0) {
    return [];
  }

  if (prices.some((price) => !Number.isFinite(price))) {
    throw new Error("EMA prices contain invalid values");
  }

  const result: Array<number | null> = Array(
    prices.length
  ).fill(null);

  if (prices.length < period) {
    return result;
  }

  // EMA 平滑系数
  const multiplier = 2 / (period + 1);

  // 使用前 period 根 K 线的 SMA 作为初始 EMA
  const initialSum = prices
    .slice(0, period)
    .reduce((sum, price) => sum + price, 0);

  let previousEma = initialSum / period;

  result[period - 1] = previousEma;

  // 后续使用 EMA 递推公式
  for (let i = period; i < prices.length; i++) {
    const currentPrice = prices[i];

    const currentEma =
      (currentPrice - previousEma) * multiplier +
      previousEma;

    result[i] = currentEma;
    previousEma = currentEma;
  }

  return result;
}

/**
 * 计算指定快慢 EMA 参数下的交叉事件。
 *
 * 金叉：
 * 前一根 K 线 fast EMA <= slow EMA
 * 当前 K 线 fast EMA > slow EMA
 *
 * 死叉：
 * 前一根 K 线 fast EMA >= slow EMA
 * 当前 K 线 fast EMA < slow EMA
 */
export function calculateStrategy(
  klines: Kline[],
  fastPeriod: number,
  slowPeriod: number
): StrategyResult {
  if (
    !Number.isInteger(fastPeriod) ||
    !Number.isInteger(slowPeriod) ||
    fastPeriod < 1 ||
    slowPeriod < 1
  ) {
    throw new Error("EMA periods must be positive integers");
  }

  if (fastPeriod >= slowPeriod) {
    throw new Error(
      "Fast EMA period must be smaller than slow EMA period"
    );
  }

  if (klines.length === 0) {
    return {
      points: [],
      crosses: []
    };
  }

  // 确保 K 线按时间正序排列
  const sortedKlines = [...klines].sort(
    (a, b) => a.openTime - b.openTime
  );

  const prices = sortedKlines.map(
    (kline) => kline.close
  );

  const fastValues = calculateEMA(
    prices,
    fastPeriod
  );

  const slowValues = calculateEMA(
    prices,
    slowPeriod
  );

  const points: EmaPoint[] = [];
  const crosses: CrossEvent[] = [];

  for (let i = slowPeriod - 1; i < sortedKlines.length; i++) {
    const fastEma = fastValues[i];
    const slowEma = slowValues[i];

    if (fastEma === null || slowEma === null) {
      continue;
    }

    const kline = sortedKlines[i];

    points.push({
      time: kline.closeTime,
      close: kline.close,
      fastEma,
      slowEma
    });

    // 第一根有效慢 EMA 不具备前一根有效 EMA 比较数据
    if (i === slowPeriod - 1) {
      continue;
    }

    const previousFast = fastValues[i - 1];
    const previousSlow = slowValues[i - 1];

    if (
      previousFast === null ||
      previousSlow === null
    ) {
      continue;
    }

    let crossType: CrossType | null = null;

    // 金叉：快线从慢线下方或相等位置向上穿越
    if (
      previousFast <= previousSlow &&
      fastEma > slowEma
    ) {
      crossType = "GOLDEN";
    }

    // 死叉：快线从慢线上方或相等位置向下穿越
    else if (
      previousFast >= previousSlow &&
      fastEma < slowEma
    ) {
      crossType = "DEATH";
    }

    if (!crossType) {
      continue;
    }

    crosses.push({
      type: crossType,
      price: kline.close,
      time: kline.closeTime,
      fastEma,
      slowEma
    });
  }

  return {
    points,
    crosses
  };
}

/**
 * 根据交叉类型返回中文名称。
 */
export function getCrossName(
  type: CrossType
): string {
  return type === "GOLDEN" ? "金叉" : "死叉";
}

/**
 * 计算两个交叉点之间的价格绝对差。
 */
export function calculatePriceDiff(
  previousPrice: number,
  currentPrice: number
): number {
  if (
    !Number.isFinite(previousPrice) ||
    !Number.isFinite(currentPrice)
  ) {
    throw new Error("Invalid cross price");
  }

  return Math.abs(currentPrice - previousPrice);
}

/**
 * 判断价格差是否严格超过阈值。
 *
 * 注意：这里必须使用 >，不能使用 >=。
 */
export function isThresholdExceeded(
  priceDiff: number,
  threshold: number
): boolean {
  if (
    !Number.isFinite(priceDiff) ||
    !Number.isFinite(threshold) ||
    threshold < 0
  ) {
    throw new Error("Invalid price difference or threshold");
  }

  return priceDiff > threshold;
}