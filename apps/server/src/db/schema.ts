import type Database from "better-sqlite3";

export const SCHEMA_VERSION = 4;

/**
 * v4 表结构。
 *
 * 与 v3 的差异：
 * - signals 增加 interval，记录信号触发时所属标的的 K 线周期。
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
    baseline_ema REAL,
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
    interval TEXT,

    kind TEXT NOT NULL,
    event_type TEXT NOT NULL,
    direction TEXT,

    price REAL NOT NULL,
    event_time INTEGER NOT NULL,

    threshold REAL,
    price_diff REAL,
    ema_diff REAL,
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

function hasColumn(
  database: Database.Database,
  table: string,
  column: string
): boolean {
  const columns = database.pragma(
    `table_info(${table})`
  ) as Array<{ name: string }>;

  return columns.some((item) => item.name === column);
}

/**
 * v2 升级到 v3：原地补列，不重建表、不归档。
 */
function ensureV3Columns(database: Database.Database): void {
  if (
    !hasColumn(database, "strategy_states", "baseline_ema")
  ) {
    database.exec(
      "ALTER TABLE strategy_states ADD COLUMN baseline_ema REAL"
    );
  }

  if (!hasColumn(database, "signals", "ema_diff")) {
    database.exec(
      "ALTER TABLE signals ADD COLUMN ema_diff REAL"
    );
  }
}

/**
 * v3 升级到 v4：给历史信号补 K 线周期，不重建表。
 */
function ensureV4Columns(database: Database.Database): void {
  if (!hasColumn(database, "signals", "interval")) {
    database.exec(
      "ALTER TABLE signals ADD COLUMN interval TEXT"
    );
  }

  database.exec(`
    UPDATE signals
    SET interval = (
      SELECT symbols.interval
      FROM symbols
      WHERE symbols.id = signals.symbol_id
    )
    WHERE interval IS NULL
  `);
}

export function applySchema(database: Database.Database): void {
  database.exec(SCHEMA_SQL);
  ensureV3Columns(database);
  ensureV4Columns(database);
  database.pragma(`user_version = ${SCHEMA_VERSION}`);
}
