import https from "node:https";
import { URL } from "node:url";

import { SocksProxyAgent } from "socks-proxy-agent";

import type { Kline } from "../indicators/types";

const BINANCE_BASE_URL =
  process.env.BINANCE_BASE_URL || "https://fapi.binance.com";

const PROXY_URL = process.env.PROXY_URL || "";

const REQUEST_TIMEOUT_MS = 15000;

const KLINE_LIMIT = Math.min(
  Math.max(Number(process.env.KLINE_LIMIT) || 300, 50),
  1500
);

const proxyAgent = PROXY_URL
  ? new SocksProxyAgent(PROXY_URL)
  : undefined;

const SUPPORTED_INTERVALS = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "8h",
  "12h",
  "1d",
  "3d",
  "1w",
  "1M"
] as const;

export type KlineInterval =
  (typeof SUPPORTED_INTERVALS)[number];

export function isValidInterval(
  interval: string
): interval is KlineInterval {
  return SUPPORTED_INTERVALS.includes(
    interval as KlineInterval
  );
}

/**
 * 每次请求获取的 K 线数量。
 * 同时作为策略周期的上限校验值。
 */
export function getKlineLimit(): number {
  return KLINE_LIMIT;
}

function requestJson<T>(url: URL): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: "GET",
        agent: proxyAgent,
        headers: {
          Accept: "application/json",
          "User-Agent": "crypto-market-monitor/2.0"
        }
      },
      (response) => {
        let body = "";

        response.setEncoding("utf8");

        response.on("data", (chunk: string) => {
          body += chunk;
        });

        response.on("end", () => {
          const statusCode = response.statusCode || 0;

          if (statusCode < 200 || statusCode >= 300) {
            reject(
              new Error(
                `Binance API HTTP ${statusCode}: ${body.slice(0, 500)}`
              )
            );
            return;
          }

          try {
            resolve(JSON.parse(body) as T);
          } catch {
            reject(
              new Error("Failed to parse Binance API response")
            );
          }
        });
      }
    );

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(
        new Error(
          `Binance API request timeout after ${REQUEST_TIMEOUT_MS}ms`
        )
      );
    });

    request.on("error", reject);

    request.end();
  });
}

type BinanceKlineRow = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string
];

export async function getKlines(
  symbol: string,
  interval: string,
  limit = KLINE_LIMIT
): Promise<Kline[]> {
  const normalizedSymbol = symbol.trim().toUpperCase();

  if (!/^[A-Z0-9]{2,30}$/.test(normalizedSymbol)) {
    throw new Error(`Invalid Binance symbol: ${symbol}`);
  }

  if (!isValidInterval(interval)) {
    throw new Error(`Unsupported K-line interval: ${interval}`);
  }

  const safeLimit = Math.min(
    Math.max(Math.floor(limit), 50),
    1500
  );

  const baseUrl = new URL(BINANCE_BASE_URL);

  if (baseUrl.protocol !== "https:") {
    throw new Error("Binance API must use HTTPS");
  }

  const url = new URL("/fapi/v1/klines", baseUrl);

  url.searchParams.set("symbol", normalizedSymbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", String(safeLimit));

  const rows = await requestJson<BinanceKlineRow[]>(url);

  if (!Array.isArray(rows)) {
    throw new Error("Invalid Binance K-line response");
  }

  const now = Date.now();

  return rows
    .filter((row) => {
      return (
        Array.isArray(row) &&
        row.length >= 7 &&
        Number.isFinite(Number(row[6])) &&
        Number(row[6]) < now
      );
    })
    .map((row) => ({
      openTime: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      closeTime: Number(row[6])
    }))
    .filter((kline) => {
      return (
        Number.isFinite(kline.close) &&
        Number.isFinite(kline.closeTime) &&
        kline.close > 0
      );
    })
    .sort((a, b) => a.openTime - b.openTime);
}
