import { db } from "./index";
import type {
  CrossType,
  NewSignalRecord,
  PushState,
  SignalEventType,
  SignalRecord,
  StrategyKind,
  StrategyRecord,
  StrategyStateRecord,
  SymbolRecord
} from "./types";

export function getSymbols(): SymbolRecord[] {
  return db.prepare(`
    SELECT *
    FROM symbols
    ORDER BY id ASC
  `).all() as SymbolRecord[];
}

export function getEnabledSymbols(): SymbolRecord[] {
  return db.prepare(`
    SELECT *
    FROM symbols
    WHERE enabled = 1
    ORDER BY id ASC
  `).all() as SymbolRecord[];
}

export function getSymbolById(
  id: number
): SymbolRecord | undefined {
  return db.prepare(`
    SELECT *
    FROM symbols
    WHERE id = ?
  `).get(id) as SymbolRecord | undefined;
}

export function getSymbolByName(
  symbol: string
): SymbolRecord | undefined {
  return db.prepare(`
    SELECT *
    FROM symbols
    WHERE symbol = ?
  `).get(symbol) as SymbolRecord | undefined;
}

export function insertSymbol(input: {
  symbol: string;
  interval: string;
  enabled: number;
  notify_enabled: number;
}): SymbolRecord {
  const now = Date.now();

  const result = db.prepare(`
    INSERT INTO symbols (
      symbol,
      interval,
      enabled,
      notify_enabled,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    input.symbol,
    input.interval,
    input.enabled,
    input.notify_enabled,
    now,
    now
  );

  const row = getSymbolById(Number(result.lastInsertRowid));

  if (!row) {
    throw new Error("创建标的后无法读取记录");
  }

  return row;
}

export function updateSymbolFields(
  id: number,
  input: {
    interval: string;
    enabled: number;
    notify_enabled: number;
  }
): void {
  db.prepare(`
    UPDATE symbols
    SET
      interval = ?,
      enabled = ?,
      notify_enabled = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    input.interval,
    input.enabled,
    input.notify_enabled,
    Date.now(),
    id
  );
}

export function updateSymbolProgress(
  id: number,
  input: {
    lastPrice: number;
    lastPriceTime: number;
    lastProcessedCloseTime: number;
  }
): void {
  db.prepare(`
    UPDATE symbols
    SET
      last_price = ?,
      last_price_time = ?,
      last_processed_close_time = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    input.lastPrice,
    input.lastPriceTime,
    input.lastProcessedCloseTime,
    Date.now(),
    id
  );
}

export function deleteSymbol(id: number): number {
  return db.prepare(`
    DELETE FROM symbols
    WHERE id = ?
  `).run(id).changes;
}

/**
 * 清空该标的全部策略状态并重置处理进度。
 * 下一轮 worker 会静默重新预热，不补发历史信号。
 */
export function resetSymbolState(symbolId: number): void {
  const now = Date.now();

  db.prepare(`
    DELETE FROM strategy_states
    WHERE symbol_id = ?
  `).run(symbolId);

  db.prepare(`
    UPDATE symbols
    SET
      last_processed_close_time = 0,
      updated_at = ?
    WHERE id = ?
  `).run(now, symbolId);
}

export function getAllStrategies(): StrategyRecord[] {
  return db.prepare(`
    SELECT *
    FROM strategies
    ORDER BY symbol_id ASC, sort_order ASC
  `).all() as StrategyRecord[];
}

export function getStrategiesBySymbol(
  symbolId: number
): StrategyRecord[] {
  return db.prepare(`
    SELECT *
    FROM strategies
    WHERE symbol_id = ?
    ORDER BY sort_order ASC, id ASC
  `).all(symbolId) as StrategyRecord[];
}

export function getStrategy(
  symbolId: number,
  kind: StrategyKind
): StrategyRecord | undefined {
  return db.prepare(`
    SELECT *
    FROM strategies
    WHERE symbol_id = ? AND kind = ?
  `).get(symbolId, kind) as StrategyRecord | undefined;
}

export function insertStrategy(input: {
  symbolId: number;
  kind: StrategyKind;
  enabled: number;
  notify_enabled: number;
  params: string;
  sortOrder: number;
}): void {
  const now = Date.now();

  db.prepare(`
    INSERT OR IGNORE INTO strategies (
      symbol_id,
      kind,
      enabled,
      notify_enabled,
      params,
      sort_order,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.symbolId,
    input.kind,
    input.enabled,
    input.notify_enabled,
    input.params,
    input.sortOrder,
    now,
    now
  );
}

export function updateStrategy(input: {
  symbolId: number;
  kind: StrategyKind;
  enabled: number;
  notify_enabled: number;
  params: string;
}): void {
  db.prepare(`
    UPDATE strategies
    SET
      enabled = ?,
      notify_enabled = ?,
      params = ?,
      updated_at = ?
    WHERE symbol_id = ? AND kind = ?
  `).run(
    input.enabled,
    input.notify_enabled,
    input.params,
    Date.now(),
    input.symbolId,
    input.kind
  );
}

export function getStatesBySymbol(
  symbolId: number
): StrategyStateRecord[] {
  return db.prepare(`
    SELECT *
    FROM strategy_states
    WHERE symbol_id = ?
  `).all(symbolId) as StrategyStateRecord[];
}

export function getAllStates(): StrategyStateRecord[] {
  return db.prepare(`
    SELECT *
    FROM strategy_states
  `).all() as StrategyStateRecord[];
}

export function getState(
  symbolId: number,
  kind: StrategyKind
): StrategyStateRecord | undefined {
  return db.prepare(`
    SELECT *
    FROM strategy_states
    WHERE symbol_id = ? AND kind = ?
  `).get(symbolId, kind) as StrategyStateRecord | undefined;
}

export function upsertState(input: {
  symbolId: number;
  kind: StrategyKind;
  status: string;
  baselineType: CrossType | null;
  baselinePrice: number | null;
  baselineEma: number | null;
  baselineTime: number | null;
  extra: string;
}): void {
  db.prepare(`
    INSERT INTO strategy_states (
      symbol_id,
      kind,
      status,
      baseline_type,
      baseline_price,
      baseline_ema,
      baseline_time,
      extra,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol_id, kind) DO UPDATE SET
      status = excluded.status,
      baseline_type = excluded.baseline_type,
      baseline_price = excluded.baseline_price,
      baseline_ema = excluded.baseline_ema,
      baseline_time = excluded.baseline_time,
      extra = excluded.extra,
      updated_at = excluded.updated_at
  `).run(
    input.symbolId,
    input.kind,
    input.status,
    input.baselineType,
    input.baselinePrice,
    input.baselineEma,
    input.baselineTime,
    input.extra,
    Date.now()
  );
}

/**
 * 写入信号；唯一键冲突时返回 null。
 */
export function insertSignalIgnore(
  input: NewSignalRecord
): number | null {
  const result = db.prepare(`
    INSERT OR IGNORE INTO signals (
      symbol_id,
      symbol,
      interval,
      kind,
      event_type,
      direction,
      price,
      event_time,
      threshold,
      price_diff,
      ema_diff,
      trigger_met,
      push_state,
      reason,
      payload,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.symbol_id,
    input.symbol,
    input.interval,
    input.kind,
    input.event_type,
    input.direction,
    input.price,
    input.event_time,
    input.threshold,
    input.price_diff,
    input.ema_diff,
    input.trigger_met,
    input.push_state,
    input.reason,
    input.payload,
    input.created_at
  );

  if (result.changes === 0) {
    return null;
  }

  return Number(result.lastInsertRowid);
}

export function getSignalById(
  id: number
): SignalRecord | undefined {
  return db.prepare(`
    SELECT *
    FROM signals
    WHERE id = ?
  `).get(id) as SignalRecord | undefined;
}

export function updateSignalPush(input: {
  id: number;
  pushState: PushState;
  pushError: string | null;
  reason: string | null;
}): void {
  db.prepare(`
    UPDATE signals
    SET
      push_state = ?,
      push_error = ?,
      reason = ?
    WHERE id = ?
  `).run(
    input.pushState,
    input.pushError,
    input.reason,
    input.id
  );
}

export function getSignals(filter: {
  limit: number;
  offset: number;
  symbol?: string;
  kind?: StrategyKind;
  eventType?: SignalEventType;
  triggeredOnly?: boolean;
}): SignalRecord[] {
  const conditions: string[] = [];
  const parameters: unknown[] = [];

  if (filter.symbol) {
    conditions.push("symbol = ?");
    parameters.push(filter.symbol);
  }

  if (filter.kind) {
    conditions.push("kind = ?");
    parameters.push(filter.kind);
  }

  if (filter.eventType) {
    conditions.push("event_type = ?");
    parameters.push(filter.eventType);
  }

  if (filter.triggeredOnly) {
    conditions.push("trigger_met = 1");
  }

  const where =
    conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

  return db.prepare(`
    SELECT *
    FROM signals
    ${where}
    ORDER BY event_time DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(
    ...parameters,
    filter.limit,
    filter.offset
  ) as SignalRecord[];
}

export function getSetting(key: string): string | undefined {
  const result = db.prepare(`
    SELECT value
    FROM settings
    WHERE key = ?
  `).get(key) as { value: string } | undefined;

  return result?.value;
}

export function setSetting(key: string, value: string): void {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(key, value, Date.now());
}

export { db };
