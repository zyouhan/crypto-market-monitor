interface SignalConditionSnapshot {
  kind?: string;
  interval?: string | null;
  summary?: string;
  logic?: string;
}

function parseConditions(raw: string | null): SignalConditionSnapshot[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    return Array.isArray(parsed)
      ? (parsed as SignalConditionSnapshot[])
      : [];
  } catch {
    return [];
  }
}

/**
 * 把信号生成时的条件快照压缩成表格/Excel 可用的一行摘要。
 */
export function summarizeSignalConditions(
  raw: string | null,
  fallback: string | null = null
): string {
  const conditions = parseConditions(raw);
  const parts: string[] = [];

  for (const condition of conditions) {
    const summary =
      typeof condition.summary === "string"
        ? condition.summary.trim()
        : "";
    const label = summary || condition.kind || "";

    if (!label) {
      continue;
    }

    const interval =
      typeof condition.interval === "string" &&
      condition.interval.trim()
        ? `[${condition.interval.trim()}] `
        : "";
    const logic =
      condition.logic === "OR"
        ? "[或] "
        : condition.logic === "NOT"
          ? "[非] "
          : "";

    parts.push(`${interval}${logic}${label}`);
  }

  if (parts.length > 0) {
    return parts.join(" · ").slice(0, 1000);
  }

  return fallback?.trim() || "未知条件";
}
