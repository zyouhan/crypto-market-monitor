import { Router } from "express";

import { db } from "../../db";
import {
  buildMindsetScore,
  type TradeQuality,
  type TradeRecordRow
} from "../../trades/mindset";
import {
  failure,
  isPositiveInteger,
  success
} from "../middleware";

export const tradesRouter: Router = Router();

const QUALITIES: TradeQuality[] = [
  "excellent",
  "good",
  "fair",
  "poor"
];
const MAX_PAGE_SIZE = 100;
const MAX_NOTE_LENGTH = 1000;
const RESET_WAIT_MS = 30 * 60 * 1000;

interface TradeInput {
  symbol: string;
  direction: "BULL" | "BEAR";
  open_time: number;
  close_time: number;
  pnl: number;
  open_quality: TradeQuality;
  close_quality: TradeQuality;
  take_profit_quality: TradeQuality;
  stop_loss_quality: TradeQuality;
  note: string;
}

interface Filter {
  where: string;
  params: Array<string | number>;
}

interface MindsetResetRow {
  id: number;
  trade_date: string;
  before_score: number;
  after_score: number;
  note: string;
  created_at: number;
  cooldown_until: number;
}

function dateKey(timestamp: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function dateStart(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  const start = Date.parse(`${date}T00:00:00+08:00`);

  return Number.isFinite(start) ? start : null;
}

function quality(value: unknown): TradeQuality | null {
  return typeof value === "string" &&
    QUALITIES.includes(value as TradeQuality)
    ? (value as TradeQuality)
    : null;
}

function readInput(body: unknown): TradeInput {
  const input =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const symbol =
    typeof input.symbol === "string"
      ? input.symbol.trim().toUpperCase()
      : "";
  const direction =
    input.direction === "BULL" || input.direction === "BEAR"
      ? input.direction
      : null;
  const openTime = Number(input.open_time);
  const closeTime = Number(input.close_time);
  const pnl = Number(input.pnl);
  const openQuality = quality(input.open_quality);
  const closeQuality = quality(input.close_quality);
  const takeProfitQuality = quality(input.take_profit_quality);
  const stopLossQuality = quality(input.stop_loss_quality);
  const note =
    typeof input.note === "string" ? input.note.trim() : "";

  if (!/^[A-Z0-9]{2,30}$/.test(symbol)) {
    throw new Error("标的不正确");
  }

  if (!direction) {
    throw new Error("请选择做多或做空");
  }

  if (
    !Number.isFinite(openTime) ||
    !Number.isFinite(closeTime) ||
    openTime <= 0 ||
    closeTime <= 0
  ) {
    throw new Error("开仓/清仓时间不正确");
  }

  if (closeTime < openTime) {
    throw new Error("清仓时间不能早于开仓时间");
  }

  if (!Number.isFinite(pnl)) {
    throw new Error("收益必须是有效数字");
  }

  if (
    !openQuality ||
    !closeQuality ||
    !takeProfitQuality ||
    !stopLossQuality
  ) {
    throw new Error("请完成四项操作评价");
  }

  if (note.length > MAX_NOTE_LENGTH) {
    throw new Error("备注不能超过 1000 个字符");
  }

  return {
    symbol,
    direction,
    open_time: Math.round(openTime),
    close_time: Math.round(closeTime),
    pnl,
    open_quality: openQuality,
    close_quality: closeQuality,
    take_profit_quality: takeProfitQuality,
    stop_loss_quality: stopLossQuality,
    note
  };
}

function getRow(id: number): TradeRecordRow | null {
  return (
    (db.prepare(
      "SELECT * FROM trade_records WHERE id = ?"
    ).get(id) as TradeRecordRow | undefined) ?? null
  );
}

function getFilter(query: Record<string, unknown>): Filter {
  const where: string[] = [];
  const params: Array<string | number> = [];
  const symbol =
    typeof query.symbol === "string"
      ? query.symbol.trim().toUpperCase()
      : "";
  const start =
    typeof query.start === "string" ? dateStart(query.start) : null;
  const end =
    typeof query.end === "string" ? dateStart(query.end) : null;

  if (symbol) {
    where.push("symbol LIKE ?");
    params.push(`%${symbol}%`);
  }

  if (start !== null) {
    where.push("close_time >= ?");
    params.push(start);
  }

  if (end !== null) {
    where.push("close_time < ?");
    params.push(end + 24 * 60 * 60 * 1000);
  }

  for (const key of [
    "open_quality",
    "close_quality",
    "take_profit_quality",
    "stop_loss_quality"
  ]) {
    const value = quality(query[key]);

    if (value) {
      where.push(`${key} = ?`);
      params.push(value);
    }
  }

  return {
    where: where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
    params
  };
}

function getTradeRowsForDate(
  date: string
): TradeRecordRow[] {
  const start = dateStart(date);

  if (start === null) {
    return [];
  }

  return db.prepare(`
    SELECT *
    FROM trade_records
    WHERE close_time >= ? AND close_time < ?
    ORDER BY close_time ASC, id ASC
  `).all(
    start,
    start + 24 * 60 * 60 * 1000
  ) as TradeRecordRow[];
}

function getReset(
  date: string
): MindsetResetRow | undefined {
  return db.prepare(`
    SELECT *
    FROM mindset_resets
    WHERE trade_date = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get(date) as MindsetResetRow | undefined;
}

function resetView(
  date: string,
  rows: TradeRecordRow[],
  reset: MindsetResetRow | undefined,
  now = Date.now()
) {
  const lastClose = rows.reduce(
    (latest, row) => Math.max(latest, row.close_time),
    0
  );
  let available = false;
  let reason = "";

  if (rows.length === 0) {
    reason = "今日暂无交易";
  } else if (reset) {
    reason = "今日已重置";
  } else if (now - lastClose < RESET_WAIT_MS) {
    reason = "最近 30 分钟内还有交易，请先冷静";
  } else {
    available = true;
  }

  return {
    available,
    reason,
    count: reset ? 1 : 0,
    last_reset_at: reset?.created_at ?? null,
    cooldown_until: reset?.cooldown_until ?? null
  };
}

function mindsetResponse(date: string) {
  const rows = getTradeRowsForDate(date);
  const reset = getReset(date);
  const score = buildMindsetScore(
    rows,
    date,
    reset
      ? {
          created_at: reset.created_at,
          after_score: reset.after_score
        }
      : null
  );

  return {
    ...score,
    reset: resetView(date, rows, reset)
  };
}

tradesRouter.get("/", (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(
    Math.max(Number(req.query.limit) || 20, 1),
    MAX_PAGE_SIZE
  );
  const filter = getFilter(
    req.query as Record<string, unknown>
  );
  const totalRow = db.prepare(`
    SELECT COUNT(1) AS count
    FROM trade_records
    ${filter.where}
  `).get(...filter.params) as { count: number };
  const totalPages = Math.max(1, Math.ceil(totalRow.count / limit));
  const currentPage = Math.min(page, totalPages);
  const items = db.prepare(`
    SELECT *
    FROM trade_records
    ${filter.where}
    ORDER BY close_time DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(
    ...filter.params,
    limit,
    (currentPage - 1) * limit
  ) as TradeRecordRow[];

  res.json(
    success({
      items,
      total: totalRow.count,
      page: currentPage,
      limit,
      total_pages: totalPages
    })
  );
});

tradesRouter.get("/curve", (req, res) => {
  const filter = getFilter(
    req.query as Record<string, unknown>
  );
  const rows = db.prepare(`
    SELECT close_time, pnl
    FROM trade_records
    ${filter.where}
    ORDER BY close_time ASC, id ASC
  `).all(...filter.params) as Array<{
    close_time: number;
    pnl: number;
  }>;
  let cumulative = 0;

  res.json(
    success(
      rows.map((row) => {
        cumulative += row.pnl;

        return {
          time: row.close_time,
          pnl: row.pnl,
          cumulative
        };
      })
    )
  );
});

tradesRouter.get("/mindset", (req, res) => {
  const date =
    typeof req.query.date === "string" &&
    dateStart(req.query.date) !== null
      ? req.query.date
      : dateKey(Date.now());

  res.json(success(mindsetResponse(date)));
});

tradesRouter.post("/mindset/reset", (req, res) => {
  const date =
    typeof req.body?.date === "string" &&
    dateStart(req.body.date) !== null
      ? req.body.date
      : dateKey(Date.now());
  const note =
    typeof req.body?.note === "string"
      ? req.body.note.trim()
      : "";

  if (!note) {
    res.status(400).json(failure("请填写复盘备注"));
    return;
  }

  if (note.length > MAX_NOTE_LENGTH) {
    res.status(400).json(failure("备注不能超过 1000 个字符"));
    return;
  }

  const rows = getTradeRowsForDate(date);

  if (rows.length === 0) {
    res.status(400).json(failure("今日暂无交易，不需要重置"));
    return;
  }

  if (getReset(date)) {
    res.status(400).json(failure("今日已经重置过一次"));
    return;
  }

  const lastClose = rows.reduce(
    (latest, row) => Math.max(latest, row.close_time),
    0
  );

  if (Date.now() - lastClose < RESET_WAIT_MS) {
    res.status(400).json(
      failure("最近 30 分钟内还有交易，请先冷静")
    );
    return;
  }

  const before = buildMindsetScore(rows, date, null);
  const after = buildMindsetScore(rows, date, {
    created_at: Date.now(),
    after_score: before.score ?? 100
  });
  const now = Date.now();
  db.prepare(`
    INSERT INTO mindset_resets (
      trade_date, before_score, after_score,
      note, created_at, cooldown_until
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    date,
    before.score ?? 100,
    after.score ?? 100,
    note,
    now,
    now + RESET_WAIT_MS
  );

  res.json(
    success(mindsetResponse(date), "疲劳因子已重置")
  );
});

tradesRouter.post("/", (req, res) => {
  let input: TradeInput;

  try {
    input = readInput(req.body);
  } catch (error) {
    res.status(400).json(
      failure(error instanceof Error ? error.message : "参数不正确")
    );
    return;
  }

  const now = Date.now();
  const result = db.prepare(`
    INSERT INTO trade_records (
      symbol, direction, open_time, close_time, pnl,
      open_quality, close_quality, take_profit_quality,
      stop_loss_quality, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.symbol,
    input.direction,
    input.open_time,
    input.close_time,
    input.pnl,
    input.open_quality,
    input.close_quality,
    input.take_profit_quality,
    input.stop_loss_quality,
    input.note || null,
    now,
    now
  );

  res.json(success(getRow(Number(result.lastInsertRowid))!));
});

tradesRouter.put("/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!isPositiveInteger(id)) {
    res.status(400).json(failure("记录 ID 不正确"));
    return;
  }

  if (!getRow(id)) {
    res.status(404).json(failure("交易记录不存在"));
    return;
  }

  let input: TradeInput;

  try {
    input = readInput(req.body);
  } catch (error) {
    res.status(400).json(
      failure(error instanceof Error ? error.message : "参数不正确")
    );
    return;
  }

  db.prepare(`
    UPDATE trade_records
    SET symbol = ?, direction = ?, open_time = ?, close_time = ?,
        pnl = ?, open_quality = ?, close_quality = ?,
        take_profit_quality = ?, stop_loss_quality = ?,
        note = ?, updated_at = ?
    WHERE id = ?
  `).run(
    input.symbol,
    input.direction,
    input.open_time,
    input.close_time,
    input.pnl,
    input.open_quality,
    input.close_quality,
    input.take_profit_quality,
    input.stop_loss_quality,
    input.note || null,
    Date.now(),
    id
  );

  res.json(success(getRow(id)!));
});

tradesRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!isPositiveInteger(id)) {
    res.status(400).json(failure("记录 ID 不正确"));
    return;
  }

  if (!getRow(id)) {
    res.status(404).json(failure("交易记录不存在"));
    return;
  }

  db.prepare("DELETE FROM trade_records WHERE id = ?").run(id);
  res.json(success({ id }));
});
