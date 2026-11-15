"use client";

import { useCallback, useEffect, useState } from "react";

import { api, errorMessage } from "../lib/api";
import { formatTime } from "../lib/format";

const PAGE_SIZE = 20;

interface IntervalSnapshot {
  interval: string;
  j: number | null;
}

interface SelfCheckRecord {
  id: number;
  symbol: string;
  direction: "BULL" | "BEAR";
  target_interval: string;
  stop_condition: string;
  snapshot: IntervalSnapshot[] | null;
  status: "active" | "closed";
  result: "success" | "failed" | null;
  close_note: string | null;
  closed_at: number | null;
  created_at: number;
  updated_at: number;
}

interface RecordsPage {
  items: SelfCheckRecord[];
  total: number;
  page: number;
  total_pages: number;
}

function resultLabel(result: "success" | "failed" | null): string {
  if (result === "success") {
    return "成功";
  }

  if (result === "failed") {
    return "失败";
  }

  return "持仓中";
}

export function SelfCheckRecords() {
  const [items, setItems] = useState<SelfCheckRecord[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE)
      });

      if (search) {
        params.set("symbol", search);
      }

      if (result) {
        params.set("result", result);
      }

      const data = await api<RecordsPage>(
        `/api/self-checks/records?${params.toString()}`
      );
      setItems(data.items);
      setTotal(data.total);
      setTotalPages(data.total_pages);
      setPage(data.page);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [page, search, result]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="panel self-check-records-panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">开单记录</div>
          <div className="panel-subtitle">
            查看开单自查结果、止损条件和复盘备注
          </div>
        </div>
      </div>

      <div className="self-check-records-toolbar">
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            placeholder="搜索标的"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          value={result}
          onChange={(event) => {
            setResult(event.target.value);
            setPage(1);
          }}
        >
          <option value="">全部结果</option>
          <option value="success">成功</option>
          <option value="failed">失败</option>
        </select>
        <span>共 {total} 条</span>
      </div>

      {error && <div className="error-box">{error}</div>}

      {loading ? (
        <div className="empty">加载中…</div>
      ) : items.length === 0 ? (
        <div className="empty">暂无开单记录</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>标的</th>
                <th>方向</th>
                <th>目标级别</th>
                <th>开单时间</th>
                <th>平仓时间</th>
                <th>结果</th>
                <th>止损条件</th>
                <th>备注</th>
                <th>开单目标 J</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const targetJ =
                  item.snapshot?.find(
                    (snapshot) =>
                      snapshot.interval === item.target_interval
                  )?.j ?? null;

                return (
                  <tr key={item.id}>
                    <td>{item.symbol}</td>
                    <td>
                      <span
                        className={`direction-badge ${
                          item.direction === "BULL" ? "bull" : "bear"
                        }`}
                      >
                        {item.direction === "BULL" ? "做多" : "做空"}
                      </span>
                    </td>
                    <td>{item.target_interval}</td>
                    <td>{formatTime(item.created_at)}</td>
                    <td>
                      {item.closed_at
                        ? formatTime(item.closed_at)
                        : "--"}
                    </td>
                    <td>
                      <span
                        className={`self-check-result ${
                          item.result ?? "active"
                        }`}
                      >
                        {resultLabel(item.result)}
                      </span>
                    </td>
                    <td className="self-check-record-stop">
                      {item.stop_condition}
                    </td>
                    <td className="self-check-record-note">
                      {item.close_note || "--"}
                    </td>
                    <td>
                      {typeof targetJ === "number"
                        ? targetJ.toFixed(2)
                        : "--"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="strategy-stats-pagination">
        <span>
          第 {page} / {totalPages} 页
        </span>
        <div>
          <button
            type="button"
            className="button small"
            disabled={page <= 1 || loading}
            onClick={() => setPage((current) => current - 1)}
          >
            上一页
          </button>
          <button
            type="button"
            className="button small"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((current) => current + 1)}
          >
            下一页
          </button>
        </div>
      </div>
    </section>
  );
}
