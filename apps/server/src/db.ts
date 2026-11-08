
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

// 项目根目录：crypto-market-monitor
const projectRoot = path.resolve(__dirname, "../../../");

const configuredDatabasePath =
  process.env.DATABASE_PATH || "./data/crypto-market-monitor.db";

export const resolvedDatabasePath = path.resolve(
  projectRoot,
  configuredDatabasePath
);

fs.mkdirSync(path.dirname(resolvedDatabasePath), {
  recursive: true
});

export const db: Database.Database = new Database(
  resolvedDatabasePath
);

// SQLite 性能与可靠性设置
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

// 初始化数据表
db.exec(`
  CREATE TABLE IF NOT EXISTS symbols (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    symbol TEXT NOT NULL UNIQUE,
    interval TEXT NOT NULL DEFAULT '1m',

    fast_ema INTEGER NOT NULL DEFAULT 9,
    slow_ema INTEGER NOT NULL DEFAULT 21,

    threshold REAL NOT NULL DEFAULT 10,

    enabled INTEGER NOT NULL DEFAULT 1,
    notify_enabled INTEGER NOT NULL DEFAULT 0,

    current_state TEXT NOT NULL DEFAULT 'UNKNOWN',

    last_cross_type TEXT,
    last_cross_price REAL,
    last_cross_time INTEGER,

    last_processed_close_time INTEGER NOT NULL DEFAULT 0,
    last_price REAL,

    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    symbol_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,

    cross_type TEXT NOT NULL,
    cross_price REAL NOT NULL,
    cross_time INTEGER NOT NULL,

    previous_cross_type TEXT,
    previous_cross_price REAL,
    previous_cross_time INTEGER,

    price_diff REAL,
    threshold REAL NOT NULL,

    trigger_met INTEGER NOT NULL DEFAULT 0,
    push_sent INTEGER NOT NULL DEFAULT 0,

    reason TEXT,

    created_at INTEGER NOT NULL,

    FOREIGN KEY (symbol_id)
      REFERENCES symbols(id)
      ON DELETE CASCADE,

    UNIQUE(symbol_id, cross_time)
  );

  CREATE INDEX IF NOT EXISTS idx_events_symbol_time
    ON events(symbol_id, cross_time DESC);

  CREATE INDEX IF NOT EXISTS idx_events_created_at
    ON events(created_at DESC);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

// 初始化默认标的
const now = Date.now();

const insertDefaultSymbol = db.prepare(`
  INSERT OR IGNORE INTO symbols (
    symbol,
    interval,
    fast_ema,
    slow_ema,
    threshold,
    enabled,
    notify_enabled,
    current_state,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

insertDefaultSymbol.run(
  "ETHUSDT",
  "1m",
  9,
  21,
  10,
  1,
  0,
  "UNKNOWN",
  now,
  now
);

// 初始化全局设置
const insertSetting = db.prepare(`
  INSERT OR IGNORE INTO settings (
    key,
    value,
    updated_at
  ) VALUES (?, ?, ?)
`);

insertSetting.run(
  "global_wechat_enabled",
  process.env.GLOBAL_WECHAT_ENABLED === "true" ? "true" : "false",
  now
);

// 类型定义
export type CrossType = "GOLDEN" | "DEATH";

export type MonitorState =
  | "UNKNOWN"
  | "GOLDEN"
  | "DEATH";

export interface SymbolConfig {
  id: number;
  symbol: string;
  interval: string;
  fast_ema: number;
  slow_ema: number;
  threshold: number;
  enabled: number;
  notify_enabled: number;
  current_state: MonitorState;
  last_cross_type: CrossType | null;
  last_cross_price: number | null;
  last_cross_time: number | null;
  last_processed_close_time: number;
  last_price: number | null;
  created_at: number;
  updated_at: number;
}

export interface EventRecord {
  id: number;
  symbol_id: number;
  symbol: string;
  cross_type: CrossType;
  cross_price: number;
  cross_time: number;
  previous_cross_type: CrossType | null;
  previous_cross_price: number | null;
  previous_cross_time: number | null;
  price_diff: number | null;
  threshold: number;
  trigger_met: number;
  push_sent: number;
  reason: string | null;
  created_at: number;
}

// 数据访问方法
export function getSymbols(): SymbolConfig[] {
  return db.prepare(`
    SELECT *
    FROM symbols
    ORDER BY id ASC
  `).all() as SymbolConfig[];
}

export function getSymbolById(
  id: number
): SymbolConfig | undefined {
  return db.prepare(`
    SELECT *
    FROM symbols
    WHERE id = ?
  `).get(id) as SymbolConfig | undefined;
}

export function getEvents(
  limit = 100,
  offset = 0
): EventRecord[] {
  return db.prepare(`
    SELECT *
    FROM events
    ORDER BY cross_time DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as EventRecord[];
}

export function getSetting(key: string): string | undefined {
  const result = db.prepare(`
    SELECT value
    FROM settings
    WHERE key = ?
  `).get(key) as { value: string } | undefined;

  return result?.value;
}

export function setSetting(
  key: string,
  value: string
): void {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key)
    DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(key, value, Date.now());
}
