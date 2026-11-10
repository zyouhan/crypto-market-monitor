import type { CrossType } from "../db/types";

export interface Kline {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CrossSignal {
  type: CrossType;
  price: number;
  time: number;
  fastEma: number;
  slowEma: number;
}

export interface EmaPoint {
  time: number;
  close: number;
  fastEma: number | null;
  slowEma: number | null;
}

export interface KdjPoint {
  time: number;
  close: number;
  k: number | null;
  d: number | null;
  j: number | null;
}

export interface MacdPoint {
  time: number;
  close: number;
  dif: number | null;
  dea: number | null;
  histogram: number | null;
}

export interface AdxPoint {
  time: number;
  close: number;
  adx: number | null;
  plusDi: number | null;
  minusDi: number | null;
}
