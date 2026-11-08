
"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent
} from "react";

interface SymbolItem {
  id: number;
  symbol: string;
  interval: string;
  fast_ema: number;
  slow_ema: number;
  threshold: number;
  enabled: number;
  notify_enabled: number;
  current_state: "UNKNOWN" | "GOLDEN" | "DEATH";
  last_cross_type: "GOLDEN" | "DEATH" | null;
  last_cross_price: number | null;
  last_cross_time: number | null;
  last_price: number | null;
}

interface EventItem {
  id: number;
  symbol: string;
  cross_type: "GOLDEN" | "DEATH";
  cross_price: number;
  cross_time: number;
  previous_cross_price: number | null;
  price_diff: number | null;
  threshold: number;
  trigger_met: number;
  push_sent: number;
  reason: string | null;
}

interface SymbolForm {
  symbol: string;
  interval: string;
  fast_ema: number;
  slow_ema: number;
  threshold: number;
  notify_enabled: boolean;
}

const initialForm: SymbolForm = {
  symbol: "",
  interval: "1m",
  fast_ema: 9,
  slow_ema: 21,
  threshold: 10,
  notify_enabled: false
};

const intervals = [
  "1m", "3m", "5m", "15m", "30m",
  "1h", "2h", "4h", "6h", "8h",
  "12h", "1d", "3d", "1w", "1M"
];

async function api<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.message || "请求失败");
  }

  return result.data as T;
}

function formatPrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "--";
  }

  return value.toLocaleString("en-US", {
    maximumFractionDigits: 8
  });
}

function formatTime(value: number | null): string {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleString("zh-CN", {
    hour12: false
  });
}

function crossName(type: string | null): string {
  if (type === "GOLDEN") return "金叉";
  if (type === "DEATH") return "死叉";
  return "暂无交叉";
}

function stateName(type: string): string {
  if (type === "GOLDEN") return "多头排列";
  if (type === "DEATH") return "空头排列";
  return "初始化中";
}

function stateClass(type: string): string {
  if (type === "GOLDEN") return "golden";
  if (type === "DEATH") return "death";
  return "unknown";
}

export default function HomePage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [symbols, setSymbols] = useState<SymbolItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);

  const [globalNotify, setGlobalNotify] = useState(false);
  const [serverchanConfigured, setServerchanConfigured] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<SymbolForm>(initialForm);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    const [symbolData, eventData, settingsData] = await Promise.all([
      api<SymbolItem[]>("/api/symbols"),
      api<{ items: EventItem[] }>("/api/events?limit=50"),
      api<{
        global_wechat_enabled: boolean;
        serverchan_configured: boolean;
      }>("/api/settings")
    ]);

    setSymbols(symbolData);
    setEvents(eventData.items);
    setGlobalNotify(settingsData.global_wechat_enabled);
    setServerchanConfigured(settingsData.serverchan_configured);
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      await api("/api/auth/me");
      setAuthenticated(true);
    } catch {
      setAuthenticated(false);
    } finally {
      setCheckingAuth(false);
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!authenticated) return;

    let active = true;

    const refresh = async () => {
      try {
        await loadDashboard();
        if (active) setError("");
      } catch (err) {
        if (!active) return;

        const text =
          err instanceof Error ? err.message : "数据加载失败";

        if (text.includes("未登录") || text.includes("登录已过期")) {
          setAuthenticated(false);
        } else {
          setError(text);
        }
      }
    };

    void refresh();

    const timer = window.setInterval(() => {
      void refresh();
    }, 8000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [authenticated, loadDashboard]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });

      setPassword("");
      setAuthenticated(true);
      setMessage("登录成功");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await api("/api/auth/logout", {
        method: "POST"
      });
    } finally {
      setAuthenticated(false);
      setSymbols([]);
      setEvents([]);
    }
  }

  function openAddModal() {
    setEditingId(null);
    setForm(initialForm);
    setError("");
    setModalOpen(true);
  }

  function openEditModal(item: SymbolItem) {
    setEditingId(item.id);

    setForm({
      symbol: item.symbol,
      interval: item.interval,
      fast_ema: item.fast_ema,
      slow_ema: item.slow_ema,
      threshold: item.threshold,
      notify_enabled: item.notify_enabled === 1
    });

    setError("");
    setModalOpen(true);
  }

  async function handleSaveSymbol(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (form.fast_ema >= form.slow_ema) {
      setError("快线 EMA 必须小于慢线 EMA");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        symbol: form.symbol.trim().toUpperCase(),
        interval: form.interval,
        fast_ema: Number(form.fast_ema),
        slow_ema: Number(form.slow_ema),
        threshold: Number(form.threshold),
        notify_enabled: form.notify_enabled
      };

      if (editingId !== null) {
        await api(`/api/symbols/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
      } else {
        await api("/api/symbols", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }

      setModalOpen(false);
      await loadDashboard();
      setMessage(editingId === null ? "标的添加成功" : "配置更新成功");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }

  async function updateSymbol(
    id: number,
    payload: Record<string, unknown>
  ) {
    try {
      await api(`/api/symbols/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });

      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    }
  }

  async function deleteSymbol(item: SymbolItem) {
    if (!window.confirm(`确定删除 ${item.symbol} 吗？`)) {
      return;
    }

    try {
      await api(`/api/symbols/${item.id}`, {
        method: "DELETE"
      });

      await loadDashboard();
      setMessage(`${item.symbol} 已删除`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  }

  async function toggleGlobalNotify(value: boolean) {
    try {
      await api("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          global_wechat_enabled: value
        })
      });

      setGlobalNotify(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "设置失败");
    }
  }

  if (checkingAuth) {
    return (
      <main className="login-page">
        <div>正在检查登录状态...</div>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="login-page">
        <form className="login-card" onSubmit={handleLogin}>
          <h1>Crypto Market Monitor</h1>
          <p>加密货币市场 EMA 交叉监控系统</p>

          {error && <div className="message error">{error}</div>}

          <div className="form-field">
            <label>用户名</label>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="form-field">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button
            className="button primary"
            disabled={loading}
            type="submit"
          >
            {loading ? "登录中..." : "登录"}
          </button>
        </form>
      </main>
    );
  }

  const enabledCount = symbols.filter(
    (item) => item.enabled === 1
  ).length;

  const goldenCount = symbols.filter(
    (item) => item.current_state === "GOLDEN"
  ).length;

  const deathCount = symbols.filter(
    (item) => item.current_state === "DEATH"
  ).length;

  return (
    <main className="page">
      <header className="header">
        <div className="brand">
          <h1>Crypto Market Monitor</h1>
          <p>加密市场 EMA 交叉监控系统</p>
        </div>

        <div className="header-actions">
          <span className="connection">● 服务运行中</span>
          <button className="button" onClick={handleLogout}>
            退出登录
          </button>
        </div>
      </header>

      {(error || message) && (
        <div className={`message ${error ? "error" : ""}`}>
          {error || message}
          <button
            className="button small"
            style={{ marginLeft: 12 }}
            onClick={() => {
              setError("");
              setMessage("");
            }}
          >
            关闭
          </button>
        </div>
      )}

      <section className="summary-grid">
        <div className="summary-card">
          <div className="summary-label">监控标的</div>
          <div className="summary-value">{symbols.length}</div>
          <div className="summary-description">全部配置标的</div>
        </div>

        <div className="summary-card">
          <div className="summary-label">运行中</div>
          <div className="summary-value">{enabledCount}</div>
          <div className="summary-description">当前启用的监控任务</div>
        </div>

        <div className="summary-card">
          <div className="summary-label">多头排列</div>
          <div className="summary-value" style={{ color: "var(--green)" }}>
            {goldenCount}
          </div>
          <div className="summary-description">快 EMA 高于慢 EMA</div>
        </div>

        <div className="summary-card">
          <div className="summary-label">空头排列</div>
          <div className="summary-value" style={{ color: "var(--red)" }}>
            {deathCount}
          </div>
          <div className="summary-description">快 EMA 低于慢 EMA</div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">监控标的</div>
            <div className="panel-subtitle">
              每个标的独立配置 EMA 参数和触发阈值
            </div>
          </div>

          <button
            className="button primary"
            onClick={openAddModal}
          >
            + 添加标的
          </button>
        </div>

        {symbols.length === 0 ? (
          <div className="empty">暂无监控标的，请先添加</div>
        ) : (
          <div className="symbol-grid">
            {symbols.map((item) => (
              <article className="symbol-card" key={item.id}>
                <div className="symbol-card-top">
                  <div>
                    <div className="symbol-name">{item.symbol}</div>
                    <div className="symbol-period">
                      {item.interval} · EMA {item.fast_ema}/{item.slow_ema}
                    </div>
                  </div>

                  <span className={`status ${stateClass(item.current_state)}`}>
                    {stateName(item.current_state)}
                  </span>
                </div>

                <div className="price">
                  {formatPrice(item.last_price)}
                </div>
                <div className="price-label">最新已收盘 K 线价格</div>

                <div className="detail-grid">
                  <div className="detail-item">
                    <label>最近交叉</label>
                    <strong>{crossName(item.last_cross_type)}</strong>
                  </div>

                  <div className="detail-item">
                    <label>交叉价格</label>
                    <strong>{formatPrice(item.last_cross_price)}</strong>
                  </div>

                  <div className="detail-item">
                    <label>交叉时间</label>
                    <strong>{formatTime(item.last_cross_time)}</strong>
                  </div>

                  <div className="detail-item">
                    <label>价格差阈值</label>
                    <strong>{formatPrice(item.threshold)}</strong>
                  </div>
                </div>

                <div className="symbol-actions">
                  <label className="switch-row">
                    <input
                      type="checkbox"
                      checked={item.enabled === 1}
                      onChange={(event) =>
                        void updateSymbol(item.id, {
                          enabled: event.target.checked
                        })
                      }
                    />
                    监控
                  </label>

                  <label className="switch-row">
                    <input
                      type="checkbox"
                      checked={item.notify_enabled === 1}
                      onChange={(event) =>
                        void updateSymbol(item.id, {
                          notify_enabled: event.target.checked
                        })
                      }
                    />
                    微信通知
                  </label>

                  <button
                    className="button small"
                    onClick={() => openEditModal(item)}
                  >
                    编辑
                  </button>

                  <button
                    className="button small danger"
                    onClick={() => void deleteSymbol(item)}
                  >
                    删除
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">微信通知设置</div>
            <div className="panel-subtitle">
              必须同时开启全局开关和单个标的通知开关
            </div>
          </div>
        </div>

        <div className="switch-row">
          <input
            type="checkbox"
            checked={globalNotify}
            onChange={(event) =>
              void toggleGlobalNotify(event.target.checked)
            }
          />
          全局微信通知
        </div>

        <div className="panel-subtitle" style={{ marginTop: 12 }}>
          Server酱 SendKey：
          {serverchanConfigured ? "已配置" : "未配置"}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">交叉事件历史</div>
            <div className="panel-subtitle">
              最近 50 条已记录的交叉事件
            </div>
          </div>
        </div>

        {events.length === 0 ? (
          <div className="empty">暂无交叉事件</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>标的</th>
                  <th>方向</th>
                  <th>交叉价格</th>
                  <th>上次交叉价格</th>
                  <th>价格差</th>
                  <th>阈值</th>
                  <th>触发条件</th>
                  <th>通知状态</th>
                  <th>交叉时间</th>
                </tr>
              </thead>

              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{event.symbol}</td>

                    <td className={
                      event.cross_type === "GOLDEN"
                        ? "type-golden"
                        : "type-death"
                    }>
                      {crossName(event.cross_type)}
                    </td>

                    <td>{formatPrice(event.cross_price)}</td>

                    <td>{formatPrice(event.previous_cross_price)}</td>

                    <td>{formatPrice(event.price_diff)}</td>

                    <td>{formatPrice(event.threshold)}</td>

                    <td>
                      {event.trigger_met === 1 ? "已达到" : "未达到"}
                    </td>

                    <td>
                      {event.push_sent === 1
                        ? "已发送"
                        : event.reason?.startsWith("notification_failed")
                          ? "发送失败"
                          : "未发送"}
                    </td>

                    <td>{formatTime(event.cross_time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="footer">
        Crypto Market Monitor · 数据来源 Binance USDⓈ-M Futures
        <br />
        仅提供行情监控与信号提醒，不执行自动交易
      </footer>

      {modalOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setModalOpen(false);
            }
          }}
        >
          <form className="modal" onSubmit={handleSaveSymbol}>
            <h2>{editingId === null ? "添加监控标的" : "编辑监控配置"}</h2>

            {error && <div className="message error">{error}</div>}

            <div className="form-grid">
              <div className="form-field">
                <label>交易标的</label>
                <input
                  value={form.symbol}
                  disabled={editingId !== null}
                  placeholder="例如 BTCUSDT"
                  onChange={(event) =>
                    setForm({
                      ...form,
                      symbol: event.target.value.toUpperCase()
                    })
                  }
                  required
                />
              </div>

              <div className="form-field">
                <label>K 线周期</label>
                <select
                  value={form.interval}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      interval: event.target.value
                    })
                  }
                >
                  {intervals.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>快线 EMA</label>
                <input
                  type="number"
                  min="2"
                  value={form.fast_ema}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      fast_ema: Number(event.target.value)
                    })
                  }
                  required
                />
              </div>

              <div className="form-field">
                <label>慢线 EMA</label>
                <input
                  type="number"
                  min="3"
                  value={form.slow_ema}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      slow_ema: Number(event.target.value)
                    })
                  }
                  required
                />
              </div>

              <div className="form-field">
                <label>反向交叉价格差阈值</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.threshold}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      threshold: Number(event.target.value)
                    })
                  }
                  required
                />
              </div>

              <div className="form-field">
                <label>单标的微信通知</label>
                <select
                  value={form.notify_enabled ? "true" : "false"}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      notify_enabled: event.target.value === "true"
                    })
                  }
                >
                  <option value="false">关闭</option>
                  <option value="true">开启</option>
                </select>
              </div>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="button"
                onClick={() => setModalOpen(false)}
              >
                取消
              </button>

              <button
                type="submit"
                className="button primary"
                disabled={loading}
              >
                {loading ? "保存中..." : "保存"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
