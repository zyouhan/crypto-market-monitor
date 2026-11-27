import { Router } from "express";

import { db } from "../../db";
import {
  buildSelfCheckSnapshot,
  SELF_CHECK_INTERVALS,
  type SelfCheckIntervalSnapshot
} from "../../monitors/self-check-snapshot";
import { findSelfCheckScenario } from "../../monitors/self-check-scenarios";
import {
  evaluateExecutionResult,
  type TradeQuality
} from "../../trades/execution-result";
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
  scenario: string | null;
  stop_condition: string;
  snapshot_json: string | null;
  status: SelfCheckStatus;
  result: SelfCheckResult | null;
  close_note: string | null;
  closed_at: number | null;
  created_at: number;
  updated_at: number;
  trade_id?: number | null;
  trade_pnl?: number | null;
  trade_open_quality?: TradeQuality | null;
  trade_close_quality?: TradeQuality | null;
  trade_take_profit_quality?: TradeQuality | null;
  trade_stop_loss_quality?: TradeQuality | null;
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
  scenario: string | null;
  stopCondition: string;
  note: string;
} {
  const input =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const symbol =
    typeof input.symbol === "string"
      ? input.symbol.trim().toUpperCase()
      : "";
  const requestedDirection =
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
  const note =
    typeof input.note === "string"
      ? input.note.trim()
      : "";
  const scenarioDefinition = findSelfCheckScenario(input.scenario);

  if (!/^[A-Z0-9]{2,30}$/.test(symbol)) {
    throw new Error("标的不正确");
  }

  if (typeof input.scenario === "string" && input.scenario) {
    if (!scenarioDefinition) {
      throw new Error("做单场景不正确");
    }

    if (
      requestedDirection &&
      requestedDirection !== scenarioDefinition.direction
    ) {
      throw new Error("做单场景与方向不一致");
    }
  }

  const direction =
    scenarioDefinition?.direction ?? requestedDirection;

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

  if (note.length > MAX_NOTE_LENGTH) {
    throw new Error(`备注不能超过 ${MAX_NOTE_LENGTH} 个字符`);
  }

  return {
    symbol,
    direction,
    targetInterval,
    scenario: scenarioDefinition?.value ?? null,
    stopCondition,
    note
  };
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

function closeQuality(value: unknown): TradeQuality | null {
  return value === "excellent" ||
    value === "good" ||
    value === "fair" ||
    value === "poor"
    ? value
    : null;
}

function readCloseInput(body: unknown): {
  pnl: number;
  openQuality: TradeQuality;
  closeQuality: TradeQuality;
  takeProfitQuality: TradeQuality;
  stopLossQuality: TradeQuality;
  note: string;
} {
  const input =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const pnl = Number(input.pnl);
  const openQuality = closeQuality(input.open_quality);
  const closeQualityValue = closeQuality(input.close_quality);
  const takeProfitQuality = closeQuality(
    input.take_profit_quality
  );
  const stopLossQuality = closeQuality(input.stop_loss_quality);
  const note =
    typeof input.note === "string" ? input.note.trim() : "";

  if (!Number.isFinite(pnl)) {
    throw new Error("收益必须是有效数字");
  }

  if (
    !openQuality ||
    !closeQualityValue ||
    !takeProfitQuality ||
    !stopLossQuality
  ) {
    throw new Error("请完成四项操作评价");
  }

  if (note.length > MAX_NOTE_LENGTH) {
    throw new Error("备注不能超过 1000 个字符");
  }

  return {
    pnl,
    openQuality,
    closeQuality: closeQualityValue,
    takeProfitQuality,
    stopLossQuality,
    note
  };
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

selfChecksRouter.get("/preview", async (req, res) => {
  const symbol =
    typeof req.query.symbol === "string"
      ? req.query.symbol.trim().toUpperCase()
      : "";

  if (!/^[A-Z0-9]{2,30}$/.test(symbol)) {
    res.status(400).json(failure("标的不正确"));
    return;
  }

  try {
    const snapshot = await buildSelfCheckSnapshot(symbol);

    res.json(success({ symbol, snapshot }));
  } catch (error) {
    res.status(500).json(
      failure(
        error instanceof Error ? error.message : "行情分析失败"
      )
    );
  }
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
    whereParts.push("s.symbol LIKE ?");
    params.push(`%${symbol}%`);
  }

  if (result) {
    whereParts.push("s.result = ?");
    params.push(result);
  }

  const where =
    whereParts.length > 0
      ? `WHERE ${whereParts.join(" AND ")}`
      : "";
  const totalRow = db.prepare(`
    SELECT COUNT(1) AS count
    FROM self_checks s
    ${where}
  `).get(...params) as { count: number };
  const totalPages = Math.max(1, Math.ceil(totalRow.count / limit));
  const currentPage = Math.min(page, totalPages);
  const rows = db.prepare(`
    SELECT
      s.*,
      t.id AS trade_id,
      t.pnl AS trade_pnl,
      t.open_quality AS trade_open_quality,
      t.close_quality AS trade_close_quality,
      t.take_profit_quality AS trade_take_profit_quality,
      t.stop_loss_quality AS trade_stop_loss_quality
    FROM self_checks s
    LEFT JOIN trade_records t ON t.self_check_id = s.id
    ${where}
    ORDER BY s.created_at DESC, s.id DESC
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
      symbol, direction, target_interval, scenario, stop_condition,
      close_note, snapshot_json, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).run(
    input.symbol,
    input.direction,
    input.targetInterval,
    input.scenario,
    input.stopCondition,
    input.note || null,
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

  const note =
    typeof req.body?.note === "string"
      ? req.body.note.trim()
      : row.close_note ?? "";

  if (note.length > MAX_NOTE_LENGTH) {
    res.status(400).json(failure("备注不能超过 1000 个字符"));
    return;
  }

  db.prepare(`
    UPDATE self_checks
    SET stop_condition = ?, close_note = ?, updated_at = ?
    WHERE id = ?
  `).run(
    stopCondition,
    note || null,
    Date.now(),
    id
  );

  res.json(success(toView(getRow(id)!), "止损和备注已更新"));
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

  db.transaction(() => {
    db.prepare(
      "DELETE FROM trade_records WHERE self_check_id = ?"
    ).run(id);
    db.prepare("DELETE FROM self_checks WHERE id = ?").run(id);
  })();

  res.json(success({ id }, "开单记录及对应交易记录已删除"));
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

  const input = (() => {
    try {
      return readCloseInput(req.body);
    } catch (error) {
      res.status(400).json(
        failure(
          error instanceof Error ? error.message : "参数不正确"
        )
      );
      return null;
    }
  })();

  if (!input) {
    return;
  }

  const result = evaluateExecutionResult([
    input.openQuality,
    input.closeQuality,
    input.takeProfitQuality,
    input.stopLossQuality
  ]);
  const now = Date.now();

  try {
    db.transaction(() => {
      const updated = db.prepare(`
        UPDATE self_checks
        SET status = 'closed', result = ?, close_note = ?,
            closed_at = ?, updated_at = ?
        WHERE id = ? AND status = 'active'
      `).run(
        result,
        input.note || null,
        now,
        now,
        id
      );

      if (updated.changes !== 1) {
        throw new Error("该开单已经关闭");
      }

      db.prepare(`
        INSERT INTO trade_records (
          symbol, direction, open_time, close_time, pnl,
          open_quality, close_quality, take_profit_quality,
          stop_loss_quality, note, self_check_id,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.symbol,
        row.direction,
        row.created_at,
        now,
        input.pnl,
        input.openQuality,
        input.closeQuality,
        input.takeProfitQuality,
        input.stopLossQuality,
        input.note || null,
        id,
        now,
        now
      );
    })();
  } catch (error) {
    res.status(400).json(
      failure(
        error instanceof Error ? error.message : "关闭开单失败"
      )
    );
    return;
  }

  const trade = db.prepare(`
    SELECT *
    FROM trade_records
    WHERE self_check_id = ?
  `).get(id);

  res.json(
    success(
      {
        self_check: toView(getRow(id)!),
        trade
      },
      "开单自查已关闭并生成交易记录"
    )
  );
});
