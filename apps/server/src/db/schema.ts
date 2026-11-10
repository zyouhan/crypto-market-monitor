import type Database from "better-sqlite3";

export const SCHEMA_VERSION = 11;

/**
 * v5 表结构。
 *
 * 与 v4 的差异：
 * - monitors：一个监控项 = 标的 + 入场周期 + 条件集合；
 * - monitor_conditions：条件可指定自己的 K 线周期，角色为 trigger / filter；
 * - signals：按监测项记录，保存触发条件与各周期快照；
 * - 旧 symbols / strategies / strategy_states / signals_v4 仅保留用于迁移和回滚。
 */
const V5_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS monitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    interval TEXT NOT NULL,
    preset_id TEXT,
    preset_name TEXT,
    track_stats INTEGER NOT NULL DEFAULT 0,

    enabled INTEGER NOT NULL DEFAULT 1,
    wechat_enabled INTEGER NOT NULL DEFAULT 1,
    sound_enabled INTEGER NOT NULL DEFAULT 1,

    last_price REAL,
    last_price_time INTEGER,
    last_processed_close_time INTEGER NOT NULL DEFAULT 0,

    last_attempt_at INTEGER,
    last_success_at INTEGER,
    last_error TEXT,
    last_error_at INTEGER,

    source TEXT,
    source_note TEXT,
    snapshot TEXT,

    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_monitors_symbol_interval
    ON monitors(symbol, interval);

  CREATE INDEX IF NOT EXISTS idx_monitors_enabled
    ON monitors(enabled, interval);

  CREATE TABLE IF NOT EXISTS monitor_conditions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    monitor_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('trigger', 'filter')),
    interval TEXT,

    params TEXT NOT NULL DEFAULT '{}',
    state TEXT,
    last_processed_close_time INTEGER NOT NULL DEFAULT 0,
    state_updated_at INTEGER,

    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    FOREIGN KEY (monitor_id)
      REFERENCES monitors(id)
      ON DELETE CASCADE,

    UNIQUE(monitor_id, kind, interval, role)
  );

  CREATE INDEX IF NOT EXISTS idx_monitor_conditions_monitor
    ON monitor_conditions(monitor_id, sort_order, id);

  CREATE TABLE IF NOT EXISTS signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    monitor_id INTEGER,
    monitor_name TEXT,
    preset_id TEXT,
    preset_name TEXT,
    track_stats INTEGER NOT NULL DEFAULT 0,
    stats_deleted INTEGER NOT NULL DEFAULT 0,

    symbol TEXT NOT NULL,
    interval TEXT,

    kind TEXT NOT NULL DEFAULT 'MONITOR',
    event_type TEXT NOT NULL,
    direction TEXT,

    price REAL NOT NULL,
    event_time INTEGER NOT NULL,

    primary_condition TEXT,
    conditions TEXT,
    source TEXT,

    threshold REAL,
    price_diff REAL,
    ema_diff REAL,
    trigger_met INTEGER NOT NULL DEFAULT 0,

    push_state TEXT NOT NULL DEFAULT 'SKIPPED',
    push_error TEXT,
    reason TEXT,

    payload TEXT,
    created_at INTEGER NOT NULL,

    FOREIGN KEY (monitor_id)
      REFERENCES monitors(id)
      ON DELETE SET NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_signals_monitor_event
    ON signals(monitor_id, event_type, event_time);

  CREATE INDEX IF NOT EXISTS idx_signals_monitor_time
    ON signals(monitor_id, event_time DESC);

  CREATE INDEX IF NOT EXISTS idx_signals_interval_time
    ON signals(interval, event_time DESC);

  CREATE INDEX IF NOT EXISTS idx_signals_created_at
    ON signals(created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_signals_stats
    ON signals(track_stats, stats_deleted, event_type, event_time DESC);

  CREATE TABLE IF NOT EXISTS stop_watches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    signal_id INTEGER NOT NULL UNIQUE,
    monitor_id INTEGER,
    interval TEXT,

    direction TEXT NOT NULL,
    entry_price REAL NOT NULL,
    entry_time INTEGER NOT NULL,
    stop_price REAL NOT NULL,

    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at INTEGER NOT NULL,
    hit_at INTEGER,
    hit_price REAL,
    hit_signal_id INTEGER,

    max_price REAL,
    min_price REAL,
    max_favorable_r REAL NOT NULL DEFAULT 0,
    max_adverse_r REAL NOT NULL DEFAULT 0,
    last_checked_time INTEGER,
    alerted_1r INTEGER NOT NULL DEFAULT 0,
    alerted_breakeven INTEGER NOT NULL DEFAULT 0,

    FOREIGN KEY (signal_id)
      REFERENCES signals(id)
      ON DELETE CASCADE,

    FOREIGN KEY (monitor_id)
      REFERENCES monitors(id)
      ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_stop_watches_monitor_status
    ON stop_watches(monitor_id, status);

  CREATE TABLE IF NOT EXISTS trade_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monitor_id INTEGER,
    signal_id INTEGER,
    action TEXT NOT NULL,
    price REAL NOT NULL,
    note TEXT,
    created_at INTEGER NOT NULL,

    FOREIGN KEY (monitor_id)
      REFERENCES monitors(id)
      ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_trade_actions_monitor_time
    ON trade_actions(monitor_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;

export function applySchema(database: Database.Database): void {
  database.exec(V5_SCHEMA_SQL);
  database.pragma(`user_version = ${SCHEMA_VERSION}`);
}

export function hasColumn(
  database: Database.Database,
  table: string,
  column: string
): boolean {
  const columns = database.pragma(
    `table_info(${table})`
  ) as Array<{ name: string }>;

  return columns.some((item) => item.name === column);
}

export function tableExists(
  database: Database.Database,
  table: string
): boolean {
  const row = database
    .prepare(
      "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?"
    )
    .get(table) as { ok: number } | undefined;

  return row?.ok === 1;
}
