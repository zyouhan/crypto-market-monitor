import { Router } from "express";

import type { SignalEventType } from "../../db/types";
import { db } from "../../db";
import { getSignals } from "../../db/monitor-repo";
import { failure, success } from "../middleware";

export const signalsRouter: Router = Router();

signalsRouter.get("/stats", (_req, res) => {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();

  const today = db.prepare(`
    SELECT COUNT(1) AS count
    FROM signals
    WHERE trigger_met = 1
      AND event_time >= ?
      AND event_type NOT IN (
        'STOP_LOSS_HIT',
        'TRADE_1R',
        'TRADE_BREAKEVEN'
      )
  `).get(startOfToday) as { count: number };

  const total = db.prepare(`
    SELECT COUNT(1) AS count
    FROM signals
    WHERE trigger_met = 1
      AND event_type NOT IN (
        'STOP_LOSS_HIT',
        'TRADE_1R',
        'TRADE_BREAKEVEN'
      )
  `).get() as { count: number };

  const presetRows = db.prepare(`
    SELECT
      COALESCE(preset_id, 'custom') AS preset_id,
      COALESCE(preset_name, '自定义/历史') AS preset_name,
      COUNT(1) AS total,
      SUM(CASE WHEN event_time >= ? THEN 1 ELSE 0 END) AS today,
      MAX(event_time) AS last_event_time
    FROM signals
    WHERE trigger_met = 1
      AND event_type IN ('ENTRY_LONG', 'ENTRY_SHORT')
    GROUP BY preset_id, preset_name
  `).all(startOfToday) as Array<{
    preset_id: string;
    preset_name: string;
    total: number;
    today: number;
    last_event_time: number | null;
  }>;

  const monitorRows = db.prepare(`
    SELECT
      COALESCE(preset_id, 'custom') AS preset_id,
      COUNT(1) AS count
    FROM monitors
    GROUP BY preset_id
  `).all() as Array<{
    preset_id: string;
    count: number;
  }>;
  const monitorCounts = new Map(
    monitorRows.map((row) => [row.preset_id, row.count])
  );

  res.json(
    success({
      today: today.count,
      total: total.count,
      by_preset: presetRows.map((row) => ({
        ...row,
        monitors: monitorCounts.get(row.preset_id) ?? 0
      }))
    })
  );
});

const EVENT_TYPES: SignalEventType[] = [
  "TREND_GOLDEN",
  "TREND_DEATH",
  "TREND_INVALIDATED",
  "ENTRY_LONG",
  "ENTRY_SHORT",
  "VOLUME_SPIKE",
  "PRICE_LEVEL",
  "MACD_DEA_TURN",
  "ADX_TREND",
  "STOP_LOSS_HIT",
  "TRADE_1R",
  "TRADE_BREAKEVEN"
];

function isEventType(
  value: unknown
): value is SignalEventType {
  return (
    typeof value === "string" &&
    EVENT_TYPES.includes(value as SignalEventType)
  );
}

function parseJson(
  value: string | null
): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

signalsRouter.get("/", (req, res) => {
  const limitValue = Number(req.query.limit ?? 50);
  const offsetValue = Number(req.query.offset ?? 0);

  const limit = Math.min(
    Math.max(Math.floor(limitValue) || 50, 1),
    200
  );
  const offset = Math.max(
    Math.floor(offsetValue) || 0,
    0
  );

  const symbol =
    typeof req.query.symbol === "string"
      ? req.query.symbol.trim().toUpperCase()
      : "";
  const interval =
    typeof req.query.interval === "string"
      ? req.query.interval.trim()
      : "";
  const monitorRaw = req.query.monitor_id;
  const eventTypeRaw = req.query.event_type;
  const triggeredRaw = req.query.triggered;

  const monitorId =
    typeof monitorRaw === "string" && monitorRaw.trim()
      ? Number(monitorRaw)
      : undefined;

  if (
    monitorId !== undefined &&
    (!Number.isInteger(monitorId) || monitorId <= 0)
  ) {
    res.status(400).json(failure("监控项 ID 不正确"));
    return;
  }

  if (
    eventTypeRaw !== undefined &&
    !isEventType(eventTypeRaw)
  ) {
    res.status(400).json(failure("未知的信号类型"));
    return;
  }

  const items = getSignals({
    limit,
    offset,
    symbol: symbol || undefined,
    interval: interval || undefined,
    monitorId,
    eventType: eventTypeRaw as string | undefined,
    triggeredOnly:
      triggeredRaw === "1" || triggeredRaw === "true"
  }).map((row) => ({
    ...row,
    conditions: parseJson(row.conditions),
    payload: parseJson(row.payload)
  }));

  res.json(success({ items, limit, offset }));
});
