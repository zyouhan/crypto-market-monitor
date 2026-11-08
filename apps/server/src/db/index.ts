import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import {
  DEFAULT_INTERVAL,
  DEFAULT_STRATEGIES,
  DEFAULT_SYMBOLS
} from "../config/defaults";
import { PROJECT_ROOT } from "../config/paths";
import { applySchema, SCHEMA_VERSION } from "./schema";
import type { StrategyKind } from "./types";

const configuredDatabasePath =
  process.env.DATABASE_PATH || "./data/crypto-market-monitor.db";

export const resolvedDatabasePath = path.resolve(
  PROJECT_ROOT,
  configuredDatabasePath
);

function configure(database: Database.Database): void {
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
}

/**
 * v1 数据库没有 user_version 标记。
 * 由于 v2 移除了旧列并重建了事件表，直接整体归档旧库再建新库，
 * 避免半迁移状态。
 */
function archiveLegacyDatabase(dbFile: string): string | null {
  const candidates = [
    dbFile,
    `${dbFile}-wal`,
    `${dbFile}-shm`
  ].filter((file) => fs.existsSync(file));

  if (candidates.length === 0) {
    return null;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const targetDir = path.join(
    path.dirname(dbFile),
    "archive",
    `v1-${stamp}`
  );

  fs.mkdirSync(targetDir, { recursive: true });

  for (const file of candidates) {
    fs.renameSync(
      file,
      path.join(targetDir, path.basename(file))
    );
  }

  return targetDir;
}

function seedDefaults(database: Database.Database): void {
  const now = Date.now();

  const insertSymbol = database.prepare(`
    INSERT OR IGNORE INTO symbols (
      symbol,
      interval,
      enabled,
      notify_enabled,
      created_at,
      updated_at
    ) VALUES (?, ?, 1, 1, ?, ?)
  `);

  const selectSymbol = database.prepare(`
    SELECT id
    FROM symbols
    WHERE symbol = ?
  `);

  const insertStrategy = database.prepare(`
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
  `);

  const insertState = database.prepare(`
    INSERT OR IGNORE INTO strategy_states (
      symbol_id,
      kind,
      status,
      updated_at
    ) VALUES (?, ?, ?, ?)
  `);

  const insertSetting = database.prepare(`
    INSERT OR IGNORE INTO settings (
      key,
      value,
      updated_at
    ) VALUES (?, ?, ?)
  `);

  for (const symbol of DEFAULT_SYMBOLS) {
    insertSymbol.run(symbol, DEFAULT_INTERVAL, now, now);

    const row = selectSymbol.get(symbol) as
      | { id: number }
      | undefined;

    if (!row) {
      continue;
    }

    for (const strategy of DEFAULT_STRATEGIES) {
      insertStrategy.run(
        row.id,
        strategy.kind,
        strategy.enabled,
        strategy.notify_enabled,
        JSON.stringify(strategy.params),
        strategy.sort_order,
        now,
        now
      );

      insertState.run(
        row.id,
        strategy.kind,
        initialStatus(strategy.kind),
        now
      );
    }
  }

  insertSetting.run(
    "global_wechat_enabled",
    process.env.GLOBAL_WECHAT_ENABLED === "true"
      ? "true"
      : "false",
    now
  );
}

function initialStatus(kind: StrategyKind): string {
  return kind === "EMA_TREND" ? "NEUTRAL" : "IDLE";
}

/**
 * v2 → v3：新增 baseline_ema / ema_diff 后，
 * 旧状态没有 EMA 基准，无法继续比较。
 * 清空状态并把处理进度归零，让 worker 用新字段静默重新预热。
 * 不清空 signals 与标的/策略配置。
 */
function resetStatesAfterUpgrade(
  database: Database.Database
): void {
  const now = Date.now();

  database.prepare("DELETE FROM strategy_states").run();

  database.prepare(`
    UPDATE symbols
    SET
      last_processed_close_time = 0,
      updated_at = ?
  `).run(now);
}

function openDatabase(dbFile: string): Database.Database {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });

  const existedBefore = fs.existsSync(dbFile);

  let database = new Database(dbFile);

  configure(database);

  const version = Number(
    database.pragma("user_version", { simple: true }) || 0
  );

  // 只有 v1 需要归档重建；v2 及以上原地升级
  if (existedBefore && version < 2) {
    database.close();

    const archived = archiveLegacyDatabase(dbFile);

    if (archived) {
      console.log(`[DB] 旧数据库已归档: ${archived}`);
    }

    database = new Database(dbFile);

    configure(database);
  }

  applySchema(database);

  if (version >= 2 && version < SCHEMA_VERSION) {
    resetStatesAfterUpgrade(database);

    console.log(
      `[DB] 已升级到 v${SCHEMA_VERSION}，策略状态已重置，等待静默预热`
    );
  }

  seedDefaults(database);

  return database;
}

export const db: Database.Database = openDatabase(
  resolvedDatabasePath
);
