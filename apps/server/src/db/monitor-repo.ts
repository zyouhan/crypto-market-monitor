import { db } from "./index";
import type {
  ConditionKind,
  ConditionRole,
  MonitorConditionRecord,
  MonitorRecord,
  MonitorSignalRecord,
  NewMonitorSignalRecord,
  PushState,
  SignalDirection
} from "./types";

export interface StopWatchRecord {
  id: number;
  signal_id: number;
  monitor_id: number | null;
  interval: string | null;
  direction: SignalDirection;
  entry_price: number;
  entry_time: number;
  stop_price: number;
  status: "ACTIVE" | "HIT" | "CANCELLED";
  created_at: number;
  hit_at: number | null;
  hit_price: number | null;
  hit_signal_id: number | null;
  max_price: number | null;
  min_price: number | null;
  max_favorable_r: number;
  max_adverse_r: number;
  last_checked_time: number | null;
  alerted_1r: number;
  alerted_breakeven: number;
}

export type TradeActionKind =
  | "T_LONG"
  | "T_SHORT"
  | "CLOSE";

export interface TradeActionRecord {
  id: number;
  monitor_id: number | null;
  signal_id: number | null;
  action: TradeActionKind;
  price: number;
  note: string | null;
  created_at: number;
}

export function getMonitors(): MonitorRecord[] {
  return db.prepare(`
    SELECT *
    FROM monitors
    ORDER BY id ASC
  `).all() as MonitorRecord[];
}

export function getEnabledMonitors(): MonitorRecord[] {
  return db.prepare(`
    SELECT *
    FROM monitors
    WHERE enabled = 1
    ORDER BY id ASC
  `).all() as MonitorRecord[];
}

export function getMonitorById(
  id: number
): MonitorRecord | undefined {
  return db.prepare(`
    SELECT *
    FROM monitors
    WHERE id = ?
  `).get(id) as MonitorRecord | undefined;
}

export function getMonitorConditions(
  monitorId: number
): MonitorConditionRecord[] {
  return db.prepare(`
    SELECT *
    FROM monitor_conditions
    WHERE monitor_id = ?
    ORDER BY sort_order ASC, id ASC
  `).all(monitorId) as MonitorConditionRecord[];
}

export function getAllMonitorConditions(): MonitorConditionRecord[] {
  return db.prepare(`
    SELECT *
    FROM monitor_conditions
    ORDER BY monitor_id ASC, sort_order ASC, id ASC
  `).all() as MonitorConditionRecord[];
}

export function insertMonitor(input: {
  name: string;
  symbol: string;
  interval: string;
  enabled: number;
  wechatEnabled: number;
  soundEnabled: number;
  presetId?: string | null;
  presetName?: string | null;
  trackStats?: number;
  referenceIntervals?: string;
}): number {
  const now = Date.now();

  const result = db.prepare(`
    INSERT INTO monitors (
      name,
      symbol,
      interval,
      preset_id,
      preset_name,
      track_stats,
      reference_intervals,
      enabled,
      wechat_enabled,
      sound_enabled,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.name,
    input.symbol,
    input.interval,
    input.presetId ?? null,
    input.presetName ?? null,
    input.trackStats ?? 0,
    input.referenceIntervals ?? "[]",
    input.enabled,
    input.wechatEnabled,
    input.soundEnabled,
    now,
    now
  );

  return Number(result.lastInsertRowid);
}

export function insertCondition(input: {
  monitorId: number;
  kind: ConditionKind;
  role: ConditionRole;
  interval: string | null;
  params: string;
  sortOrder: number;
}): number {
  const now = Date.now();

  const result = db.prepare(`
    INSERT INTO monitor_conditions (
      monitor_id,
      kind,
      role,
      interval,
      params,
      sort_order,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.monitorId,
    input.kind,
    input.role,
    input.interval,
    input.params,
    input.sortOrder,
    now,
    now
  );

  return Number(result.lastInsertRowid);
}

export function updateMonitorFields(input: {
  id: number;
  name: string;
  interval: string;
  enabled: number;
  wechatEnabled: number;
  soundEnabled: number;
  trackStats: number;
  referenceIntervals: string;
  presetId: string | null;
  presetName: string | null;
}): void {
  db.prepare(`
    UPDATE monitors
    SET
      name = ?,
      interval = ?,
      preset_id = ?,
      preset_name = ?,
      enabled = ?,
      wechat_enabled = ?,
      sound_enabled = ?,
      track_stats = ?,
      reference_intervals = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    input.name,
    input.interval,
    input.presetId,
    input.presetName,
    input.enabled,
    input.wechatEnabled,
    input.soundEnabled,
    input.trackStats,
    input.referenceIntervals,
    Date.now(),
    input.id
  );
}

export function deleteMonitorConditions(monitorId: number): void {
  db.prepare(`
    DELETE FROM monitor_conditions
    WHERE monitor_id = ?
  `).run(monitorId);
}

export function resetMonitorState(monitorId: number): void {
  const now = Date.now();

  db.prepare(`
    UPDATE monitors
    SET
      last_processed_close_time = 0,
      snapshot = NULL,
      updated_at = ?
    WHERE id = ?
  `).run(now, monitorId);

  db.prepare(`
    UPDATE monitor_conditions
    SET
      state = NULL,
      last_processed_close_time = 0,
      state_updated_at = NULL,
      updated_at = ?
    WHERE monitor_id = ?
  `).run(now, monitorId);
}

export function deleteMonitor(id: number): number {
  return db.prepare(`
    DELETE FROM monitors
    WHERE id = ?
  `).run(id).changes;
}

export function updateMonitorProgress(input: {
  id: number;
  lastPrice: number;
  lastPriceTime: number;
  lastProcessedCloseTime: number;
  source: string | null;
  sourceNote: string | null;
  snapshot: string;
  successAt: number;
}): void {
  db.prepare(`
    UPDATE monitors
    SET
      last_price = ?,
      last_price_time = ?,
      last_processed_close_time = ?,
      source = ?,
      source_note = ?,
      snapshot = ?,
      last_attempt_at = ?,
      last_success_at = ?,
      last_error = NULL,
      last_error_at = NULL,
      updated_at = ?
    WHERE id = ?
  `).run(
    input.lastPrice,
    input.lastPriceTime,
    input.lastProcessedCloseTime,
    input.source,
    input.sourceNote,
    input.snapshot,
    input.successAt,
    input.successAt,
    input.successAt,
    input.id
  );
}

export function updateMonitorSnapshot(input: {
  id: number;
  lastPrice: number | null;
  lastPriceTime: number | null;
  source: string | null;
  sourceNote: string | null;
  snapshot: string;
  successAt: number;
}): void {
  db.prepare(`
    UPDATE monitors
    SET
      last_price = ?,
      last_price_time = ?,
      source = ?,
      source_note = ?,
      snapshot = ?,
      last_attempt_at = ?,
      last_success_at = ?,
      last_error = NULL,
      last_error_at = NULL,
      updated_at = ?
    WHERE id = ?
  `).run(
    input.lastPrice,
    input.lastPriceTime,
    input.source,
    input.sourceNote,
    input.snapshot,
    input.successAt,
    input.successAt,
    input.successAt,
    input.id
  );
}

export function updateMonitorError(input: {
  id: number;
  message: string;
  at: number;
}): void {
  db.prepare(`
    UPDATE monitors
    SET
      last_attempt_at = ?,
      last_error = ?,
      last_error_at = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    input.at,
    input.message.slice(0, 1000),
    input.at,
    input.at,
    input.id
  );
}

export function updateConditionState(input: {
  id: number;
  state: string;
  lastProcessedCloseTime: number;
  updatedAt: number;
}): void {
  db.prepare(`
    UPDATE monitor_conditions
    SET
      state = ?,
      last_processed_close_time = ?,
      state_updated_at = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    input.state,
    input.lastProcessedCloseTime,
    input.updatedAt,
    input.updatedAt,
    input.id
  );
}

export function insertSignalIgnore(
  input: NewMonitorSignalRecord
): number | null {
  const result = db.prepare(`
    INSERT OR IGNORE INTO signals (
      monitor_id,
      monitor_name,
      preset_id,
      preset_name,
      track_stats,
      stats_deleted,
      reference_trends,
      symbol,
      interval,
      kind,
      event_type,
      direction,
      price,
      event_time,
      primary_condition,
      conditions,
      source,
      threshold,
      price_diff,
      ema_diff,
      trigger_met,
      push_state,
      reason,
      payload,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.monitor_id,
    input.monitor_name,
    input.preset_id,
    input.preset_name,
    input.track_stats,
    input.stats_deleted,
    input.reference_trends,
    input.symbol,
    input.interval,
    input.kind,
    input.event_type,
    input.direction,
    input.price,
    input.event_time,
    input.primary_condition,
    input.conditions,
    input.source,
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

export function createStopWatch(input: {
  signalId: number;
  monitorId: number;
  interval: string;
  direction: SignalDirection;
  entryPrice: number;
  entryTime: number;
  stopPrice: number;
}): void {
  db.prepare(`
    INSERT OR IGNORE INTO stop_watches (
      signal_id,
      monitor_id,
      interval,
      direction,
      entry_price,
      entry_time,
      stop_price,
      status,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
  `).run(
    input.signalId,
    input.monitorId,
    input.interval,
    input.direction,
    input.entryPrice,
    input.entryTime,
    input.stopPrice,
    Date.now()
  );
}

export function getActiveStopWatches(
  monitorId: number
): StopWatchRecord[] {
  return db.prepare(`
    SELECT *
    FROM stop_watches
    WHERE monitor_id = ? AND status = 'ACTIVE'
    ORDER BY id ASC
  `).all(monitorId) as StopWatchRecord[];
}

export function markStopWatchHit(input: {
  id: number;
  hitAt: number;
  hitPrice: number;
  hitSignalId: number;
}): void {
  db.prepare(`
    UPDATE stop_watches
    SET
      status = 'HIT',
      hit_at = ?,
      hit_price = ?,
      hit_signal_id = ?
    WHERE id = ? AND status = 'ACTIVE'
  `).run(
    input.hitAt,
    input.hitPrice,
    input.hitSignalId,
    input.id
  );
}

export function updateStopWatchProgress(input: {
  id: number;
  maxPrice: number | null;
  minPrice: number | null;
  maxFavorableR: number;
  maxAdverseR: number;
  lastCheckedTime: number | null;
}): void {
  db.prepare(`
    UPDATE stop_watches
    SET
      max_price = ?,
      min_price = ?,
      max_favorable_r = ?,
      max_adverse_r = ?,
      last_checked_time = ?
    WHERE id = ? AND status = 'ACTIVE'
  `).run(
    input.maxPrice,
    input.minPrice,
    input.maxFavorableR,
    input.maxAdverseR,
    input.lastCheckedTime,
    input.id
  );
}

export function markStopWatchAlert(input: {
  id: number;
  oneR?: boolean;
  breakeven?: boolean;
}): void {
  db.prepare(`
    UPDATE stop_watches
    SET
      alerted_1r = MAX(alerted_1r, ?),
      alerted_breakeven = MAX(alerted_breakeven, ?)
    WHERE id = ?
  `).run(
    input.oneR ? 1 : 0,
    input.breakeven ? 1 : 0,
    input.id
  );
}

export function cancelStopWatchesForMonitor(
  monitorId: number
): void {
  db.prepare(`
    UPDATE stop_watches
    SET status = 'CANCELLED'
    WHERE monitor_id = ? AND status = 'ACTIVE'
  `).run(monitorId);
}

export function cancelStopWatchesForDirection(
  monitorId: number,
  direction: SignalDirection
): void {
  db.prepare(`
    UPDATE stop_watches
    SET status = 'CANCELLED'
    WHERE
      monitor_id = ?
      AND direction = ?
      AND status = 'ACTIVE'
  `).run(monitorId, direction);
}

export function insertTradeAction(input: {
  monitorId: number;
  signalId: number | null;
  action: TradeActionKind;
  price: number;
  note?: string | null;
}): number {
  const result = db.prepare(`
    INSERT INTO trade_actions (
      monitor_id,
      signal_id,
      action,
      price,
      note,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    input.monitorId,
    input.signalId,
    input.action,
    input.price,
    input.note ?? null,
    Date.now()
  );

  return Number(result.lastInsertRowid);
}

export function getRecentTradeActions(
  monitorId: number,
  limit = 20
): TradeActionRecord[] {
  return db.prepare(`
    SELECT *
    FROM trade_actions
    WHERE monitor_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(monitorId, limit) as TradeActionRecord[];
}

export function getSignalById(
  id: number
): MonitorSignalRecord | undefined {
  return db.prepare(`
    SELECT *
    FROM signals
    WHERE id = ?
  `).get(id) as MonitorSignalRecord | undefined;
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
  interval?: string;
  monitorId?: number;
  eventType?: string;
  triggeredOnly?: boolean;
}): MonitorSignalRecord[] {
  const conditions: string[] = [];
  const parameters: unknown[] = [];

  if (filter.symbol) {
    conditions.push("symbol = ?");
    parameters.push(filter.symbol);
  }

  if (filter.interval) {
    conditions.push("interval = ?");
    parameters.push(filter.interval);
  }

  if (filter.monitorId !== undefined) {
    conditions.push("monitor_id = ?");
    parameters.push(filter.monitorId);
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
  ) as MonitorSignalRecord[];
}

export function getLastSignalByMonitor(
  monitorId: number
): MonitorSignalRecord | undefined {
  return db.prepare(`
    SELECT *
    FROM signals
    WHERE monitor_id = ?
    ORDER BY event_time DESC, id DESC
    LIMIT 1
  `).get(monitorId) as MonitorSignalRecord | undefined;
}

export function getRecentSignalsByMonitor(
  monitorId: number,
  limit = 5
): MonitorSignalRecord[] {
  return db.prepare(`
    SELECT *
    FROM signals
    WHERE monitor_id = ?
    ORDER BY event_time DESC, id DESC
    LIMIT ?
  `).all(monitorId, limit) as MonitorSignalRecord[];
}
