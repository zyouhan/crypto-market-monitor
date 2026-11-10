import type { AdxPoint, Kline } from "./types";

export interface AdxParams {
  period: number;
  threshold: number;
  direction: "bull" | "bear" | "both";
}

export const DEFAULT_ADX_PARAMS: AdxParams = {
  period: 14,
  threshold: 20,
  direction: "both"
};

export function validateAdxParams(params: AdxParams): void {
  if (
    !Number.isInteger(params.period) ||
    params.period < 2 ||
    params.period > 100
  ) {
    throw new Error("ADX 周期必须在 2 到 100 之间");
  }

  if (
    !Number.isFinite(params.threshold) ||
    params.threshold < 0 ||
    params.threshold > 100
  ) {
    throw new Error("ADX 阈值必须在 0 到 100 之间");
  }

  if (
    params.direction !== "bull" &&
    params.direction !== "bear" &&
    params.direction !== "both"
  ) {
    throw new Error("ADX 方向必须为 bull / bear / both");
  }
}

/**
 * Wilder ADX。
 *
 * TR / +DM / -DM 先用 Wilder 平滑，再计算 +DI/-DI；
 * DX 的 Wilder 平均值即 ADX。
 */
export function calculateADX(
  klines: Kline[],
  period: number
): AdxPoint[] {
  const length = klines.length;
  const tr = Array<number>(length).fill(0);
  const plusDm = Array<number>(length).fill(0);
  const minusDm = Array<number>(length).fill(0);
  const plusDi: Array<number | null> = Array(length).fill(null);
  const minusDi: Array<number | null> = Array(length).fill(null);
  const dx: Array<number | null> = Array(length).fill(null);
  const adxValues: Array<number | null> = Array(length).fill(null);

  for (let i = 1; i < length; i++) {
    const current = klines[i];
    const previous = klines[i - 1];
    const highDiff = current.high - previous.high;
    const lowDiff = previous.low - current.low;

    tr[i] = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    );
    plusDm[i] =
      highDiff > lowDiff && highDiff > 0 ? highDiff : 0;
    minusDm[i] =
      lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0;
  }

  if (length <= period) {
    return klines.map((kline) => ({
      time: kline.closeTime,
      close: kline.close,
      adx: null,
      plusDi: null,
      minusDi: null
    }));
  }

  let trSum = 0;
  let plusSum = 0;
  let minusSum = 0;

  for (let i = 1; i <= period; i++) {
    trSum += tr[i];
    plusSum += plusDm[i];
    minusSum += minusDm[i];
  }

  function setDi(index: number): void {
    if (trSum <= 0) {
      plusDi[index] = 0;
      minusDi[index] = 0;
      dx[index] = 0;
      return;
    }

    const plus = (100 * plusSum) / trSum;
    const minus = (100 * minusSum) / trSum;
    const sum = plus + minus;

    plusDi[index] = plus;
    minusDi[index] = minus;
    dx[index] =
      sum > 0 ? (100 * Math.abs(plus - minus)) / sum : 0;
  }

  setDi(period);

  for (let i = period + 1; i < length; i++) {
    trSum = trSum - trSum / period + tr[i];
    plusSum = plusSum - plusSum / period + plusDm[i];
    minusSum = minusSum - minusSum / period + minusDm[i];
    setDi(i);
  }

  const firstDxIndex = period;
  const firstAdxIndex = firstDxIndex + period - 1;

  if (firstAdxIndex >= length) {
    return klines.map((kline, index) => ({
      time: kline.closeTime,
      close: kline.close,
      adx: adxValues[index],
      plusDi: plusDi[index],
      minusDi: minusDi[index]
    }));
  }

  let adx = 0;

  for (
    let i = firstDxIndex;
    i <= firstAdxIndex;
    i++
  ) {
    adx += dx[i] ?? 0;
  }

  adx /= period;
  adxValues[firstAdxIndex] = adx;

  for (let i = firstAdxIndex + 1; i < length; i++) {
    adx = (adx * (period - 1) + (dx[i] ?? 0)) / period;
    adxValues[i] = adx;
  }

  return klines.map((kline, index) => ({
    time: kline.closeTime,
    close: kline.close,
    adx: adxValues[index],
    plusDi: plusDi[index],
    minusDi: minusDi[index]
  }));
}
