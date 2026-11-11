import { Workbook } from "exceljs";

import type { ReferenceTrendMap } from "./reference-trends";
import {
  STATS_RESULT_LABELS,
  STATS_RESULT_VALUES,
  statsResultLabel
} from "./stats-results";

export interface StatsExportRow {
  event_time: number;
  symbol: string;
  preset_name: string | null;
  monitor_name: string | null;
  direction: "BULL" | "BEAR" | null;
  price: number;
  event_type: string;
  stats_result: string | null;
  stats_note: string | null;
  reference_trends: string | null;
}

function formatTime(value: number): string {
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false
  });
}

function directionLabel(
  direction: StatsExportRow["direction"]
): string {
  return direction === "BEAR" ? "做空" : "做多";
}

function eventLabel(eventType: string): string {
  if (eventType === "ENTRY_LONG") {
    return "做多入场";
  }

  if (eventType === "ENTRY_SHORT") {
    return "做空入场";
  }

  return eventType;
}

function referenceLabel(value: string | null): string {
  if (!value) {
    return "—";
  }

  let trends: ReferenceTrendMap | null = null;

  try {
    trends = JSON.parse(value) as ReferenceTrendMap;
  } catch {
    return "—";
  }

  const parts: string[] = [];

  for (const interval of ["15m", "1h", "4h"] as const) {
    const trend = trends[interval];

    if (!trend) {
      continue;
    }

    const flags = [
      trend.turning ? "拐头" : "",
      trend.accelerating ? "加速" : "",
      trend.weakening ? "走弱" : ""
    ].filter(Boolean);

    parts.push(
      `${interval}${trend.direction === "up" ? "↑" : "↓"}${
        flags.length > 0 ? ` ${flags.join("/")}` : ""
      }`
    );
  }

  return parts.length > 0 ? parts.join(" · ") : "—";
}

function addBarFormatting(
  worksheet: import("exceljs").Worksheet,
  ref: string
): void {
  worksheet.addConditionalFormatting({
    ref,
    rules: [
      {
        type: "dataBar",
        minLength: 0,
        maxLength: 100,
        color: { argb: "FF5B8DEF" },
        cfvo: [{ type: "min" }, { type: "max" }],
        showValue: true
      } as unknown as import("exceljs").ConditionalFormattingRule
    ]
  });
}

function styleHeader(
  worksheet: import("exceljs").Worksheet,
  row: import("exceljs").Row
): void {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F4E78" }
  };
  row.alignment = { vertical: "middle" };

  worksheet.views = [
    {
      state: "frozen",
      ySplit: 1
    }
  ];
}

export async function buildStatsWorkbook(
  rows: StatsExportRow[]
): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.creator = "Crypto Market Monitor";
  workbook.created = new Date();

  const detail = workbook.addWorksheet("统计明细");
  detail.columns = [
    { header: "时间", key: "time", width: 21 },
    { header: "标的", key: "symbol", width: 14 },
    { header: "策略", key: "strategy", width: 24 },
    { header: "监控项", key: "monitor", width: 24 },
    { header: "方向", key: "direction", width: 9 },
    { header: "价格", key: "price", width: 14 },
    { header: "类型", key: "type", width: 12 },
    { header: "结果", key: "result", width: 16 },
    { header: "大级别参考", key: "reference", width: 38 },
    { header: "备注", key: "note", width: 42 }
  ];
  styleHeader(detail, detail.getRow(1));

  for (const row of rows) {
    detail.addRow({
      time: formatTime(row.event_time),
      symbol: row.symbol,
      strategy: row.preset_name ?? "自定义/历史",
      monitor: row.monitor_name ?? "—",
      direction: directionLabel(row.direction),
      price: row.price,
      type: eventLabel(row.event_type),
      result: statsResultLabel(row.stats_result),
      reference: referenceLabel(row.reference_trends),
      note: row.stats_note ?? ""
    });
  }

  detail.autoFilter = "A1:J1";
  detail.getColumn("price").numFmt = "#,##0.########";

  const symbolSheet = workbook.addWorksheet("标的统计");
  symbolSheet.columns = [
    { header: "标的", key: "symbol", width: 18 },
    { header: "信号数量", key: "count", width: 14 },
    { header: "占比", key: "pct", width: 12 }
  ];
  styleHeader(symbolSheet, symbolSheet.getRow(1));

  const symbolCounts = new Map<string, number>();

  for (const row of rows) {
    symbolCounts.set(
      row.symbol,
      (symbolCounts.get(row.symbol) ?? 0) + 1
    );
  }

  const sortedSymbols = Array.from(symbolCounts.entries()).sort(
    (a, b) => b[1] - a[1]
  );
  const symbolMax = sortedSymbols[0]?.[1] ?? 0;

  for (const [symbol, count] of sortedSymbols) {
    symbolSheet.addRow({
      symbol,
      count,
      pct:
        rows.length > 0
          ? `${((count / rows.length) * 100).toFixed(1)}%`
          : "0.0%"
    });
  }

  if (symbolMax > 0) {
    addBarFormatting(
      symbolSheet,
      `B2:B${sortedSymbols.length + 1}`
    );
  }

  const resultSheet = workbook.addWorksheet("结果统计");
  resultSheet.columns = [
    { header: "结果", key: "result", width: 20 },
    { header: "数量", key: "count", width: 12 },
    { header: "占比", key: "pct", width: 12 }
  ];
  styleHeader(resultSheet, resultSheet.getRow(1));

  const resultCounts = new Map<string, number>();

  for (const row of rows) {
    const key = row.stats_result ?? "unfilled";
    resultCounts.set(key, (resultCounts.get(key) ?? 0) + 1);
  }

  const resultKeys = [
    ...STATS_RESULT_VALUES,
    ...(resultCounts.has("unfilled") ? ["unfilled"] : [])
  ];
  let resultMax = 0;

  for (const key of resultKeys) {
    resultMax = Math.max(resultMax, resultCounts.get(key) ?? 0);
  }

  for (const key of resultKeys) {
    const count = resultCounts.get(key) ?? 0;
    resultSheet.addRow({
      result:
        key === "unfilled"
          ? "未填写"
          : STATS_RESULT_LABELS[
              key as keyof typeof STATS_RESULT_LABELS
            ],
      count,
      pct:
        rows.length > 0
          ? `${((count / rows.length) * 100).toFixed(1)}%`
          : "0.0%"
    });
  }

  if (resultMax > 0) {
    addBarFormatting(
      resultSheet,
      `B2:B${resultKeys.length + 1}`
    );
  }

  const chartSheet = workbook.addWorksheet("柱状图");
  chartSheet.columns = [
    { header: "维度", key: "dimension", width: 24 },
    { header: "数量", key: "count", width: 14 }
  ];
  styleHeader(chartSheet, chartSheet.getRow(1));

  const chartData = [
    ...sortedSymbols.map(([symbol, count]) => ({
      dimension: `标的 · ${symbol}`,
      count
    })),
    ...resultKeys.map((key) => ({
      dimension:
        key === "unfilled"
          ? "结果 · 未填写"
          : `结果 · ${
              STATS_RESULT_LABELS[
                key as keyof typeof STATS_RESULT_LABELS
              ]
            }`,
      count: resultCounts.get(key) ?? 0
    }))
  ];

  for (const item of chartData) {
    chartSheet.addRow(item);
  }

  if (chartData.length > 0) {
    addBarFormatting(
      chartSheet,
      `B2:B${chartData.length + 1}`
    );
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return Buffer.from(buffer);
}
