"use client";

import { useState } from "react";

interface StatsExportModalProps {
  symbols: string[];
  onClose: () => void;
}

function errorFromResponse(
  status: number,
  text: string
): string {
  try {
    const parsed = JSON.parse(text) as {
      message?: string;
    };

    if (parsed.message) {
      return parsed.message;
    }
  } catch {
    // ignore
  }

  return `导出失败 (${status})`;
}

export function StatsExportModal({
  symbols,
  onClose
}: StatsExportModalProps) {
  const [allSymbols, setAllSymbols] = useState(true);
  const [selectedSymbols, setSelectedSymbols] = useState<
    string[]
  >([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  function toggleSymbol(symbol: string): void {
    setSelectedSymbols((current) =>
      current.includes(symbol)
        ? current.filter((item) => item !== symbol)
        : [...current, symbol]
    );
  }

  async function handleExport(): Promise<void> {
    if (!allSymbols && selectedSymbols.length === 0) {
      setError("请至少选择一个标的");
      return;
    }

    const fromTime = from ? new Date(from).getTime() : null;
    const toTime = to ? new Date(to).getTime() : null;

    if (
      fromTime !== null &&
      toTime !== null &&
      fromTime > toTime
    ) {
      setError("开始时间不能晚于结束时间");
      return;
    }

    setExporting(true);
    setError("");

    try {
      const params = new URLSearchParams();

      if (!allSymbols) {
        params.set("symbols", selectedSymbols.join(","));
      }

      if (fromTime !== null) {
        params.set("from", String(fromTime));
      }

      if (toTime !== null) {
        params.set("to", String(toTime));
      }

      const response = await fetch(
        `/api/signals/stats/export?${params.toString()}`,
        { credentials: "same-origin" }
      );

      if (!response.ok) {
        throw new Error(
          errorFromResponse(
            response.status,
            await response.text()
          )
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `strategy-stats-${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "导出失败"
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div
      className="modal-backdrop stats-export-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="modal stats-export-modal">
        <div className="modal-title-row">
          <div>
            <h2>导出策略统计</h2>
            <div className="modal-subtitle">
              导出 Excel，包含明细、标的统计、结果统计和柱状图
            </div>
          </div>
          <button
            type="button"
            className="modal-close"
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="export-section">
          <div className="export-section-head">
            <strong>标的范围</strong>
            <label className="reference-choice">
              <input
                type="checkbox"
                checked={allSymbols}
                onChange={(event) =>
                  setAllSymbols(event.target.checked)
                }
              />
              全部标的
            </label>
          </div>

          {!allSymbols && (
            <div className="export-symbol-grid">
              {symbols.length === 0 ? (
                <span className="field-help">
                  暂无可导出标的
                </span>
              ) : (
                symbols.map((symbol) => (
                  <label
                    className="reference-choice"
                    key={symbol}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSymbols.includes(symbol)}
                      onChange={() => toggleSymbol(symbol)}
                    />
                    {symbol}
                  </label>
                ))
              )}
            </div>
          )}
        </div>

        <div className="export-section">
          <strong>时间段</strong>
          <div className="export-time-grid">
            <label className="form-field">
              <span>开始时间</span>
              <input
                type="datetime-local"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label className="form-field">
              <span>结束时间</span>
              <input
                type="datetime-local"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
          </div>
          <div className="field-help">
            留空表示不限制该时间范围；按信号发生时间筛选。
          </div>
        </div>

        {error && <div className="error-box">{error}</div>}

        <div className="modal-footer">
          <span className="field-help">
            导出最多 50,000 条记录
          </span>
          <div className="form-actions">
            <button
              type="button"
              className="button"
              disabled={exporting}
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              className="button primary"
              disabled={exporting}
              onClick={() => void handleExport()}
            >
              {exporting ? "导出中…" : "导出 Excel"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
