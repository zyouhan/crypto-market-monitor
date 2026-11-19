"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";

import { api, errorMessage } from "../lib/api";
import { formatTime } from "../lib/format";
import { Pagination } from "./Pagination";
import { TruncatedText } from "./TruncatedText";
import type {
  MindsetData,
  TradeCurvePoint,
  TradePage,
  TradeQuality,
  TradeRecord
} from "../types";

const PAGE_SIZE = 20;

const QUALITY_OPTIONS: Array<{
  value: TradeQuality;
  label: string;
}> = [
  { value: "excellent", label: "优" },
  { value: "good", label: "良" },
  { value: "fair", label: "中" },
  { value: "poor", label: "差" }
];

interface Filters {
  symbol: string;
  start: string;
  end: string;
  open_quality: string;
  close_quality: string;
  take_profit_quality: string;
  stop_loss_quality: string;
}

interface TradeForm {
  symbol: string;
  direction: "BULL" | "BEAR";
  open_time: string;
  close_time: string;
  pnl: string;
  open_quality: TradeQuality;
  close_quality: TradeQuality;
  take_profit_quality: TradeQuality;
  stop_loss_quality: TradeQuality;
  note: string;
}

const EMPTY_FILTERS: Filters = {
  symbol: "",
  start: "",
  end: "",
  open_quality: "",
  close_quality: "",
  take_profit_quality: "",
  stop_loss_quality: ""
};

function todayKey(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Shanghai"
  });
}

function toLocalInput(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): number {
  return new Date(value).getTime();
}

function qualityLabel(value: TradeQuality): string {
  return (
    QUALITY_OPTIONS.find((option) => option.value === value)
      ?.label ?? value
  );
}

function qualityTone(value: TradeQuality): string {
  return `quality-${value}`;
}

function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000));

  if (minutes < 60) {
    return `${minutes} 分钟`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest > 0 ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
}

function statusLabel(status: MindsetData["status"]): string {
  switch (status) {
    case "healthy":
      return "健康";
    case "tired":
      return "轻度疲劳";
    case "unstable":
      return "状态不稳";
    case "stop":
      return "不适合交易";
    default:
      return "未评估";
  }
}

function defaultForm(): TradeForm {
  const now = Date.now();

  return {
    symbol: "",
    direction: "BULL",
    open_time: toLocalInput(now - 60 * 60 * 1000),
    close_time: toLocalInput(now),
    pnl: "",
    open_quality: "good",
    close_quality: "good",
    take_profit_quality: "good",
    stop_loss_quality: "good",
    note: ""
  };
}

function axisTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function EquityCurve({
  points
}: {
  points: TradeCurvePoint[];
}) {
  if (points.length === 0) {
    return <div className="empty">暂无收益数据</div>;
  }

  const sorted = [...points].sort(
    (left, right) => left.time - right.time
  );
  const width = 860;
  const height = 260;
  const padding = 38;
  const bottomPadding = 44;
  const chartBottom = height - bottomPadding;
  const values = sorted.map((point) => point.cumulative);
  let min = Math.min(0, ...values);
  let max = Math.max(0, ...values);

  if (min === max) {
    min -= 1;
    max += 1;
  }

  const minTime = sorted[0].time;
  const maxTime = sorted[sorted.length - 1].time;
  const x = (time: number) =>
    minTime === maxTime
      ? width / 2
      : padding +
        ((time - minTime) / (maxTime - minTime)) *
          (width - padding * 2);
  const y = (value: number) =>
    chartBottom -
    ((value - min) / (max - min)) *
      (chartBottom - padding);
  const line = sorted
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${x(point.time)} ${y(
          point.cumulative
        )}`
    )
    .join(" ");
  const zeroY = y(0);
  const area = `${line} L ${x(sorted[sorted.length - 1].time)} ${
    chartBottom
  } L ${x(sorted[0].time)} ${chartBottom} Z`;
  const ticks =
    minTime === maxTime
      ? [minTime]
      : [minTime, (minTime + maxTime) / 2, maxTime];

  return (
    <div className="trade-curve">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="累计收益曲线"
      >
        <line
          x1={padding}
          x2={width - padding}
          y1={zeroY}
          y2={zeroY}
          className="trade-curve-zero"
        />
        <line
          x1={padding}
          x2={width - padding}
          y1={chartBottom}
          y2={chartBottom}
          className="trade-curve-axis"
        />
        {sorted.length > 1 && (
          <path d={area} className="trade-curve-area" />
        )}
        <path d={line} className="trade-curve-line" />
        {sorted.map((point, index) => (
          <circle
            key={`${point.time}-${index}`}
            cx={x(point.time)}
            cy={y(point.cumulative)}
            r={3.2}
            className={
              point.cumulative >= 0
                ? "trade-curve-dot bull"
                : "trade-curve-dot bear"
            }
          >
            <title>
              {formatTime(point.time)} · 单笔 {point.pnl >= 0 ? "+" : ""}
              {point.pnl.toFixed(2)} · 累计{" "}
              {point.cumulative >= 0 ? "+" : ""}
              {point.cumulative.toFixed(2)}
            </title>
          </circle>
        ))}
        {ticks.map((tick, index) => (
          <text
            key={tick}
            x={x(tick)}
            y={height - 14}
            textAnchor={
              ticks.length === 1
                ? "middle"
                : index === 0
                  ? "start"
                  : index === ticks.length - 1
                    ? "end"
                    : "middle"
            }
            className="trade-curve-axis-label"
          >
            {axisTime(tick)}
          </text>
        ))}
        <text x={padding} y={16} className="trade-curve-label">
          {max.toFixed(2)}
        </text>
        <text
          x={padding}
          y={chartBottom - 6}
          className="trade-curve-label"
        >
          {min.toFixed(2)}
        </text>
      </svg>
    </div>
  );
}

export function TradesPanel() {
  const [records, setRecords] = useState<TradeRecord[]>([]);
  const [curve, setCurve] = useState<TradeCurvePoint[]>([]);
  const [mindset, setMindset] = useState<MindsetData | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [symbolInput, setSymbolInput] = useState("");
  const [mindDate, setMindDate] = useState(todayKey());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TradeForm>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetNote, setResetNote] = useState("");
  const [resetSaving, setResetSaving] = useState(false);
  const [resetError, setResetError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => ({
        ...current,
        symbol: symbolInput.trim().toUpperCase()
      }));
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [symbolInput]);

  const query = useMemo(() => {
    const params = new URLSearchParams();

    if (filters.symbol) {
      params.set("symbol", filters.symbol);
    }

    if (filters.start) {
      params.set("start", filters.start);
    }

    if (filters.end) {
      params.set("end", filters.end);
    }

    for (const key of [
      "open_quality",
      "close_quality",
      "take_profit_quality",
      "stop_loss_quality"
    ] as const) {
      if (filters[key]) {
        params.set(key, filters[key]);
      }
    }

    return params;
  }, [filters]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams(query);
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      const data = await api<TradePage>(
        `/api/trades?${params.toString()}`
      );
      setRecords(data.items);
      setTotal(data.total);
      setTotalPages(data.total_pages);
      setPage(data.page);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [page, query]);

  const loadCurve = useCallback(async () => {
    try {
      const data = await api<TradeCurvePoint[]>(
        `/api/trades/curve?${query.toString()}`
      );
      setCurve(data);
    } catch {
      setCurve([]);
    }
  }, [query]);

  const loadMindset = useCallback(async () => {
    try {
      const data = await api<MindsetData>(
        `/api/trades/mindset?date=${encodeURIComponent(mindDate)}`
      );
      setMindset(data);
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  }, [mindDate]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    void loadCurve();
  }, [loadCurve]);

  useEffect(() => {
    void loadMindset();
  }, [loadMindset]);

  async function refreshAll(): Promise<void> {
    await Promise.all([
      loadRecords(),
      loadCurve(),
      loadMindset()
    ]);
  }

  function openCreate(): void {
    setEditingId(null);
    setForm(defaultForm());
    setFormOpen(true);
    setError("");
  }

  function openEdit(record: TradeRecord): void {
    setEditingId(record.id);
    setForm({
      symbol: record.symbol,
      direction: record.direction,
      open_time: toLocalInput(record.open_time),
      close_time: toLocalInput(record.close_time),
      pnl: String(record.pnl),
      open_quality: record.open_quality,
      close_quality: record.close_quality,
      take_profit_quality: record.take_profit_quality,
      stop_loss_quality: record.stop_loss_quality,
      note: record.note ?? ""
    });
    setFormOpen(true);
    setError("");
  }

  async function saveRecord(): Promise<void> {
    if (saving) {
      return;
    }

    if (!form.symbol.trim()) {
      setError("请输入标的");
      return;
    }

    if (form.pnl.trim() === "") {
      setError("请输入收益");
      return;
    }

    const openTime = fromLocalInput(form.open_time);
    const closeTime = fromLocalInput(form.close_time);

    if (
      !Number.isFinite(openTime) ||
      !Number.isFinite(closeTime)
    ) {
      setError("开仓/清仓时间不正确");
      return;
    }

    if (closeTime < openTime) {
      setError("清仓时间不能早于开仓时间");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const body = JSON.stringify({
        symbol: form.symbol,
        direction: form.direction,
        open_time: openTime,
        close_time: closeTime,
        pnl: Number(form.pnl),
        open_quality: form.open_quality,
        close_quality: form.close_quality,
        take_profit_quality: form.take_profit_quality,
        stop_loss_quality: form.stop_loss_quality,
        note: form.note
      });

      if (editingId === null) {
        await api("/api/trades", {
          method: "POST",
          body
        });
      } else {
        await api(`/api/trades/${editingId}`, {
          method: "PUT",
          body
        });
      }

      setFormOpen(false);
      await refreshAll();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function deleteRecord(record: TradeRecord): Promise<void> {
    if (
      !window.confirm(
        `删除 ${record.symbol} ${formatTime(record.close_time)} 的交易记录？`
      )
    ) {
      return;
    }

    try {
      await api(`/api/trades/${record.id}`, {
        method: "DELETE"
      });
      await refreshAll();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    }
  }

  async function resetMindset(): Promise<void> {
    if (resetSaving) {
      return;
    }

    if (!resetNote.trim()) {
      setResetError("请填写复盘备注");
      return;
    }

    setResetSaving(true);
    setResetError("");

    try {
      const data = await api<MindsetData>(
        "/api/trades/mindset/reset",
        {
          method: "POST",
          body: JSON.stringify({
            date: mindDate,
            note: resetNote
          })
        }
      );
      setMindset(data);
      setResetOpen(false);
      setResetNote("");
    } catch (resetFailure) {
      setResetError(errorMessage(resetFailure));
    } finally {
      setResetSaving(false);
    }
  }

  const positive = (mindset?.pnl ?? 0) >= 0;
  const editingRecord =
    editingId === null
      ? null
      : records.find((record) => record.id === editingId) ?? null;
  const editingLinked =
    editingRecord?.self_check_exists === 1;

  return (
    <>
      <section className={`panel trade-mindset-panel ${mindset?.status ?? "unrated"}`}>
        <div className="panel-header trade-mindset-head">
          <div>
            <div className="panel-title">心态健康度</div>
            <div className="panel-subtitle">
              根据当日交易收益、持仓时长和操作评价实时计算
            </div>
          </div>
          <input
            type="date"
            className="trade-mind-date"
            value={mindDate}
            onChange={(event) => setMindDate(event.target.value)}
          />
        </div>

        {!mindset ? (
          <div className="empty">正在评估…</div>
        ) : (
          <>
            <div className="trade-mindset-summary">
              <div className="trade-mindset-score">
                <span>心态分</span>
                <strong>
                  {mindset.score === null ? "—" : mindset.score}
                </strong>
                <b className={`trade-mindset-status ${mindset.status}`}>
                  {statusLabel(mindset.status)}
                </b>
              </div>
              <div className="trade-mindset-metrics">
                <span>
                  当日收益
                  <b className={positive ? "positive" : "negative"}>
                    {mindset.pnl >= 0 ? "+" : ""}
                    {mindset.pnl.toFixed(2)}
                  </b>
                </span>
                <span>
                  交易
                  <b>{mindset.trade_count} 笔</b>
                </span>
                <span>
                  胜率
                  <b>{Math.round(mindset.win_rate * 100)}%</b>
                </span>
                <span>
                  平均持仓
                  <b>{Math.round(mindset.average_hold_minutes)} 分</b>
                </span>
              </div>
            </div>

            <div className={`trade-mindset-warning ${mindset.status}`}>
              {mindset.warning}
            </div>

            <div className="trade-mindset-factors">
              {mindset.factors.map((factor) => (
                <div className="trade-mindset-factor" key={factor.key}>
                  <div>
                    <span>{factor.label}</span>
                    <b>{factor.value}</b>
                  </div>
                  <div>
                    <strong
                      className={
                        factor.penalty < 0
                          ? "negative"
                          : factor.penalty > 0
                            ? "positive"
                            : "neutral"
                      }
                    >
                      {factor.penalty > 0 ? "+" : ""}
                      {factor.penalty}
                    </strong>
                    <p>{factor.detail}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="trade-reset-row">
              <button
                type="button"
                className="button small"
                disabled={!mindset.reset.available}
                title={mindset.reset.reason || undefined}
                onClick={() => {
                  setResetOpen(true);
                  setResetNote("");
                  setResetError("");
                }}
              >
                重置疲劳
              </button>
              <span>
                {mindset.reset.available
                  ? "只清除持仓疲劳因子，不清除收益和操作问题"
                  : mindset.reset.reason}
              </span>
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">交易记录</div>
            <div className="panel-subtitle">
              共 {total} 笔 · 搜索时间、标的和操作评价
            </div>
          </div>
          <button
            type="button"
            className="button primary"
            onClick={openCreate}
          >
            + 新增交易
          </button>
        </div>

        {error && <div className="error-box">{error}</div>}

        <div className="trade-filters">
          <label>
            标的
            <input
              value={symbolInput}
              placeholder="搜索标的"
              onChange={(event) => setSymbolInput(event.target.value)}
            />
          </label>
          <label>
            开始日期
            <input
              type="date"
              value={filters.start}
              onChange={(event) => {
                setFilters((current) => ({
                  ...current,
                  start: event.target.value
                }));
                setPage(1);
              }}
            />
          </label>
          <label>
            结束日期
            <input
              type="date"
              value={filters.end}
              onChange={(event) => {
                setFilters((current) => ({
                  ...current,
                  end: event.target.value
                }));
                setPage(1);
              }}
            />
          </label>
          {[
            ["open_quality", "开仓"],
            ["close_quality", "清仓"],
            ["take_profit_quality", "止盈"],
            ["stop_loss_quality", "止损"]
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <select
                value={filters[key as keyof Filters]}
                onChange={(event) => {
                  setFilters((current) => ({
                    ...current,
                    [key]: event.target.value
                  }));
                  setPage(1);
                }}
              >
                <option value="">全部</option>
                {QUALITY_OPTIONS.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button
            type="button"
            className="button small"
            onClick={() => {
              setSymbolInput("");
              setFilters(EMPTY_FILTERS);
              setPage(1);
            }}
          >
            清除筛选
          </button>
        </div>

        {loading ? (
          <div className="empty">加载中…</div>
        ) : records.length === 0 ? (
          <div className="empty">暂无交易记录</div>
        ) : (
          <div className="table-wrap">
            <table className="trade-table">
              <thead>
                <tr>
                  <th>标的</th>
                  <th>方向</th>
                  <th>来源</th>
                  <th>开仓时间</th>
                  <th>清仓时间</th>
                  <th>持仓</th>
                  <th>收益</th>
                  <th>开仓</th>
                  <th>清仓</th>
                  <th>止盈</th>
                  <th>止损</th>
                  <th>备注</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>{record.symbol}</td>
                    <td>
                      <span
                        className={`direction-badge ${
                          record.direction === "BULL" ? "bull" : "bear"
                        }`}
                      >
                        {record.direction === "BULL" ? "做多" : "做空"}
                      </span>
                    </td>
                    <td>
                      {record.self_check_id ? (
                        record.self_check_exists ? (
                          <a
                            className="trade-source-link"
                            href="/self-checks"
                          >
                            开单自查
                          </a>
                        ) : (
                          <span className="trade-source-broken">
                            关联已删除
                          </span>
                        )
                      ) : (
                        <span className="trade-source-manual">
                          手动
                        </span>
                      )}
                    </td>
                    <td>{formatTime(record.open_time)}</td>
                    <td>{formatTime(record.close_time)}</td>
                    <td>
                      {formatDuration(
                        record.close_time - record.open_time
                      )}
                    </td>
                    <td
                      className={
                        record.pnl >= 0 ? "positive" : "negative"
                      }
                    >
                      {record.pnl >= 0 ? "+" : ""}
                      {record.pnl.toFixed(2)}
                    </td>
                    <td>
                      <span
                        className={`quality-tag ${qualityTone(
                          record.open_quality
                        )}`}
                      >
                        {qualityLabel(record.open_quality)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`quality-tag ${qualityTone(
                          record.close_quality
                        )}`}
                      >
                        {qualityLabel(record.close_quality)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`quality-tag ${qualityTone(
                          record.take_profit_quality
                        )}`}
                      >
                        {qualityLabel(record.take_profit_quality)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`quality-tag ${qualityTone(
                          record.stop_loss_quality
                        )}`}
                      >
                        {qualityLabel(record.stop_loss_quality)}
                      </span>
                    </td>
                    <td className="trade-note">
                      <TruncatedText
                        value={record.note}
                        maxWidth={220}
                      />
                    </td>
                    <td>
                      <div className="trade-row-actions">
                        <button
                          type="button"
                          className="button small"
                          onClick={() => openEdit(record)}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          className="button small danger"
                          disabled={record.self_check_exists === 1}
                          title={
                            record.self_check_exists === 1
                              ? "来自开单自查，不能直接删除"
                              : undefined
                          }
                          onClick={() => void deleteRecord(record)}
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          totalPages={totalPages}
          loading={loading}
          onPage={setPage}
        />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">收益曲线</div>
            <div className="panel-subtitle">
              按当前筛选条件统计累计收益
            </div>
          </div>
        </div>
        <EquityCurve points={curve} />
      </section>

      {formOpen && (
        <div
          className="modal-backdrop trade-form-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setFormOpen(false);
            }
          }}
        >
          <section className="modal trade-form-modal">
            <div className="case-detail-head">
              <h2>{editingId === null ? "新增交易" : "编辑交易"}</h2>
              <button
                type="button"
                className="notes-close"
                aria-label="关闭"
                onClick={() => setFormOpen(false)}
              >
                ×
              </button>
            </div>

            {error && <div className="error-box">{error}</div>}

            {editingLinked && (
              <div className="trade-linked-hint">
                来自开单自查，只能修改收益、四项评价和备注。
              </div>
            )}

            <div className="note-form trade-form">
              <div className="trade-form-grid">
                <label>
                  标的
                  <input
                    value={form.symbol}
                    disabled={editingLinked}
                    placeholder="例如 BTCUSDT"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        symbol: event.target.value.toUpperCase()
                      }))
                    }
                  />
                </label>
                <label>
                  方向
                  <select
                    value={form.direction}
                    disabled={editingLinked}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        direction: event.target.value as
                          | "BULL"
                          | "BEAR"
                      }))
                    }
                  >
                    <option value="BULL">做多</option>
                    <option value="BEAR">做空</option>
                  </select>
                </label>
                <label>
                  开仓时间
                  <input
                    type="datetime-local"
                    value={form.open_time}
                    disabled={editingLinked}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        open_time: event.target.value
                      }))
                    }
                  />
                </label>
                <label>
                  清仓时间
                  <input
                    type="datetime-local"
                    value={form.close_time}
                    disabled={editingLinked}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        close_time: event.target.value
                      }))
                    }
                  />
                </label>
                <label>
                  收益（USDT）
                  <input
                    type="number"
                    step="any"
                    value={form.pnl}
                    placeholder="例如 35.20"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        pnl: event.target.value
                      }))
                    }
                  />
                </label>
              </div>

              <div className="trade-quality-grid">
                {[
                  ["open_quality", "开仓时机"],
                  ["close_quality", "清仓时机"],
                  ["take_profit_quality", "止盈评价"],
                  ["stop_loss_quality", "止损评价"]
                ].map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <select
                      value={form[key as keyof TradeForm] as string}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          [key]: event.target.value
                        }))
                      }
                    >
                      {QUALITY_OPTIONS.map((option) => (
                        <option value={option.value} key={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <label>
                备注
                <textarea
                  rows={4}
                  value={form.note}
                  maxLength={1000}
                  placeholder="记录交易逻辑、执行问题和复盘"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      note: event.target.value
                    }))
                  }
                />
              </label>

              <div className="note-form-actions">
                <button
                  type="button"
                  className="button small"
                  disabled={saving}
                  onClick={() => setFormOpen(false)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="button small primary"
                  disabled={saving}
                  onClick={() => void saveRecord()}
                >
                  {saving ? "保存中…" : "保存"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {resetOpen && (
        <div
          className="modal-backdrop trade-reset-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !resetSaving) {
              setResetOpen(false);
            }
          }}
        >
          <section className="modal trade-reset-modal">
            <div className="case-detail-head">
              <h2>重置疲劳</h2>
              <button
                type="button"
                className="notes-close"
                aria-label="关闭"
                onClick={() => setResetOpen(false)}
              >
                ×
              </button>
            </div>
            <p className="trade-reset-desc">
              重置只清除当日的持仓疲劳因子，不会清除收益、开仓、清仓、止盈和止损问题。
              今天只能重置一次，并进入 30 分钟冷静期。
            </p>
            {resetError && <div className="error-box">{resetError}</div>}
            <label className="self-check-note-label">
              复盘备注
              <textarea
                rows={4}
                value={resetNote}
                maxLength={1000}
                placeholder="写清楚这次失误、原因和下一步行动"
                onChange={(event) => setResetNote(event.target.value)}
              />
            </label>
            <div className="note-form-actions">
              <button
                type="button"
                className="button small"
                disabled={resetSaving}
                onClick={() => setResetOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="button small primary"
                disabled={resetSaving}
                onClick={() => void resetMindset()}
              >
                {resetSaving ? "重置中…" : "确认重置"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
