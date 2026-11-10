import fs from "node:fs";
import path from "node:path";

import type Database from "better-sqlite3";

import { applySchema, hasColumn, tableExists } from "./schema";

interface LegacySymbol {
  id: number;
  symbol: string;
  interval: string;
  enabled: number;
  notify_enabled: number;
  last_price: number | null;
  last_price_time: number | null;
  last_processed_close_time: number;
}

interface LegacyStrategy {
  id: number;
  symbol_id: number;
  kind: string;
  enabled: number;
  notify_enabled: number;
  params: string;
  sort_order: number;
}

function parseJson(raw: string | null): Record<string, unknown> {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function backupDatabase(
  database: Database.Database,
  dbFile: string,
  version: number
): string | null {
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");
  const dir = path.join(
    path.dirname(dbFile),
    "archive",
    `v${version}-${stamp}`
  );

  try {
    fs.mkdirSync(dir, { recursive: true });

    const target = path.join(dir, path.basename(dbFile));
    const escaped = target.replace(/'/g, "''");

    database.exec(`VACUUM INTO '${escaped}'`);

    return target;
  } catch (error) {
    console.error("[DB] 迁移前备份失败:", error);
    return null;
  }
}

function ensureLegacySignalColumns(
  database: Database.Database
): void {
  if (!tableExists(database, "signals")) {
    return;
  }

  if (!hasColumn(database, "signals", "ema_diff")) {
    database.exec(
      "ALTER TABLE signals ADD COLUMN ema_diff REAL"
    );
  }

  if (!hasColumn(database, "signals", "interval")) {
    database.exec(
      "ALTER TABLE signals ADD COLUMN interval TEXT"
    );
  }
}

function monitorName(
  symbol: string,
  interval: string,
  suffix: string
): string {
  return `${symbol} ${interval} ${suffix}`.trim();
}

function insertMonitor(
  database: Database.Database,
  input: {
    name: string;
    symbol: string;
    interval: string;
    enabled: number;
    wechatEnabled: number;
    soundEnabled: number;
    lastPrice: number | null;
    lastPriceTime: number | null;
  }
): number {
  const now = Date.now();

  const result = database.prepare(`
    INSERT INTO monitors (
      name,
      symbol,
      interval,
      enabled,
      wechat_enabled,
      sound_enabled,
      last_price,
      last_price_time,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.name,
    input.symbol,
    input.interval,
    input.enabled,
    input.wechatEnabled,
    input.soundEnabled,
    input.lastPrice,
    input.lastPriceTime,
    now,
    now
  );

  return Number(result.lastInsertRowid);
}

function insertCondition(
  database: Database.Database,
  input: {
    monitorId: number;
    kind: string;
    role: "trigger" | "filter";
    interval: string;
    params: Record<string, unknown>;
    sortOrder: number;
  }
): void {
  const now = Date.now();

  database.prepare(`
    INSERT OR IGNORE INTO monitor_conditions (
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
    JSON.stringify(input.params),
    input.sortOrder,
    now,
    now
  );
}

function migrateLegacyMonitors(
  database: Database.Database
): void {
  const symbols = database.prepare(`
    SELECT *
    FROM symbols
    ORDER BY id ASC
  `).all() as LegacySymbol[];

  const strategies = database.prepare(`
    SELECT *
    FROM strategies
    ORDER BY symbol_id ASC, sort_order ASC, id ASC
  `).all() as LegacyStrategy[];

  for (const symbol of symbols) {
    const symbolStrategies = strategies.filter(
      (strategy) => strategy.symbol_id === symbol.id
    );

    const emaStrategy = symbolStrategies.find(
      (strategy) => strategy.kind === "EMA_TREND"
    );

    for (const strategy of symbolStrategies) {
      const params = parseJson(strategy.params);

      if (strategy.kind === "EMA_TREND") {
        const monitorId = insertMonitor(database, {
          name: monitorName(
            symbol.symbol,
            symbol.interval,
            `EMA ${params.fast ?? 25}/${params.slow ?? 60}`
          ),
          symbol: symbol.symbol,
          interval: symbol.interval,
          enabled:
            symbol.enabled === 1 && strategy.enabled === 1
              ? 1
              : 0,
          wechatEnabled:
            symbol.notify_enabled === 1 &&
            strategy.notify_enabled === 1
              ? 1
              : 0,
          soundEnabled:
            symbol.notify_enabled === 1 &&
            strategy.notify_enabled === 1
              ? 1
              : 0,
          lastPrice: symbol.last_price,
          lastPriceTime: symbol.last_price_time
        });

        insertCondition(database, {
          monitorId,
          kind: "EMA_CROSS",
          role: "trigger",
          interval: symbol.interval,
          params: {
            fast: params.fast ?? 25,
            slow: params.slow ?? 60,
            threshold: params.threshold ?? 10
          },
          sortOrder: 0
        });

        continue;
      }

      if (strategy.kind === "KDJ_TIMING") {
        const monitorId = insertMonitor(database, {
          name: monitorName(
            symbol.symbol,
            symbol.interval,
            "J 极值"
          ),
          symbol: symbol.symbol,
          interval: symbol.interval,
          enabled:
            symbol.enabled === 1 && strategy.enabled === 1
              ? 1
              : 0,
          wechatEnabled:
            symbol.notify_enabled === 1 &&
            strategy.notify_enabled === 1
              ? 1
              : 0,
          soundEnabled:
            symbol.notify_enabled === 1 &&
            strategy.notify_enabled === 1
              ? 1
              : 0,
          lastPrice: symbol.last_price,
          lastPriceTime: symbol.last_price_time
        });

        insertCondition(database, {
          monitorId,
          kind: "KDJ_EXTREME",
          role: "trigger",
          interval: symbol.interval,
          params: {
            period: params.period ?? 9,
            kSmooth: params.kSmooth ?? 3,
            dSmooth: params.dSmooth ?? 3,
            oversold: params.oversold ?? 5,
            overbought: params.overbought ?? 85,
            longEnabled: params.longEnabled !== false,
            shortEnabled: params.shortEnabled !== false
          },
          sortOrder: 0
        });

        continue;
      }

      if (strategy.kind !== "KDJ_ENTRY") {
        continue;
      }

      const emaParams = emaStrategy
        ? parseJson(emaStrategy.params)
        : null;

      const canUseEma =
        emaStrategy !== undefined && emaStrategy.enabled === 1;

      const monitorId = insertMonitor(database, {
        name: monitorName(
          symbol.symbol,
          symbol.interval,
          canUseEma ? "EMA 趋势 + KDJ 入场" : "KDJ 入场"
        ),
        symbol: symbol.symbol,
        interval: symbol.interval,
        enabled:
          symbol.enabled === 1 &&
          strategy.enabled === 1 &&
          (emaStrategy ? canUseEma : false)
            ? 1
            : 0,
        wechatEnabled:
          symbol.notify_enabled === 1 &&
          strategy.notify_enabled === 1
            ? 1
            : 0,
        soundEnabled:
          symbol.notify_enabled === 1 &&
          strategy.notify_enabled === 1
            ? 1
            : 0,
        lastPrice: symbol.last_price,
        lastPriceTime: symbol.last_price_time
      });

      let sortOrder = 0;

      if (emaStrategy && emaParams) {
        insertCondition(database, {
          monitorId,
          kind: "EMA_CROSS",
          role: "filter",
          interval: symbol.interval,
          params: {
            fast: emaParams.fast ?? 25,
            slow: emaParams.slow ?? 60,
            threshold: emaParams.threshold ?? 10
          },
          sortOrder
        });

        sortOrder += 1;
      }

      insertCondition(database, {
        monitorId,
        kind: "KDJ_EXTREME",
        role: "trigger",
        interval: symbol.interval,
        params: {
          period: params.period ?? 9,
          kSmooth: params.kSmooth ?? 3,
          dSmooth: params.dSmooth ?? 3,
          oversold: params.oversold ?? 5,
          overbought: params.overbought ?? 85,
          longEnabled: params.longEnabled !== false,
          shortEnabled: params.shortEnabled !== false
        },
        sortOrder
      });
    }
  }
}

function copyLegacySignals(database: Database.Database): void {
  if (!tableExists(database, "signals_v4")) {
    return;
  }

  const rows = database.prepare(`
    SELECT *
    FROM signals_v4
    ORDER BY id ASC
  `).all() as Array<Record<string, unknown>>;

  const symbolIntervals = new Map<string, string>();

  if (tableExists(database, "symbols")) {
    const symbols = database.prepare(`
      SELECT symbol, interval
      FROM symbols
    `).all() as Array<{ symbol: string; interval: string }>;

    for (const symbol of symbols) {
      symbolIntervals.set(symbol.symbol, symbol.interval);
    }
  }

  const insert = database.prepare(`
    INSERT OR IGNORE INTO signals (
      id,
      monitor_id,
      monitor_name,
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
      push_error,
      reason,
      payload,
      created_at
    ) VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of rows) {
    const kind = String(row.kind ?? "LEGACY");
    const interval =
      (row.interval as string | null) ??
      symbolIntervals.get(String(row.symbol)) ??
      null;

    insert.run(
      row.id,
      row.symbol,
      interval,
      kind,
      row.event_type,
      row.direction,
      row.price,
      row.event_time,
      kind,
      JSON.stringify([
        {
          kind,
          role: "trigger",
          interval,
          legacy: true
        }
      ]),
      row.threshold,
      row.price_diff,
      row.ema_diff ?? null,
      row.trigger_met,
      row.push_state,
      row.push_error,
      row.reason,
      row.payload,
      row.created_at
    );
  }
}

export function ensureStopWatchProgressColumns(
  database: Database.Database
): void {
  if (!tableExists(database, "stop_watches")) {
    return;
  }

  const columns = [
    ["max_price", "REAL"],
    ["min_price", "REAL"],
    ["max_favorable_r", "REAL NOT NULL DEFAULT 0"],
    ["max_adverse_r", "REAL NOT NULL DEFAULT 0"],
    ["last_checked_time", "INTEGER"],
    ["alerted_1r", "INTEGER NOT NULL DEFAULT 0"],
    ["alerted_breakeven", "INTEGER NOT NULL DEFAULT 0"]
  ] as const;

  for (const [column, definition] of columns) {
    if (!hasColumn(database, "stop_watches", column)) {
      database.exec(
        `ALTER TABLE stop_watches ADD COLUMN ${column} ${definition}`
      );
    }
  }
}

export function ensurePresetColumns(
  database: Database.Database
): void {
  const targets = [
    ["monitors", "preset_id", "TEXT"],
    ["monitors", "preset_name", "TEXT"],
    ["signals", "preset_id", "TEXT"],
    ["signals", "preset_name", "TEXT"]
  ] as const;

  for (const [table, column, definition] of targets) {
    if (
      tableExists(database, table) &&
      !hasColumn(database, table, column)
    ) {
      database.exec(
        `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
      );
    }
  }
}

export function ensureStatsColumns(
  database: Database.Database
): void {
  const targets = [
    [
      "monitors",
      "track_stats",
      "INTEGER NOT NULL DEFAULT 0"
    ],
    [
      "signals",
      "track_stats",
      "INTEGER NOT NULL DEFAULT 0"
    ],
    [
      "signals",
      "stats_deleted",
      "INTEGER NOT NULL DEFAULT 0"
    ]
  ] as const;

  for (const [table, column, definition] of targets) {
    if (
      tableExists(database, table) &&
      !hasColumn(database, table, column)
    ) {
      database.exec(
        `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
      );
    }
  }

  if (tableExists(database, "signals")) {
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_signals_stats
        ON signals(track_stats, stats_deleted, event_type, event_time DESC)
    `);
  }
}

export function migrateToV5(
  database: Database.Database,
  dbFile: string,
  version: number
): void {
  if (version >= 5) {
    applySchema(database);
    ensureStopWatchProgressColumns(database);
    return;
  }

  if (version > 0) {
    const backup = backupDatabase(database, dbFile, version);

    if (backup) {
      console.log(`[DB] v${version} 数据库已备份: ${backup}`);
    }
  }

  ensureLegacySignalColumns(database);

  const legacySignalsExist = tableExists(database, "signals");

  if (
    legacySignalsExist &&
    !tableExists(database, "signals_v4")
  ) {
    database.exec("ALTER TABLE signals RENAME TO signals_v4");
  }

  applySchema(database);
  ensureStopWatchProgressColumns(database);

  if (version > 0) {
    migrateLegacyMonitors(database);
    copyLegacySignals(database);
  }

  database.pragma("user_version = 8");
}

function insertSeedMonitor(
  database: Database.Database,
  symbol: string,
  interval: string,
  name: string,
  conditions: Array<{
    kind: string;
    role: "trigger" | "filter";
    params: Record<string, unknown>;
    sortOrder: number;
  }>
): void {
  const monitorId = insertMonitor(database, {
    name,
    symbol,
    interval,
    enabled: 1,
    wechatEnabled: 1,
    soundEnabled: 1,
    lastPrice: null,
    lastPriceTime: null
  });

  for (const condition of conditions) {
    insertCondition(database, {
      monitorId,
      kind: condition.kind,
      role: condition.role,
      interval,
      params: condition.params,
      sortOrder: condition.sortOrder
    });
  }
}

export function seedDefaultMonitors(
  database: Database.Database
): void {
  const count = database.prepare(`
    SELECT COUNT(1) AS count
    FROM monitors
  `).get() as { count: number };

  if (count.count > 0) {
    return;
  }

  const now = Date.now();

  for (const symbol of ["ETHUSDT", "BTCUSDT"]) {
    insertSeedMonitor(database, symbol, "1m", `${symbol} 1m EMA 25/60`, [
      {
        kind: "EMA_CROSS",
        role: "trigger",
        params: { fast: 25, slow: 60, threshold: 10 },
        sortOrder: 0
      }
    ]);

    insertSeedMonitor(
      database,
      symbol,
      "1m",
      `${symbol} 1m EMA 趋势 + KDJ 入场`,
      [
        {
          kind: "EMA_CROSS",
          role: "filter",
          params: { fast: 25, slow: 60, threshold: 10 },
          sortOrder: 0
        },
        {
          kind: "KDJ_EXTREME",
          role: "trigger",
          params: {
            period: 9,
            kSmooth: 3,
            dSmooth: 3,
            oversold: 5,
            overbought: 85,
            longEnabled: true,
            shortEnabled: true
          },
          sortOrder: 1
        }
      ]
    );
  }

  console.log(
    `[DB] 已创建默认监控项 (${now})`
  );
}
