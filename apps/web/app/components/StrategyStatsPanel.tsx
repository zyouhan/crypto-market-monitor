"use client";

import {
  useEffect,
  useState
} from "react";

import { api, errorMessage } from "../lib/api";
import {
  eventTypeLabel,
  formatPrice,
  formatTime
} from "../lib/format";
import { referenceTagItems } from "../lib/reference-trends";
import { ReferenceTags } from "./ReferenceTags";
import { StatsExportModal } from "./StatsExportModal";
import type {
  SignalStats,
  StatsResult,
  StatsResultStats,
  StrategyStatsEntry,
  StrategyStatsPage
} from "../types";

const PAGE_SIZE = 20;

const RESULT_OPTIONS: Array<{
  value: StatsResult | "";
  label: string;
}> = [
  { value: "", label: "未填写" },
  { value: "light_success", label: "轻仓成功" },
  { value: "heavy_success", label: "重仓成功" },
  {
    value: "light_reasonable_stop",
    label: "轻仓合理止损"
  },
  {
    value: "heavy_reasonable_stop",
    label: "重仓合理止损"
  },
  { value: "light_failed", label: "轻仓失败" },
  { value: "heavy_failed", label: "重仓失败" },
  { value: "not_suitable", label: "不适合入场" },
  { value: "other", label: "其他" }
];

const RESULT_LABELS = new Map(
  RESULT_OPTIONS.map((option) => [
    option.value,
    option.label
  ])
);

interface StrategyStatsPanelProps {
  onClose?: () => void;
  onChanged: () => void | Promise<void>;
  pageMode?: boolean;
}

export function StrategyStatsPanel({
  onClose,
  onChanged,
  pageMode = false
}: StrategyStatsPanelProps) {
  const [stats, setStats] = useState<SignalStats>({
    today: 0,
    total: 0,
    by_preset: []
  });
  const [resultStats, setResultStats] =
    useState<StatsResultStats>({
      symbol: null,
      symbols: [],
      total: 0,
      filled: 0,
      unfilled: 0,
      by_result: []
    });
  const [resultSymbol, setResultSymbol] = useState("");
  const [entries, setEntries] = useState<StrategyStatsEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [unfilledTotal, setUnfilledTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [symbolFilter, setSymbolFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [resultFilter, setResultFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(
    null
  );
  const [reloadKey, setReloadKey] = useState(0);
  const [noteEntry, setNoteEntry] =
    useState<StrategyStatsEntry | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [savingResultId, setSavingResultId] = useState<
    number | null
  >(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    new Set()
  );
  const [pageInput, setPageInput] = useState("1");
  const [exportOpen, setExportOpen] = useState(false);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const missingReferenceIds = entries
    .filter((entry) => !entry.reference_trends)
    .map((entry) => entry.id);
  const pageSelectedIds = entries
    .filter((entry) => selectedIds.has(entry.id))
    .map((entry) => entry.id);
  const allPageSelected =
    entries.length > 0 &&
    pageSelectedIds.length === entries.length;

  useEffect(() => {
    setSelectedIds((current) => {
      const validIds = new Set(
        entries.map((entry) => entry.id)
      );
      const next = new Set(
        Array.from(current).filter((id) => validIds.has(id))
      );

      return next.size === current.size
        ? current
        : next;
    });
  }, [entries]);

  useEffect(() => {
    setPageInput(String(page + 1));
  }, [page]);

  function togglePageSelection(checked: boolean): void {
    setSelectedIds(
      checked
        ? new Set(entries.map((entry) => entry.id))
        : new Set()
    );
  }

  function goToPage(): void {
    const value = Number(pageInput);

    if (!Number.isFinite(value)) {
      setPageInput(String(page + 1));
      return;
    }

    const next = Math.min(
      Math.max(Math.floor(value), 1),
      pageCount
    );
    setPage(next - 1);
    setPageInput(String(next));
  }

  async function handleBatchDelete(): Promise<void> {
    if (pageSelectedIds.length === 0) {
      return;
    }

    if (
      !window.confirm(
        `从策略统计中删除选中的 ${pageSelectedIds.length} 条记录？\n原始信号记录不会被删除。`
      )
    ) {
      return;
    }

    setError("");

    try {
      await api("/api/signals/stats/batch-delete", {
        method: "POST",
        body: JSON.stringify({ ids: pageSelectedIds })
      });
      setSelectedIds(new Set());
      await loadStats();
      await loadResultStats();

      if (entries.length === pageSelectedIds.length && page > 0) {
        setPage((current) => current - 1);
      } else {
        setReloadKey((current) => current + 1);
      }
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    }
  }

  async function loadStats(): Promise<void> {
    try {
      setStats(await api<SignalStats>("/api/signals/stats"));
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  }

  async function loadResultStats(): Promise<void> {
    try {
      setResultStats(
        await api<StatsResultStats>(
          `/api/signals/stats/results?symbol=${encodeURIComponent(
            resultSymbol
          )}`
        )
      );
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  }

  useEffect(() => {
    void loadStats();
  }, []);

  useEffect(() => {
    void loadResultStats();
  }, [resultSymbol]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(query.trim());
      setPage(0);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;

    async function loadEntries(): Promise<void> {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(page * PAGE_SIZE),
          search
        });

        if (symbolFilter !== "ALL") {
          params.set("symbol", symbolFilter);
        }

        if (typeFilter !== "ALL") {
          params.set("event_type", typeFilter);
        }

        if (resultFilter !== "ALL") {
          params.set("result", resultFilter);
        }

        const data = await api<StrategyStatsPage>(
          `/api/signals/stats/entries?${params.toString()}`
        );

        if (!cancelled) {
          setEntries(data.items);
          setTotal(data.total);
          setUnfilledTotal(data.unfilled);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(errorMessage(loadError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadEntries();

    return () => {
      cancelled = true;
    };
  }, [
    page,
    search,
    symbolFilter,
    typeFilter,
    resultFilter,
    reloadKey
  ]);

  async function handleDelete(
    entry: StrategyStatsEntry
  ): Promise<void> {
    const label = `${entry.symbol} ${formatTime(entry.event_time)}`;

    if (
      !window.confirm(
        `从策略统计中删除这条记录？\n\n${label}\n原始信号记录不会被删除。`
      )
    ) {
      return;
    }

    setDeletingId(entry.id);
    setError("");

    try {
      await api(`/api/signals/${entry.id}/stats`, {
        method: "DELETE"
      });
      await loadStats();
      await loadResultStats();
      await Promise.resolve(onChanged());

      if (entries.length === 1 && page > 0) {
        setPage((current) => current - 1);
      } else {
        setReloadKey((current) => current + 1);
      }
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setDeletingId(null);
    }
  }

  function openNoteEditor(entry: StrategyStatsEntry): void {
    setNoteEntry(entry);
    setNoteDraft(entry.stats_note ?? "");
    setError("");
  }

  async function saveNote(): Promise<void> {
    if (!noteEntry) {
      return;
    }

    setSavingNote(true);
    setError("");

    try {
      const updated = await api<{
        id: number;
        stats_note: string | null;
        stats_result: StatsResult | null;
      }>(`/api/signals/${noteEntry.id}/stats`, {
        method: "PATCH",
        body: JSON.stringify({ note: noteDraft })
      });

      setEntries((current) =>
        current.map((entry) =>
          entry.id === noteEntry.id
            ? { ...entry, stats_note: updated.stats_note }
            : entry
        )
      );
      setNoteEntry(null);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSavingNote(false);
    }
  }

  async function saveResult(
    entry: StrategyStatsEntry,
    value: string
  ): Promise<void> {
    const result =
      value === "" ? null : (value as StatsResult);

    setSavingResultId(entry.id);
    setError("");

    try {
      await api(`/api/signals/${entry.id}/stats`, {
        method: "PATCH",
        body: JSON.stringify({ result })
      });

      setEntries((current) =>
        current.map((item) =>
          item.id === entry.id
            ? { ...item, stats_result: result }
            : item
        )
      );
      await loadResultStats();

      if (
        resultFilter !== "ALL" &&
        entries.length === 1 &&
        page > 0
      ) {
        setPage((current) => current - 1);
      } else {
        setReloadKey((current) => current + 1);
      }
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSavingResultId(null);
    }
  }

  async function backfillTrends(): Promise<void> {
    if (missingReferenceIds.length === 0 || backfilling) {
      return;
    }

    setBackfilling(true);
    setBackfillMessage("");
    setError("");

    try {
      const result = await api<{
        updated: number;
        failed: number;
        remaining: number;
      }>("/api/signals/stats/backfill-trends", {
        method: "POST",
        body: JSON.stringify({ ids: missingReferenceIds })
      });

      setBackfillMessage(
        `已还原 ${result.updated} 条，失败 ${result.failed} 条，剩余 ${result.remaining} 条`
      );
      setReloadKey((current) => current + 1);
    } catch (backfillError) {
      setError(errorMessage(backfillError));
    } finally {
      setBackfilling(false);
    }
  }

  return (
    <>
      <div
        className={`modal-backdrop ${
          pageMode ? "strategy-stats-page-wrap" : ""
        }`}
        onMouseDown={(event) => {
          if (
            event.target === event.currentTarget &&
            onClose
          ) {
            onClose();
          }
        }}
      >
        <div
          className={`modal strategy-stats-modal ${
            pageMode ? "strategy-stats-page-panel" : ""
          }`}
        >
        <div className="modal-title-row">
          <div>
            <h2>策略统计</h2>
            <div className="modal-subtitle">
              只统计打开「纳入策略统计」开关的监控入场信号
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              className="modal-close"
              aria-label="关闭"
              onClick={onClose}
            >
              ×
            </button>
          )}
        </div>

        <div className="strategy-stats-summary">
          {(stats.by_preset ?? []).length === 0 ? (
            <div className="empty">
              暂无纳入统计的监控项，请新建监控时打开统计开关
            </div>
          ) : (
            stats.by_preset?.map((preset) => (
              <div
                className="strategy-stats-summary-card"
                key={preset.preset_id}
              >
                <strong>{preset.preset_name}</strong>
                <span>
                  {preset.monitors} 个监控项 · 今日 {preset.today} ·
                  累计 {preset.total}
                </span>
                <span>
                  最近{" "}
                  {preset.last_event_time
                    ? formatTime(preset.last_event_time)
                    : "--"}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="result-stats-section">
          <div className="result-stats-head">
            <div>
              <h3>结果占比</h3>
              <span>
                总记录 {resultStats.total} · 已填写{" "}
                {resultStats.filled} · 未填写{" "}
                {resultStats.unfilled}
              </span>
            </div>
            <select
              value={resultSymbol}
              onChange={(event) =>
                setResultSymbol(event.target.value)
              }
            >
              <option value="">全部标的</option>
              {resultStats.symbols.map((symbol) => (
                <option value={symbol} key={symbol}>
                  {symbol}
                </option>
              ))}
            </select>
          </div>

          <div className="result-stats-grid">
            {resultStats.by_result.map((item) => (
              <div
                className="result-stat-card"
                key={item.result}
              >
                <div className="result-stat-top">
                  <span>
                    {RESULT_LABELS.get(item.result) ??
                      item.result}
                  </span>
                  <strong>
                    {item.pct.toFixed(1)}%
                  </strong>
                </div>
                <div className="result-stat-bar">
                  <span
                    style={{
                      width: `${Math.min(item.pct, 100)}%`
                    }}
                  />
                </div>
                <div className="result-stat-count">
                  {item.count} 条
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="strategy-stats-toolbar">
          <label className="search-box strategy-stats-search">
            <span aria-hidden="true">⌕</span>
            <input
              value={query}
              placeholder="搜索标的 / 预设 / 监控项 / 备注"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="strategy-stats-actions">
            <button
              type="button"
              className="button small"
              onClick={() => setExportOpen(true)}
            >
              导出 Excel
            </button>
            {pageSelectedIds.length > 0 && (
              <button
                type="button"
                className="button small danger"
                onClick={() => void handleBatchDelete()}
              >
                批量删除 ({pageSelectedIds.length})
              </button>
            )}
            {missingReferenceIds.length > 0 && (
              <button
                type="button"
                className="button small"
                disabled={backfilling}
                onClick={() => void backfillTrends()}
              >
                {backfilling
                  ? "还原中…"
                  : `还原历史趋势 (${missingReferenceIds.length})`}
              </button>
            )}
            {backfillMessage && (
              <span className="strategy-stats-count">
                {backfillMessage}
              </span>
            )}
            <span className="strategy-stats-count">
              共 {total} 条 · 未填写 {unfilledTotal} 条
            </span>
          </div>
        </div>

        <div className="strategy-stats-filters">
          <select
            value={symbolFilter}
            aria-label="筛选标的"
            onChange={(event) => {
              setSymbolFilter(event.target.value);
              setPage(0);
            }}
          >
            <option value="ALL">全部标的</option>
            {resultStats.symbols.map((symbol) => (
              <option value={symbol} key={symbol}>
                {symbol}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            aria-label="筛选类型"
            onChange={(event) => {
              setTypeFilter(event.target.value);
              setPage(0);
            }}
          >
            <option value="ALL">全部类型</option>
            <option value="ENTRY_LONG">做多入场</option>
            <option value="ENTRY_SHORT">做空入场</option>
          </select>
          <select
            value={resultFilter}
            aria-label="筛选结果"
            onChange={(event) => {
              setResultFilter(event.target.value);
              setPage(0);
            }}
          >
            <option value="ALL">全部结果</option>
            {RESULT_OPTIONS.filter(
              (option) => option.value !== ""
            ).map((option) => (
              <option
                value={option.value}
                key={option.value}
              >
                {option.label}
              </option>
            ))}
            <option value="unfilled">未填写</option>
          </select>
        </div>

        {error && <div className="error-box">{error}</div>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="stats-select-cell">
                  <input
                    type="checkbox"
                    aria-label="全选当前页统计"
                    checked={allPageSelected}
                    onChange={(event) =>
                      togglePageSelection(event.target.checked)
                    }
                  />
                </th>
                <th>时间</th>
                <th>标的</th>
                <th>预设</th>
                <th>方向</th>
                <th>价格</th>
                <th>类型</th>
                <th>大级别参考</th>
                <th>备注</th>
                <th>结果</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} className="table-empty">
                    加载中…
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={11} className="table-empty">
                    暂无统计记录
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className={
                      entry.stats_result
                        ? "stats-row"
                        : "stats-row stats-row-unfilled"
                    }
                  >
                    <td className="stats-select-cell">
                      <input
                        type="checkbox"
                        aria-label={`选择 ${entry.symbol} ${formatTime(
                          entry.event_time
                        )}`}
                        checked={selectedIds.has(entry.id)}
                        onChange={(event) =>
                          setSelectedIds((current) => {
                            const next = new Set(current);

                            if (event.target.checked) {
                              next.add(entry.id);
                            } else {
                              next.delete(entry.id);
                            }

                            return next;
                          })
                        }
                      />
                    </td>
                    <td>{formatTime(entry.event_time)}</td>
                    <td>{entry.symbol}</td>
                    <td>{entry.preset_name ?? "自定义/历史"}</td>
                    <td>
                      <span
                        className={`direction-badge ${
                          entry.direction === "BULL"
                            ? "bull"
                            : entry.direction === "BEAR"
                              ? "bear"
                              : "neutral"
                        }`}
                      >
                        {entry.direction === "BULL"
                          ? "↗ 做多"
                          : entry.direction === "BEAR"
                            ? "↘ 做空"
                            : "—"}
                      </span>
                    </td>
                    <td>{formatPrice(entry.price)}</td>
                    <td>{eventTypeLabel(entry.event_type)}</td>
                    <td>
                      <ReferenceTags
                        items={referenceTagItems(
                          entry.reference_trends
                        )}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`stats-note ${
                          entry.stats_note ? "has-note" : ""
                        }`}
                        title={entry.stats_note ?? "添加备注"}
                        onClick={() => openNoteEditor(entry)}
                      >
                        {entry.stats_note || "添加备注"}
                      </button>
                    </td>
                    <td>
                      <select
                        className="stats-result-select"
                        value={entry.stats_result ?? ""}
                        disabled={savingResultId === entry.id}
                        onChange={(event) =>
                          void saveResult(
                            entry,
                            event.target.value
                          )
                        }
                      >
                        {RESULT_OPTIONS.map((option) => (
                          <option
                            value={option.value}
                            key={option.value || "empty"}
                          >
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="danger-link"
                        disabled={deletingId === entry.id}
                        onClick={() => void handleDelete(entry)}
                      >
                        {deletingId === entry.id
                          ? "删除中"
                          : "删除"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="strategy-stats-pagination">
          <span>
            第 {page + 1} / {pageCount} 页
          </span>
          <div>
            <input
              className="stats-page-input"
              type="number"
              min={1}
              max={pageCount}
              value={pageInput}
              aria-label="跳转页码"
              onChange={(event) =>
                setPageInput(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  goToPage();
                }
              }}
            />
            <button
              type="button"
              className="button"
              disabled={loading}
              onClick={goToPage}
            >
              跳转
            </button>
            <button
              type="button"
              className="button"
              disabled={page === 0 || loading}
              onClick={() =>
                setPage((current) => Math.max(0, current - 1))
              }
            >
              上一页
            </button>
            <button
              type="button"
              className="button"
              disabled={page + 1 >= pageCount || loading}
              onClick={() => setPage((current) => current + 1)}
            >
              下一页
            </button>
          </div>
        </div>
        </div>
      </div>

      {noteEntry && (
        <div
          className="modal-backdrop stats-note-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setNoteEntry(null);
            }
          }}
        >
          <div className="modal stats-note-modal">
            <div className="modal-title-row">
              <div>
                <h2>备注</h2>
                <div className="modal-subtitle">
                  {noteEntry.symbol} ·{" "}
                  {formatTime(noteEntry.event_time)}
                </div>
              </div>
              <button
                type="button"
                className="modal-close"
                aria-label="关闭"
                onClick={() => setNoteEntry(null)}
              >
                ×
              </button>
            </div>

            <textarea
              className="stats-note-textarea"
              rows={8}
              maxLength={5000}
              value={noteDraft}
              placeholder="记录这笔信号的判断、市场背景或复盘备注"
              onChange={(event) =>
                setNoteDraft(event.target.value)
              }
              autoFocus
            />

            <div className="modal-footer">
              <span className="field-help">
                {noteDraft.length} / 5000
              </span>
              <div className="form-actions">
                <button
                  type="button"
                  className="button"
                  disabled={savingNote}
                  onClick={() => setNoteEntry(null)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={savingNote}
                  onClick={() => void saveNote()}
                >
                  {savingNote ? "保存中…" : "保存备注"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {exportOpen && (
        <StatsExportModal
          symbols={resultStats.symbols}
          onClose={() => setExportOpen(false)}
        />
      )}
    </>
  );
}
