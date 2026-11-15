import type { Kline } from "./types";

/**
 * Wilder ATR. 前 period - 1 个位置为 null。
 */
export function calculateATR(
  klines: Kline[],
  period: number
): Array<number | null> {
  if (!Number.isInteger(period) || period < 1) {
    throw new Error("ATR period must be an integer greater than 0");
  }

  const result: Array<number | null> = Array(
    klines.length
  ).fill(null);

  if (klines.length <= period) {
    return result;
  }

  const tr = Array<number>(klines.length).fill(0);

  for (let i = 1; i < klines.length; i++) {
    const current = klines[i];
    const previous = klines[i - 1];

    tr[i] = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    );
  }

  let atr = 0;

  for (let i = 1; i <= period; i++) {
    atr += tr[i];
  }

  atr /= period;
  result[period] = atr;

  for (let i = period + 1; i < klines.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
    result[i] = atr;
  }

  return result;
}

export function averageVolume(
  klines: Kline[],
  endIndex: number,
  period = 20
): number | null {
  const start = Math.max(0, endIndex - period + 1);
  const slice = klines.slice(start, endIndex + 1);

  if (slice.length < period) {
    return null;
  }

  const sum = slice.reduce(
    (total, kline) => total + (kline.volume ?? 0),
    0
  );

  return sum / period;
}
