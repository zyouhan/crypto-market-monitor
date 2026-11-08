import type {
  CrossSignal,
  EmaPoint,
  Kline
} from "./types";

export function validateEmaPeriods(
  fastPeriod: number,
  slowPeriod: number
): void {
  if (
    !Number.isInteger(fastPeriod) ||
    !Number.isInteger(slowPeriod) ||
    fastPeriod < 2 ||
    slowPeriod < 2
  ) {
    throw new Error(
      "EMA periods must be integers greater than or equal to 2"
    );
  }

  if (fastPeriod >= slowPeriod) {
    throw new Error(
      "Fast EMA period must be smaller than slow EMA period"
    );
  }
}

/**
 * 计算 EMA。
 *
 * 初始值使用前 period 个价格的 SMA，
 * 后续使用标准 EMA 递推公式：
 *
 * EMA = Price * alpha + PreviousEMA * (1 - alpha)
 * alpha = 2 / (period + 1)
 *
 * 返回数组与输入价格数组长度一致。
 * 前 period - 1 个位置为 null。
 */
export function calculateEMA(
  prices: number[],
  period: number
): Array<number | null> {
  if (!Number.isInteger(period) || period < 2) {
    throw new Error(
      "EMA period must be an integer greater than or equal to 2"
    );
  }

  const result: Array<number | null> = Array(
    prices.length
  ).fill(null);

  if (prices.length < period) {
    return result;
  }

  for (const price of prices) {
    if (!Number.isFinite(price)) {
      throw new Error("EMA input contains invalid price");
    }
  }

  const alpha = 2 / (period + 1);

  const initialSum = prices
    .slice(0, period)
    .reduce((sum, price) => sum + price, 0);

  let previousEma = initialSum / period;

  result[period - 1] = previousEma;

  for (let i = period; i < prices.length; i++) {
    const currentPrice = prices[i];

    const currentEma =
      currentPrice * alpha + previousEma * (1 - alpha);

    result[i] = currentEma;
    previousEma = currentEma;
  }

  return result;
}

/**
 * 识别所有历史交叉。
 *
 * 输入必须是已收盘 K 线；交叉价格使用当前 K 线收盘价，
 * 交叉时间使用当前 K 线 closeTime。
 */
export function detectCrosses(
  klines: Kline[],
  fastPeriod: number,
  slowPeriod: number
): CrossSignal[] {
  validateEmaPeriods(fastPeriod, slowPeriod);

  if (klines.length < slowPeriod + 1) {
    return [];
  }

  const sortedKlines = [...klines].sort(
    (a, b) => a.openTime - b.openTime
  );

  const prices = sortedKlines.map((item) => item.close);

  const fastValues = calculateEMA(prices, fastPeriod);
  const slowValues = calculateEMA(prices, slowPeriod);

  const crosses: CrossSignal[] = [];

  for (let i = slowPeriod; i < sortedKlines.length; i++) {
    const previousFast = fastValues[i - 1];
    const previousSlow = slowValues[i - 1];

    const currentFast = fastValues[i];
    const currentSlow = slowValues[i];

    if (
      previousFast === null ||
      previousSlow === null ||
      currentFast === null ||
      currentSlow === null
    ) {
      continue;
    }

    const isGoldenCross =
      previousFast <= previousSlow &&
      currentFast > currentSlow;

    const isDeathCross =
      previousFast >= previousSlow &&
      currentFast < currentSlow;

    if (!isGoldenCross && !isDeathCross) {
      continue;
    }

    const currentKline = sortedKlines[i];

    crosses.push({
      type: isGoldenCross ? "GOLDEN" : "DEATH",
      price: currentKline.close,
      time: currentKline.closeTime,
      fastEma: currentFast,
      slowEma: currentSlow
    });
  }

  return crosses;
}

/**
 * 最新一根有效 K 线上的快慢线关系。
 */
export function getEmaSnapshot(
  klines: Kline[],
  fastPeriod: number,
  slowPeriod: number
): {
  state: "GOLDEN" | "DEATH" | "UNKNOWN";
  fastEma: number | null;
  slowEma: number | null;
} {
  validateEmaPeriods(fastPeriod, slowPeriod);

  if (klines.length < slowPeriod) {
    return { state: "UNKNOWN", fastEma: null, slowEma: null };
  }

  const sortedKlines = [...klines].sort(
    (a, b) => a.openTime - b.openTime
  );

  const prices = sortedKlines.map((item) => item.close);

  const fastValues = calculateEMA(prices, fastPeriod);
  const slowValues = calculateEMA(prices, slowPeriod);

  const lastIndex = sortedKlines.length - 1;

  const fast = fastValues[lastIndex];
  const slow = slowValues[lastIndex];

  if (fast === null || slow === null) {
    return { state: "UNKNOWN", fastEma: null, slowEma: null };
  }

  return {
    state: fast > slow ? "GOLDEN" : "DEATH",
    fastEma: fast,
    slowEma: slow
  };
}

/**
 * EMA 曲线数据，供后续图表使用。
 */
export function calculateEmaSeries(
  klines: Kline[],
  fastPeriod: number,
  slowPeriod: number
): EmaPoint[] {
  validateEmaPeriods(fastPeriod, slowPeriod);

  const sortedKlines = [...klines].sort(
    (a, b) => a.openTime - b.openTime
  );

  const prices = sortedKlines.map((item) => item.close);

  const fastValues = calculateEMA(prices, fastPeriod);
  const slowValues = calculateEMA(prices, slowPeriod);

  return sortedKlines.map((item, index) => ({
    time: item.closeTime,
    close: item.close,
    fastEma: fastValues[index],
    slowEma: slowValues[index]
  }));
}
