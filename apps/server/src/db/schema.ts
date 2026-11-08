import type Database from "better-sqlite3";

export const SCHEMA_VERSION = 2;

/**
 * v2 表结构。
 *
 * 与 v1 的差异：
 * - symbols 不再保存 EMA 参数与交叉状态，只保存标的、周期与运行进度；
 * - strategies 保存每个标的启用的策略与参数；
 * - strategy_states 保存各策略状态机状态；
 * - signals 取代 events，支持多指标、多类信号，唯一键加入 kind 与 event_type。
 */
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS symbols (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    symbol TEXT NOT NULL UNIQUE,
    interval TEXT NOT NULL DEFAULT '1m',

    enabled INTEGER NOT NULL DEFAULT 1,
    notify_enabled INTEGER NOT NULL DEFAULT 1,

    last_price REAL,
    last_price_time INTEGER,
    last_processed_close_time INTEGER NOT NULL DEFAULT 0,

    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS strategies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    symbol_id INTEGER NOT NULL,
    kind TEXT NOT NULL,

    enabled INTEGER NOT NULL DEFAULT 1,
    notify_enabled INTEGER NOT NULL DEFAULT 1,

    params TEXT NOT NULL DEFAULT '{}',
    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    FOREIGN KEY (symbol_id)
      REFERENCES symbols(id)
      ON DELETE CASCADE,

    UNIQUE(symbol_id, kind)
  );

  CREATE TABLE IF NOT EXISTS strategy_states (
    symbol_id INTEGER NOT NULL,
    kind TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'NEUTRAL',

    baseline_type TEXT,
    baseline_price REAL,
    baseline_time INTEGER,

    extra TEXT,
    updated_at INTEGER NOT NULL,

    PRIMARY KEY (symbol_id, kind),

    FOREIGN KEY (symbol_id)
      REFERENCES symbols(id)
      ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    symbol_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,

    kind TEXT NOT NULL,
    event_type TEXT NOT NULL,
    direction TEXT,

    price REAL NOT NULL,
    event_time INTEGER NOT NULL,

    threshold REAL,
    price_diff REAL,
    trigger_met INTEGER NOT NULL DEFAULT 0,

    push_state TEXT NOT NULL DEFAULT 'SKIPPED',
    push_error TEXT,
    reason TEXT,

    payload TEXT,
    created_at INTEGER NOT NULL,

    FOREIGN KEY (symbol_id)
      REFERENCES symbols(id)
      ON DELETE CASCADE,

    UNIQUE(symbol_id, kind, event_type, event_time)
  );

  CREATE INDEX IF NOT EXISTS idx_signals_symbol_time
    ON signals(symbol_id, event_time DESC);

  CREATE INDEX IF NOT EXISTS idx_signals_created_at
    ON signals(created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_signals_kind
    ON signals(kind, event_type);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;

export function applySchema(database: Database.Database): void {
  database.exec(SCHEMA_SQL);
  database.pragma(`user_version = ${SCHEMA_VERSION}`);
}
