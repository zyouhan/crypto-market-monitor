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
import type {
  SignalStats,
  StrategyStatsEntry,
  StrategyStatsPage
} from "../types";

const PAGE_SIZE = 20;

interface StrategyStatsModalProps {
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}

function directionLabel(
  direction: StrategyStatsEntry["direction"]
): string {
  return direction === "BEAR" ? "做空" : "做多";
}

export function StrategyStatsModal({
  onClose,
  onChanged
}: StrategyStatsModalProps) {
  const [stats, setStats] = useState<SignalStats>({
    today: 0,
    total: 0,
    by_preset: []
  });
  const [entries, setEntries] = useState<StrategyStatsEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(
    null
  );
  const [reloadKey, setReloadKey] = useState(0);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function loadStats(): Promise<void> {
    try {
      setStats(await api<SignalStats>("/api/signals/stats"));
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  }

  useEffect(() => {
    void loadStats();
  }, []);

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
        const data = await api<StrategyStatsPage>(
          `/api/signals/stats/entries?limit=${PAGE_SIZE}&offset=${
            page * PAGE_SIZE
          }&search=${encodeURIComponent(search)}`
        );

        if (!cancelled) {
          setEntries(data.items);
          setTotal(data.total);
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
  }, [page, search, reloadKey]);

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

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="modal strategy-stats-modal">
        <div className="modal-title-row">
          <div>
            <h2>策略统计</h2>
            <div className="modal-subtitle">
              只统计打开「纳入策略统计」开关的监控入场信号
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

        <div className="strategy-stats-toolbar">
          <label className="search-box strategy-stats-search">
            <span aria-hidden="true">⌕</span>
            <input
              value={query}
              placeholder="搜索标的 / 预设 / 监控项"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <span className="strategy-stats-count">
            共 {total} 条
          </span>
        </div>

        {error && <div className="error-box">{error}</div>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>标的</th>
                <th>预设</th>
                <th>方向</th>
                <th>价格</th>
                <th>类型</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="table-empty">
                    加载中…
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-empty">
                    暂无统计记录
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatTime(entry.event_time)}</td>
                    <td>{entry.symbol}</td>
                    <td>{entry.preset_name ?? "自定义/历史"}</td>
                    <td>{directionLabel(entry.direction)}</td>
                    <td>{formatPrice(entry.price)}</td>
                    <td>{eventTypeLabel(entry.event_type)}</td>
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
  );
}
