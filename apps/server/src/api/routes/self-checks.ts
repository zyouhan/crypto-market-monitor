import { Router } from "express";

import { db } from "../../db";
import {
  buildSelfCheckSnapshot,
  SELF_CHECK_INTERVALS,
  type SelfCheckIntervalSnapshot
} from "../../monitors/self-check-snapshot";
import {
  failure,
  isPositiveInteger,
  success
} from "../middleware";

export const selfChecksRouter: Router = Router();

type SelfCheckDirection = "BULL" | "BEAR";
type SelfCheckStatus = "active" | "closed";
type SelfCheckResult = "success" | "failed";

interface SelfCheckRow {
  id: number;
  symbol: string;
  direction: SelfCheckDirection;
  target_interval: string;
  stop_condition: string;
  snapshot_json: string | null;
  status: SelfCheckStatus;
  result: SelfCheckResult | null;
  close_note: string | null;
  closed_at: number | null;
  created_at: number;
  updated_at: number;
}

const MAX_ACTIVE = 2;
const MAX_STOP_LENGTH = 1000;
const MAX_NOTE_LENGTH = 1000;
const MAX_PAGE_SIZE = 100;

function parseSnapshot(
  raw: string | null
): SelfCheckIntervalSnapshot[] | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    return Array.isArray(parsed)
      ? (parsed as SelfCheckIntervalSnapshot[])
      : null;
  } catch {
    return null;
  }
}

function toView(row: SelfCheckRow) {
  return {
    ...row,
    snapshot: parseSnapshot(row.snapshot_json)
  };
}

function readCreateInput(body: unknown): {
  symbol: string;
  direction: SelfCheckDirection;
  targetInterval: string;
  stopCondition: string;
} {
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
  const targetInterval =
    typeof input.target_interval === "string"
      ? input.target_interval
      : "";
  const stopCondition =
    typeof input.stop_condition === "string"
      ? input.stop_condition.trim()
      : "";

  if (!/^[A-Z0-9]{2,30}$/.test(symbol)) {
    throw new Error("标的不正确");
  }

  if (!direction) {
    throw new Error("开单方向不正确");
  }

  if (
    !(SELF_CHECK_INTERVALS as readonly string[]).includes(
      targetInterval
    )
  ) {
    throw new Error("目标级别不正确");
  }

  if (!stopCondition) {
    throw new Error("请填写止损条件");
  }

  if (stopCondition.length > MAX_STOP_LENGTH) {
    throw new Error(`止损条件不能超过 ${MAX_STOP_LENGTH} 个字符`);
  }

  return { symbol, direction, targetInterval, stopCondition };
}

function getRow(id: number): SelfCheckRow | null {
  return (
    (db.prepare(`
      SELECT *
      FROM self_checks
      WHERE id = ?
    `).get(id) as SelfCheckRow | undefined) ?? null
  );
}

function listActive(): SelfCheckRow[] {
  return db.prepare(`
    SELECT *
    FROM self_checks
    WHERE status = 'active'
    ORDER BY created_at DESC, id DESC
  `).all() as SelfCheckRow[];
}

selfChecksRouter.get("/", (_req, res) => {
  res.json(success(listActive().map(toView)));
});

selfChecksRouter.get("/live", async (_req, res) => {
  const rows = listActive();
  const symbols = Array.from(new Set(rows.map((row) => row.symbol)));
  const snapshots = new Map<string, SelfCheckIntervalSnapshot[]>();

  await Promise.all(
    symbols.map(async (symbol) => {
      snapshots.set(symbol, await buildSelfCheckSnapshot(symbol));
    })
  );

  res.json(
    success(
      rows.map((row) => ({
        ...toView(row),
        live: snapshots.get(row.symbol) ?? null
      }))
    )
  );
});

selfChecksRouter.get("/records", (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(
    Math.max(Number(req.query.limit) || 20, 1),
    MAX_PAGE_SIZE
  );
  const symbol =
    typeof req.query.symbol === "string"
      ? req.query.symbol.trim().toUpperCase()
      : "";
  const result =
    req.query.result === "success" ||
    req.query.result === "failed"
      ? req.query.result
      : "";
  const whereParts: string[] = [];
  const params: Array<string | number> = [];

  if (symbol) {
    whereParts.push("symbol LIKE ?");
    params.push(`%${symbol}%`);
  }

  if (result) {
    whereParts.push("result = ?");
    params.push(result);
  }

  const where =
    whereParts.length > 0
      ? `WHERE ${whereParts.join(" AND ")}`
      : "";
  const totalRow = db.prepare(`
    SELECT COUNT(1) AS count
    FROM self_checks
    ${where}
  `).get(...params) as { count: number };
  const totalPages = Math.max(1, Math.ceil(totalRow.count / limit));
  const currentPage = Math.min(page, totalPages);
  const rows = db.prepare(`
    SELECT *
    FROM self_checks
    ${where}
    ORDER BY created_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(
    ...params,
    limit,
    (currentPage - 1) * limit
  ) as SelfCheckRow[];

  res.json(
    success({
      items: rows.map(toView),
      total: totalRow.count,
      page: currentPage,
      limit,
      total_pages: totalPages
    })
  );
});

selfChecksRouter.post("/", async (req, res) => {
  let input: ReturnType<typeof readCreateInput>;

  try {
    input = readCreateInput(req.body);
  } catch (error) {
    res.status(400).json(
      failure(error instanceof Error ? error.message : "参数不正确")
    );
    return;
  }

  const activeCount = db.prepare(`
    SELECT COUNT(1) AS count
    FROM self_checks
    WHERE status = 'active'
  `).get() as { count: number };

  if (activeCount.count >= MAX_ACTIVE) {
    res.status(400).json(
      failure("最多同时保留 2 条持仓中的开单自查")
    );
    return;
  }

  const snapshot = await buildSelfCheckSnapshot(input.symbol);
  const now = Date.now();
  const result = db.prepare(`
    INSERT INTO self_checks (
      symbol, direction, target_interval, stop_condition,
      snapshot_json, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
  `).run(
    input.symbol,
    input.direction,
    input.targetInterval,
    input.stopCondition,
    JSON.stringify(snapshot),
    now,
    now
  );

  res.json(
    success(toView(getRow(Number(result.lastInsertRowid))!), "开单自查已创建")
  );
});

selfChecksRouter.put("/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!isPositiveInteger(id)) {
    res.status(400).json(failure("记录 ID 不正确"));
    return;
  }

  const row = getRow(id);

  if (!row || row.status !== "active") {
    res.status(404).json(failure("持仓中的开单自查不存在"));
    return;
  }

  const stopCondition =
    typeof req.body?.stop_condition === "string"
      ? req.body.stop_condition.trim()
      : "";

  if (!stopCondition) {
    res.status(400).json(failure("请填写止损条件"));
    return;
  }

  if (stopCondition.length > MAX_STOP_LENGTH) {
    res.status(400).json(failure("止损条件过长"));
    return;
  }

  db.prepare(`
    UPDATE self_checks
    SET stop_condition = ?, updated_at = ?
    WHERE id = ?
  `).run(stopCondition, Date.now(), id);

  res.json(success(toView(getRow(id)!), "止损条件已更新"));
});

selfChecksRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!isPositiveInteger(id)) {
    res.status(400).json(failure("记录 ID 不正确"));
    return;
  }

  const row = getRow(id);

  if (!row) {
    res.status(404).json(failure("开单自查不存在"));
    return;
  }

  if (row.status === "active") {
    res.status(400).json(failure("持仓中的开单请先关闭"));
    return;
  }

  db.prepare("DELETE FROM self_checks WHERE id = ?").run(id);
  res.json(success({ id }, "开单记录已删除"));
});

selfChecksRouter.post("/:id/close", (req, res) => {
  const id = Number(req.params.id);

  if (!isPositiveInteger(id)) {
    res.status(400).json(failure("记录 ID 不正确"));
    return;
  }

  const row = getRow(id);

  if (!row) {
    res.status(404).json(failure("开单自查不存在"));
    return;
  }

  if (row.status !== "active") {
    res.status(400).json(failure("该开单已经关闭"));
    return;
  }

  const result =
    req.body?.result === "success" ||
    req.body?.result === "failed"
      ? req.body.result
      : null;
  const note =
    typeof req.body?.note === "string"
      ? req.body.note.trim()
      : "";

  if (!result) {
    res.status(400).json(failure("请选择成功或失败"));
    return;
  }

  if (note.length > MAX_NOTE_LENGTH) {
    res.status(400).json(failure("备注不能超过 1000 个字符"));
    return;
  }

  const now = Date.now();
  db.prepare(`
    UPDATE self_checks
    SET status = 'closed', result = ?, close_note = ?,
        closed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(result, note || null, now, now, id);

  res.json(success(toView(getRow(id)!), "开单自查已关闭"));
});
