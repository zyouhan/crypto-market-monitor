import https from "node:https";
import { URL } from "node:url";

import { SocksProxyAgent } from "socks-proxy-agent";

import type { Kline } from "../indicators/types";
import { getIntervalDuration } from "../engine/time";

const OKX_BASE_URL =
  process.env.OKX_BASE_URL || "https://www.okx.com";

const PROXY_URL = process.env.PROXY_URL || "";

const REQUEST_TIMEOUT_MS = 15000;

const proxyAgent = PROXY_URL
  ? new SocksProxyAgent(PROXY_URL)
  : undefined;

const OKX_BAR: Record<string, string | null> = {
  "1m": "1m",
  "3m": "3m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1H",
  "2h": "2H",
  "4h": "4H",
  "6h": "6H",
  "8h": null,
  "12h": "12H",
  "1d": "1D",
  "3d": "3D",
  "1w": "1W",
  "1M": "1M"
};

interface OkxResponse {
  code?: string;
  msg?: string;
  data?: string[][];
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
          "User-Agent": "crypto-market-monitor/3.0"
        }
      },
      (response) => {
        let body = "";

        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          body += chunk;
        });
        response.on("end", () => {
          const status = response.statusCode || 0;

          if (status < 200 || status >= 300) {
            reject(
              new Error(
                `OKX API HTTP ${status}: ${body.slice(0, 500)}`
              )
            );
            return;
          }

          try {
            resolve(JSON.parse(body) as T);
          } catch {
            reject(new Error("OKX API 返回无法解析"));
          }
        });
      }
    );

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(
        new Error(
          `OKX API 请求超时（${REQUEST_TIMEOUT_MS}ms）`
        )
      );
    });

    request.on("error", reject);
    request.end();
  });
}

function toInstId(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();

  if (!/^[A-Z0-9]{2,30}$/.test(normalized)) {
    throw new Error(`无效的 OKX 标的: ${symbol}`);
  }

  if (!normalized.endsWith("USDT") || normalized.length <= 4) {
    throw new Error(`OKX 暂只支持 USDT 永续: ${symbol}`);
  }

  return `${normalized.slice(0, -4)}-USDT-SWAP`;
}

function closeTimeFor(openTime: number, interval: string): number {
  if (interval === "1M") {
    const date = new Date(openTime);

    return (
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        1
      ) - 1
    );
  }

  return openTime + getIntervalDuration(interval) - 1;
}

export function supportsOkxInterval(interval: string): boolean {
  return Boolean(OKX_BAR[interval]);
}

export async function getOkxKlines(
  symbol: string,
  interval: string,
  limit: number
): Promise<Kline[]> {
  const bar = OKX_BAR[interval];

  if (!bar) {
    throw new Error(`OKX 不支持该 K 线周期: ${interval}`);
  }

  const baseUrl = new URL(OKX_BASE_URL);

  if (baseUrl.protocol !== "https:") {
    throw new Error("OKX API 必须使用 HTTPS");
  }

  const url = new URL("/api/v5/market/candles", baseUrl);
  url.searchParams.set("instId", toInstId(symbol));
  url.searchParams.set("bar", bar);
  url.searchParams.set("limit", String(Math.min(limit, 300)));

  const response = await requestJson<OkxResponse>(url);

  if (response.code !== "0") {
    throw new Error(
      `OKX API 错误 ${response.code ?? "unknown"}: ${
        response.msg ?? "未知错误"
      }`
    );
  }

  if (!Array.isArray(response.data) || response.data.length === 0) {
    throw new Error("OKX API 返回空 K 线");
  }

  const now = Date.now();

  return response.data
    .filter((row) => {
      return (
        Array.isArray(row) &&
        row.length >= 9 &&
        row[8] === "1" &&
        Number(row[0]) < now
      );
    })
    .map((row) => {
      const openTime = Number(row[0]);

      return {
        openTime,
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
        closeTime: closeTimeFor(openTime, interval)
      };
    })
    .filter((kline) => {
      return (
        Number.isFinite(kline.close) &&
        kline.close > 0 &&
        Number.isFinite(kline.closeTime)
      );
    })
    .sort((a, b) => a.openTime - b.openTime);
}
