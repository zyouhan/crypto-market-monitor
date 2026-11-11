import JSZip from "jszip";
import XLSXChart from "xlsx-chart";

import type { ReferenceTrendMap } from "./reference-trends";
import {
  isStatsResult,
  STATS_RESULT_LABELS,
  STATS_RESULT_VALUES
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

interface SheetColumn {
  key: string;
  label: string;
  width: number;
  numeric?: boolean;
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

function escapeXml(value: string): string {
  return value
    .replace(
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,
      ""
    )
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineCell(
  column: string,
  row: number,
  value: string
): string {
  return `<c r="${column}${row}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
    value
  )}</t></is></c>`;
}

function numericCell(
  column: string,
  row: number,
  value: number
): string {
  return `<c r="${column}${row}"><v>${value}</v></c>`;
}

function columnName(index: number): string {
  let value = index;
  let result = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }

  return result;
}

function worksheetXml(
  columns: SheetColumn[],
  rows: Array<Record<string, string | number>>
): string {
  const lastColumn = columnName(columns.length);
  const lastRow = rows.length + 1;
  const cols = columns
    .map(
      (column, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${
          column.width
        }" customWidth="1"/>`
    )
    .join("");
  const header = columns
    .map((column, index) =>
      inlineCell(columnName(index + 1), 1, column.label)
    )
    .join("");
  const body = rows
    .map((row, rowIndex) => {
      const excelRow = rowIndex + 2;
      const cells = columns
        .map((column, index) => {
          const value = row[column.key] ?? "";
          const col = columnName(index + 1);

          return column.numeric && typeof value === "number"
            ? numericCell(col, excelRow, value)
            : inlineCell(col, excelRow, String(value));
        })
        .join("");

      return `<row r="${excelRow}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastColumn}${lastRow}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${cols}</cols>
  <sheetData>
    <row r="1">${header}</row>
    ${body}
  </sheetData>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
}

async function readZipText(
  zip: JSZip,
  path: string
): Promise<string> {
  const file = zip.file(path);

  if (!file) {
    throw new Error(`导出模板缺少 ${path}`);
  }

  return file.async("text");
}

async function addWorksheet(
  zip: JSZip,
  filename: string,
  sheetId: number,
  relationId: string,
  name: string,
  xml: string
): Promise<void> {
  zip.file(`xl/worksheets/${filename}`, xml);
  const relationships = await readZipText(
    zip,
    "xl/_rels/workbook.xml.rels"
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    relationships.replace(
      "</Relationships>",
      `<Relationship Id="${relationId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/${filename}"/></Relationships>`
    )
  );
  const contentTypes = await readZipText(
    zip,
    "[Content_Types].xml"
  );
  zip.file(
    "[Content_Types].xml",
    contentTypes.replace(
      "</Types>",
      `<Override PartName="/xl/worksheets/${filename}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`
    )
  );
  const workbook = await readZipText(zip, "xl/workbook.xml");
  zip.file(
    "xl/workbook.xml",
    workbook.replace(
      "</sheets>",
      `<sheet name="${escapeXml(
        name
      )}" sheetId="${sheetId}" r:id="${relationId}"/></sheets>`
    )
  );
}

function chartDataLabelsXml(
  countsBySymbol: Map<string, Map<string, number>>,
  fields: string[],
  results: readonly string[]
): string[] {
  return results
    .map((result) => {
      const labels = fields
        .map((symbol, index) => {
          const count =
            countsBySymbol.get(symbol)?.get(result) ?? 0;

          if (count <= 0) {
            return "";
          }

          return `<c:dLbl><c:idx val="${index}"/><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:rPr lang="zh-CN"/><a:t>${count}</a:t></a:r></a:p></c:rich></c:tx></c:dLbl>`;
        })
        .filter(Boolean)
        .join("");

      if (!labels) {
        return "";
      }

      return `<c:dLbls>${labels}<c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`;
    });
}

function applySeriesDataLabels(
  chartXml: string,
  labels: string[]
): string {
  let seriesIndex = 0;

  return chartXml.replace(
    /(<c:ser>[\s\S]*?<\/c:tx>)([\s\S]*?<\/c:ser>)/g,
    (match, head: string, tail: string) => {
      const label = labels[seriesIndex];
      seriesIndex += 1;

      return label ? `${head}${label}${tail}` : match;
    }
  );
}

function generateChart(
  options: Parameters<XLSXChart["generate"]>[0]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chart = new XLSXChart();

    chart.generate(options, (error, data) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(Buffer.from(data));
    });
  });
}

export async function buildStatsWorkbook(
  rows: StatsExportRow[]
): Promise<Buffer> {
  const filledRows = rows.filter((row) =>
    isStatsResult(row.stats_result)
  );
  const symbolResults = new Map<
    string,
    Map<string, number>
  >();

  for (const row of filledRows) {
    if (!row.stats_result) {
      continue;
    }

    const counts =
      symbolResults.get(row.symbol) ??
      new Map<string, number>();
    counts.set(
      row.stats_result,
      (counts.get(row.stats_result) ?? 0) + 1
    );
    symbolResults.set(row.symbol, counts);
  }

  const symbols = Array.from(
    new Set(rows.map((row) => row.symbol))
  ).sort();
  const chartFields =
    symbols.length > 0 ? symbols : ["暂无数据"];
  const chartData: Record<
    string,
    Record<string, number>
  > = {};

  for (const result of STATS_RESULT_VALUES) {
    const label = STATS_RESULT_LABELS[result];
    chartData[label] = {};

    for (const symbol of chartFields) {
      const counts = symbolResults.get(symbol);
      const filled = counts
        ? Array.from(counts.values()).reduce(
            (total, count) => total + count,
            0
          )
        : 0;
      chartData[label][symbol] =
        filled > 0
          ? ((counts?.get(result) ?? 0) / filled) * 100
          : 0;
    }
  }

  const chartBuffer = await generateChart({
    chart: "column",
    chartTitle: "各标的策略结果占比（%）",
    titles: STATS_RESULT_VALUES.map(
      (result) => STATS_RESULT_LABELS[result]
    ),
    fields: chartFields,
    data: chartData,
    showVal: false
  });

  const zip = await JSZip.loadAsync(chartBuffer);
  const workbookXml = await readZipText(
    zip,
    "xl/workbook.xml"
  );
  zip.file(
    "xl/workbook.xml",
    workbookXml
      .replace(
        '<sheet name="Chart" sheetId="1" r:id="rId1"/>',
        '<sheet name="柱状图" sheetId="1" r:id="rId1"/>'
      )
      .replace(
        '<sheet name="Table" sheetId="2" r:id="rId2"/>',
        '<sheet name="Table" sheetId="2" state="hidden" r:id="rId2"/>'
      )
  );

  const detailColumns: SheetColumn[] = [
    { key: "time", label: "时间", width: 21 },
    { key: "symbol", label: "标的", width: 14 },
    { key: "strategy", label: "策略", width: 22 },
    { key: "monitor", label: "监控项", width: 22 },
    { key: "direction", label: "方向", width: 9 },
    { key: "price", label: "价格", width: 14, numeric: true },
    { key: "type", label: "类型", width: 12 },
    { key: "result", label: "结果", width: 15 },
    { key: "reference", label: "大级别参考", width: 36 },
    { key: "note", label: "备注", width: 40 }
  ];
  const detailRows = rows.map((row) => ({
    time: formatTime(row.event_time),
    symbol: row.symbol,
    strategy: row.preset_name ?? "自定义/历史",
    monitor: row.monitor_name ?? "—",
    direction: directionLabel(row.direction),
    price: row.price,
    type: eventLabel(row.event_type),
    result: isStatsResult(row.stats_result)
      ? STATS_RESULT_LABELS[row.stats_result]
      : "未填写",
    reference: referenceLabel(row.reference_trends),
    note: row.stats_note ?? ""
  }));

  await addWorksheet(
    zip,
    "sheet3.xml",
    3,
    "rId3",
    "统计明细",
    worksheetXml(detailColumns, detailRows)
  );

  const symbolColumns: SheetColumn[] = [
    { key: "symbol", label: "标的", width: 18 },
    { key: "filled", label: "已填写结果数", width: 15, numeric: true }
  ];
  const symbolRows = symbols.map((symbol) => {
    const counts =
      symbolResults.get(symbol) ?? new Map<string, number>();
    const filled = Array.from(counts.values()).reduce(
      (total, count) => total + count,
      0
    );

    return { symbol, filled };
  });
  await addWorksheet(
    zip,
    "sheet4.xml",
    4,
    "rId4",
    "标的统计",
    worksheetXml(symbolColumns, symbolRows)
  );

  const resultColumns: SheetColumn[] = [
    { key: "result", label: "结果", width: 20 },
    { key: "count", label: "数量", width: 12, numeric: true },
    { key: "pct", label: "占比", width: 14 }
  ];
  const totalFilled = filledRows.length;
  const resultRows = STATS_RESULT_VALUES.map((result) => {
    const count = filledRows.filter(
      (row) => row.stats_result === result
    ).length;

    return {
      result: STATS_RESULT_LABELS[result],
      count,
      pct:
        totalFilled > 0
          ? `${((count / totalFilled) * 100).toFixed(1)}%`
          : "0.0%"
    };
  });
  await addWorksheet(
    zip,
    "sheet5.xml",
    5,
    "rId5",
    "结果统计",
    worksheetXml(resultColumns, resultRows)
  );

  // Use percentage format on the chart value axis.
  const chartPath = "xl/charts/chart1.xml";
  const chartXml = zip.file(chartPath);

  if (chartXml) {
    const chartText = await readZipText(zip, chartPath);
    const labels = chartDataLabelsXml(
      symbolResults,
      chartFields,
      STATS_RESULT_VALUES
    );
    const labeledChart = applySeriesDataLabels(
      chartText,
      labels
    );

    zip.file(
      chartPath,
      labeledChart.replace(
        '<c:numFmt formatCode="General" sourceLinked="1"/>',
        '<c:numFmt formatCode="0&quot;%&quot;" sourceLinked="0"/>'
      )
    );
  }

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE"
  });
}
