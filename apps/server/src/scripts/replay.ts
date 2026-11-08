import "../env";

import fs from "node:fs";
import path from "node:path";

import { STALE_CANDLES } from "../config/defaults";
import { formatTime } from "../engine/time";
import type { Kline } from "../indicators/types";
import { getKlines, getKlineLimit } from "../market/binance";
import { getRunner } from "../strategies/registry";
import type {
  SharedContext,
  SignalDraft,
  StrategyStateView
} from "../strategies/types";

/**
 * 只读回放脚本。
 *
 * 用真实（或离线 JSON）K 线前 80% 预热，再用剩余 20% 增量评估，
 * 打印趋势/入场状态迁移与信号，不写数据库、不发送通知。
 *
 * 用法：
 *   npx tsx src/scripts/replay.ts --symbol ETHUSDT --interval 1m
 *   npx tsx src/scripts/replay.ts --json fixtures/klines.json
 */

const args = process.argv.slice(2);

function readArg(name: string): string | undefined {
  const index = args.indexOf(`--${name}`);

  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

const symbol = (readArg("symbol") ?? "ETHUSDT").toUpperCase();
const interval = readArg("interval") ?? "1m";
const jsonFile = readArg("json");
const limit = Number(readArg("limit") ?? getKlineLimit());

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeKlineList(raw: unknown): Kline[] {
  const list = Array.isArray(raw)
    ? raw
    : (raw as { klines?: unknown })?.klines;

  if (!Array.isArray(list)) {
    throw new Error("K 线文件格式不正确，应为数组或 { klines: [] }");
  }

  return list
    .map((item) => {
      const row = item as Record<string, unknown>;

      return {
        openTime: Number(row.openTime ?? row[0]),
        closeTime: Number(row.closeTime ?? row[6]),
        open: Number(row.open ?? row[1]),
        high: Number(row.high ?? row[2]),
        low: Number(row.low ?? row[3]),
        close: Number(row.close ?? row[4]),
        volume: Number(row.volume ?? row[5])
      };
    })
    .filter(
      (kline) =>
        isFiniteNumber(kline.close) &&
        isFiniteNumber(kline.closeTime) &&
        kline.close > 0
    )
    .sort((a, b) => a.openTime - b.openTime);
}

async function loadKlines(): Promise<Kline[]> {
  if (jsonFile) {
    const filePath = path.resolve(process.cwd(), jsonFile);
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;

    return normalizeKlineList(raw);
  }

  return getKlines(symbol, interval, limit);
}

function emptyState(kind: string): StrategyStateView {
  return {
    status: kind === "EMA_TREND" ? "NEUTRAL" : "IDLE",
    baselineType: null,
    baselinePrice: null,
    baselineEma: null,
    baselineTime: null,
    extra: {}
  };
}

function describePayload(payload: Record<string, unknown> | null): string {
  if (!payload) {
    return "";
  }

  const parts: string[] = [];

  if (typeof payload.j === "number") {
    parts.push(`J=${payload.j.toFixed(2)}`);
  }

  if (typeof payload.fast === "number") {
    parts.push(`EMA=${payload.fast}/${payload.slow}`);
  }

  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

function printSignal(draft: SignalDraft): void {
  const emaDiff =
    typeof draft.emaDiff === "number"
      ? ` EMA距离=${draft.emaDiff.toFixed(4)}/${draft.threshold}`
      : "";

  const priceDiff =
    typeof draft.priceDiff === "number"
      ? ` 价差=${draft.priceDiff.toFixed(4)}`
      : "";

  console.log(
    `[信号] ${formatTime(draft.eventTime)} ${draft.kind} ${
      draft.eventType
    } ${draft.direction ?? "-"} 价格=${draft.price}${emaDiff}${priceDiff}${describePayload(
      draft.payload
    )}${draft.triggerMet ? "" : "（未达阈值）"}`
  );
}

async function main(): Promise<void> {
  const klines = await loadKlines();

  if (klines.length < 60) {
    console.error(`K 线数量不足：${klines.length}`);
    process.exit(1);
  }

  const split = Math.max(
    Math.min(klines.length - 1, Math.floor(klines.length * 0.8)),
    1
  );

  const warmupKlines = klines.slice(0, split);
  const incrementalKlines = klines.slice(split);

  const klineLimit = getKlineLimit();

  const kinds = [
    "EMA_TREND",
    "KDJ_ENTRY",
    "KDJ_TIMING"
  ] as const;

  const states = new Map<string, StrategyStateView>(
    kinds.map((kind) => [kind, emptyState(kind)])
  );

  const shared: SharedContext = {
    trend: "NEUTRAL",
    trendByCloseTime: new Map()
  };

  console.log(
    `回放 ${symbol} ${interval}：共 ${klines.length} 根，预热 ${warmupKlines.length} 根，增量 ${incrementalKlines.length} 根`
  );

  for (const kind of kinds) {
    const runner = getRunner(kind);
    const params = runner.normalizeParams(
      runner.defaultParams(),
      klineLimit
    );

    const result = runner.run({
      state: states.get(kind) as StrategyStateView,
      params,
      klines: warmupKlines,
      newKlines: [],
      warmup: true,
      shared
    });

    states.set(kind, result.state);

    console.log(
      `[预热] ${kind} 状态=${result.state.status} 基准=${JSON.stringify(
        result.state.baselineType
      )} 基准EMA=${result.state.baselineEma} 额外=${JSON.stringify(
        result.state.extra
      )}`
    );
  }

  for (const kind of kinds) {
    const runner = getRunner(kind);
    const params = runner.normalizeParams(
      runner.defaultParams(),
      klineLimit
    );

    const result = runner.run({
      state: states.get(kind) as StrategyStateView,
      params,
      klines,
      newKlines: incrementalKlines,
      warmup: false,
      shared
    });

    states.set(kind, result.state);

    console.log(
      `[增量] ${kind} 状态=${result.state.status} 额外=${JSON.stringify(
        result.state.extra
      )}`
    );

    for (const draft of result.signals) {
      printSignal(draft);
    }
  }

  console.log(
    `[完成] 趋势=${states.get("EMA_TREND")?.status} 入场=${states.get(
      "KDJ_ENTRY"
    )?.status} 简易J=${states.get(
      "KDJ_TIMING"
    )?.status} 陈旧阈值=${STALE_CANDLES} 个周期`
  );
}

void main().catch((error: unknown) => {
  console.error(
    "[回放失败]",
    error instanceof Error ? error.message : error
  );
  process.exit(1);
});
