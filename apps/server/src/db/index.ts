import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { PROJECT_ROOT } from "../config/paths";
import {
  ensurePresetColumns,
  ensureStopWatchProgressColumns,
  migrateToV5,
  seedDefaultMonitors
} from "./migrate";
import { applySchema, SCHEMA_VERSION } from "./schema";

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
 * v1 数据库没有 user_version 标记，直接归档后重建。
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

function seedSettings(database: Database.Database): void {
  const now = Date.now();

  database.prepare(`
    INSERT OR IGNORE INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
  `).run(
    "global_wechat_enabled",
    process.env.GLOBAL_WECHAT_ENABLED === "true"
      ? "true"
      : "false",
    now
  );

  database.prepare(`
    INSERT OR IGNORE INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
  `).run("global_monitor_enabled", "true", now);
}

function openDatabase(dbFile: string): Database.Database {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });

  const existedBefore = fs.existsSync(dbFile);

  let database = new Database(dbFile);

  configure(database);

  let version = Number(
    database.pragma("user_version", { simple: true }) || 0
  );

  // v1 及更早版本没有可靠的迁移路径，先归档再重建
  if (existedBefore && version < 2) {
    database.close();

    const archived = archiveLegacyDatabase(dbFile);

    if (archived) {
      console.log(`[DB] 旧数据库已归档: ${archived}`);
    }

    database = new Database(dbFile);
    configure(database);
    version = 0;
  }

  if (version < SCHEMA_VERSION) {
    migrateToV5(database, dbFile, version);
  } else {
    applySchema(database);
  }

  ensureStopWatchProgressColumns(database);
  ensurePresetColumns(database);

  seedSettings(database);
  seedDefaultMonitors(database);

  if (version > 0 && version < SCHEMA_VERSION) {
    console.log(
      `[DB] 数据库结构已从 v${version} 升级到 v${SCHEMA_VERSION}`
    );
  }

  return database;
}

export const db: Database.Database = openDatabase(
  resolvedDatabasePath
);
