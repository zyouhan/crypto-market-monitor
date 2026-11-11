import { Router } from "express";

import type { SignalEventType } from "../../db/types";
import { db } from "../../db";
import { getSignals } from "../../db/monitor-repo";
import { failure, success } from "../middleware";

export const signalsRouter: Router = Router();

const STATS_RESULT_VALUES = [
  "light_success",
  "heavy_success",
  "light_reasonable_stop",
  "heavy_reasonable_stop",
  "light_failed",
  "heavy_failed",
  "other"
] as const;

const STATS_RESULTS = new Set(STATS_RESULT_VALUES);

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
      AND track_stats = 1
      AND stats_deleted = 0
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
      COALESCE(preset_name, '自定义/历史') AS preset_name,
      COUNT(1) AS count
    FROM monitors
    WHERE track_stats = 1
    GROUP BY preset_id, preset_name
  `).all() as Array<{
    preset_id: string;
    preset_name: string;
    count: number;
  }>;

  const presetMap = new Map<
    string,
    {
      preset_id: string;
      preset_name: string;
      total: number;
      today: number;
      last_event_time: number | null;
      monitors: number;
    }
  >();

  for (const row of monitorRows) {
    presetMap.set(row.preset_id, {
      preset_id: row.preset_id,
      preset_name: row.preset_name,
      total: 0,
      today: 0,
      last_event_time: null,
      monitors: row.count
    });
  }

  for (const row of presetRows) {
    const existing = presetMap.get(row.preset_id);
    presetMap.set(row.preset_id, {
      preset_id: row.preset_id,
      preset_name: existing?.preset_name ?? row.preset_name,
      total: row.total,
      today: row.today,
      last_event_time: row.last_event_time,
      monitors: existing?.monitors ?? 0
    });
  }

  res.json(
    success({
      today: today.count,
      total: total.count,
      by_preset: Array.from(presetMap.values()).sort(
        (a, b) => b.total - a.total
      )
    })
  );
});

signalsRouter.get("/stats/results", (req, res) => {
  const symbol =
    typeof req.query.symbol === "string" &&
    req.query.symbol.trim()
      ? req.query.symbol.trim().toUpperCase()
      : null;
  const symbolFilter = symbol ? "AND symbol = ?" : "";
  const symbolParams = symbol ? [symbol] : [];
  const baseWhere = `
    WHERE trigger_met = 1
      AND track_stats = 1
      AND stats_deleted = 0
      AND event_type IN ('ENTRY_LONG', 'ENTRY_SHORT')
      ${symbolFilter}
  `;

  const total = db.prepare(`
    SELECT COUNT(1) AS count
    FROM signals
    ${baseWhere}
  `).get(...symbolParams) as { count: number };

  const filled = db.prepare(`
    SELECT COUNT(1) AS count
    FROM signals
    ${baseWhere}
      AND stats_result IS NOT NULL
  `).get(...symbolParams) as { count: number };

  const rows = db.prepare(`
    SELECT stats_result AS result, COUNT(1) AS count
    FROM signals
    ${baseWhere}
      AND stats_result IS NOT NULL
    GROUP BY stats_result
  `).all(...symbolParams) as Array<{
    result: string;
    count: number;
  }>;

  const counts = new Map(
    rows.map((row) => [row.result, row.count])
  );
  const byResult = STATS_RESULT_VALUES.map((result) => {
    const count = counts.get(result) ?? 0;

    return {
      result,
      count,
      pct:
        filled.count > 0
          ? (count / filled.count) * 100
          : 0
    };
  });

  const symbols = db.prepare(`
    SELECT DISTINCT symbol
    FROM signals
    WHERE trigger_met = 1
      AND track_stats = 1
      AND stats_deleted = 0
      AND event_type IN ('ENTRY_LONG', 'ENTRY_SHORT')
    ORDER BY symbol
  `).all() as Array<{ symbol: string }>;

  res.json(
    success({
      symbol,
      symbols: symbols.map((row) => row.symbol),
      total: total.count,
      filled: filled.count,
      unfilled: total.count - filled.count,
      by_result: byResult
    })
  );
});

signalsRouter.get("/stats/entries", (req, res) => {
  const limit = Math.min(
    Math.max(Number(req.query.limit) || 20, 1),
    100
  );
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const search =
    typeof req.query.search === "string"
      ? req.query.search.trim()
      : "";
  const pattern = `%${search}%`;
  const where = `
    WHERE trigger_met = 1
      AND track_stats = 1
      AND stats_deleted = 0
      AND event_type IN ('ENTRY_LONG', 'ENTRY_SHORT')
      AND (
        ? = ''
        OR symbol LIKE ?
        OR preset_name LIKE ?
        OR monitor_name LIKE ?
        OR stats_note LIKE ?
      )
  `;

  const total = db.prepare(`
    SELECT COUNT(1) AS count
    FROM signals
    ${where}
  `).get(
    search,
    pattern,
    pattern,
    pattern,
    pattern
  ) as { count: number };

  const items = db.prepare(`
    SELECT
      id,
      event_time,
      symbol,
      preset_id,
      preset_name,
      direction,
      price,
      event_type,
      monitor_name,
      stats_note,
      stats_result
    FROM signals
    ${where}
    ORDER BY event_time DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(
    search,
    pattern,
    pattern,
    pattern,
    pattern,
    limit,
    offset
  );

  res.json(
    success({
      items,
      total: total.count,
      limit,
      offset
    })
  );
});

signalsRouter.patch("/:id/stats", (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json(failure("信号 ID 不正确"));
    return;
  }

  const signal = db.prepare(`
    SELECT id, track_stats, stats_note, stats_result
    FROM signals
    WHERE id = ?
  `).get(id) as
    | {
        id: number;
        track_stats: number;
        stats_note: string | null;
        stats_result: string | null;
      }
    | undefined;

  if (!signal) {
    res.status(404).json(failure("信号不存在"));
    return;
  }

  const body = req.body ?? {};
  const hasNote = Object.prototype.hasOwnProperty.call(
    body,
    "note"
  );
  const hasResult = Object.prototype.hasOwnProperty.call(
    body,
    "result"
  );

  if (!hasNote && !hasResult) {
    res.status(400).json(
      failure("请提供备注或结果")
    );
    return;
  }

  let note = signal.stats_note;
  let result = signal.stats_result;

  if (hasNote) {
    if (body.note !== null && typeof body.note !== "string") {
      res.status(400).json(failure("备注必须是文本"));
      return;
    }

    note =
      typeof body.note === "string" && body.note.length > 0
        ? body.note.slice(0, 5000)
        : null;
  }

  if (hasResult) {
    if (
      body.result !== null &&
      (typeof body.result !== "string" ||
        !STATS_RESULTS.has(body.result))
    ) {
      res.status(400).json(failure("统计结果不正确"));
      return;
    }

    result =
      typeof body.result === "string" ? body.result : null;
  }

  db.prepare(`
    UPDATE signals
    SET
      stats_note = ?,
      stats_result = ?
    WHERE id = ?
  `).run(note, result, id);

  res.json(
    success(
      {
        id,
        stats_note: note,
        stats_result: result
      },
      "统计信息已更新"
    )
  );
});

signalsRouter.delete("/:id/stats", (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json(failure("信号 ID 不正确"));
    return;
  }

  const signal = db.prepare(`
    SELECT id
    FROM signals
    WHERE id = ?
  `).get(id) as { id: number } | undefined;

  if (!signal) {
    res.status(404).json(failure("信号不存在"));
    return;
  }

  db.prepare(`
    UPDATE signals
    SET stats_deleted = 1
    WHERE id = ?
  `).run(id);

  res.json(success({ id }, "已从策略统计中删除"));
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
  "EMA_FAST_TURN",
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
