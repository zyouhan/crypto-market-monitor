"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { LoginCard } from "./components/LoginCard";
import { MonitorList } from "./components/MonitorList";
import { MonitorModal } from "./components/MonitorModal";
import { NotificationSettings } from "./components/NotificationSettings";
import { SignalTable } from "./components/SignalTable";
import { SignalToasts } from "./components/SignalToasts";
import { SoundSettings } from "./components/SoundSettings";
import { api, errorMessage } from "./lib/api";
import { isAlertSignal } from "./lib/format";
import {
  DEFAULT_SOUND_ALERT_SETTINGS,
  isSoundAlertSignal,
  loadSoundAlertSettings,
  playTripleBeep,
  saveSoundAlertSettings,
  unlockAudio,
  type SoundAlertSettings
} from "./lib/sound";
import type {
  ConditionCatalogItem,
  MonitorItem,
  MonitorSignalItem,
  SaveMonitorPayload,
  SettingsData,
  SignalStats
} from "./types";

type MonitorCategory = "all" | "ema" | "combo" | "kdj";

function monitorCategory(monitor: MonitorItem): Exclude<
  MonitorCategory,
  "all"
> {
  const hasEma = monitor.conditions.some(
    (condition) => condition.kind === "EMA_CROSS"
  );
  const hasKdj = monitor.conditions.some(
    (condition) => condition.kind === "KDJ_EXTREME"
  );

  if (hasEma && hasKdj) {
    return "combo";
  }

  if (hasEma) {
    return "ema";
  }

  return "kdj";
}

export default function HomePage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [monitors, setMonitors] = useState<MonitorItem[]>([]);
  const [signals, setSignals] = useState<MonitorSignalItem[]>([]);
  const [alertSignals, setAlertSignals] = useState<
    MonitorSignalItem[]
  >([]);
  const [catalog, setCatalog] = useState<ConditionCatalogItem[]>([]);
  const [settings, setSettings] = useState<SettingsData>({
    global_wechat_enabled: false,
    serverchan_configured: false
  });
  const [stats, setStats] = useState<SignalStats>({
    today: 0,
    total: 0
  });
  const [search, setSearch] = useState("");
  const [category, setCategory] =
    useState<MonitorCategory>("all");

  const [toasts, setToasts] = useState<MonitorSignalItem[]>([]);
  const seenSignalIdsRef = useRef<Set<number> | null>(null);

  const [soundSettings, setSoundSettings] =
    useState<SoundAlertSettings>({
      ...DEFAULT_SOUND_ALERT_SETTINGS
    });
  const soundSettingsRef = useRef<SoundAlertSettings>({
    ...DEFAULT_SOUND_ALERT_SETTINGS
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MonitorItem | null>(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    const [
      monitorData,
      signalData,
      alertData,
      settingsData,
      catalogData,
      statsData
    ] = await Promise.all([
      api<MonitorItem[]>("/api/monitors"),
      api<{ items: MonitorSignalItem[] }>(
        "/api/signals?limit=100"
      ),
      api<{ items: MonitorSignalItem[] }>(
        "/api/signals?limit=30&triggered=1"
      ),
      api<SettingsData>("/api/settings"),
      api<ConditionCatalogItem[]>("/api/conditions"),
      api<SignalStats>("/api/signals/stats")
    ]);

    setMonitors(monitorData);
    setSignals(signalData.items);
    setAlertSignals(alertData.items);
    setSettings(settingsData);
    setCatalog(catalogData);
    setStats(statsData);

    const alerts = alertData.items.filter(isAlertSignal);
    const monitorById = new Map(
      monitorData.map((monitor) => [monitor.id, monitor])
    );

    if (seenSignalIdsRef.current === null) {
      seenSignalIdsRef.current = new Set(
        alerts.map((signal) => signal.id)
      );
      return;
    }

    const seen = seenSignalIdsRef.current;
    const fresh = alerts.filter(
      (signal) => !seen.has(signal.id)
    );

    if (fresh.length > 0) {
      for (const signal of fresh) {
        seen.add(signal.id);
      }

      const shouldBeep = fresh.some((signal) => {
        const monitor = signal.monitor_id
          ? monitorById.get(signal.monitor_id)
          : undefined;

        return (
          monitor?.sound_enabled === 1 &&
          isSoundAlertSignal(signal, soundSettingsRef.current)
        );
      });

      if (shouldBeep) {
        playTripleBeep();
      }

      setToasts((current) =>
        [...current, ...fresh].slice(-4)
      );
    }
  }, []);

  const latestAlertByMonitor = useMemo(() => {
    const map = new Map<number, MonitorSignalItem>();

    for (const signal of alertSignals) {
      if (!isAlertSignal(signal) || signal.monitor_id === null) {
        continue;
      }

      if (!map.has(signal.monitor_id)) {
        map.set(signal.monitor_id, signal);
      }
    }

    return map;
  }, [alertSignals]);

  const categoryCounts = useMemo(() => {
    const counts = {
      all: monitors.length,
      ema: 0,
      combo: 0,
      kdj: 0
    };

    for (const monitor of monitors) {
      counts[monitorCategory(monitor)] += 1;
    }

    return counts;
  }, [monitors]);

  const filteredMonitors = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return monitors.filter((monitor) => {
      if (
        category !== "all" &&
        monitorCategory(monitor) !== category
      ) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return (
        monitor.name.toLowerCase().includes(keyword) ||
        monitor.symbol.toLowerCase().includes(keyword)
      );
    });
  }, [monitors, category, search]);

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
    const loaded = loadSoundAlertSettings();

    setSoundSettings(loaded);
    soundSettingsRef.current = loaded;

    if (!loaded.enabled) {
      return;
    }

    const handlePointerDown = () => unlockAudio();

    window.addEventListener("pointerdown", handlePointerDown, {
      once: true
    });

    return () => {
      window.removeEventListener(
        "pointerdown",
        handlePointerDown
      );
    };
  }, []);

  const hasPending = monitors.some((monitor) => monitor.pending);

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    let active = true;

    const refresh = async () => {
      try {
        await loadDashboard();

        if (active) {
          setError("");
        }
      } catch (err) {
        if (!active) {
          return;
        }

        const text = errorMessage(err);

        if (
          text.includes("未登录") ||
          text.includes("登录已过期")
        ) {
          setAuthenticated(false);
        } else {
          setError(text);
        }
      }
    };

    void refresh();

    const timer = window.setInterval(() => {
      void refresh();
    }, 15000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [authenticated, loadDashboard]);

  // pending 时单独快速轮询，但不要重建上面的 15 秒轮询；
  // 否则点击“立即请求”后的第一次 GET 会立刻清掉 pending，造成闪动。
  useEffect(() => {
    if (!authenticated || !hasPending) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadDashboard();
    }, 1500);

    return () => window.clearInterval(timer);
  }, [authenticated, hasPending, loadDashboard]);

  useEffect(() => {
    if (toasts.length === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setToasts((current) => current.slice(1));
    }, 10000);

    return () => window.clearTimeout(timer);
  }, [toasts]);

  async function handleLogin(
    username: string,
    password: string
  ) {
    setError("");
    setLoading(true);

    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });

      setAuthenticated(true);
      setMessage("登录成功");
    } catch (err) {
      setError(errorMessage(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      setAuthenticated(false);
      setMonitors([]);
      setSignals([]);
      setAlertSignals([]);
      setToasts([]);
      seenSignalIdsRef.current = null;
    }
  }

  async function toggleMonitor(
    id: number,
    patch: {
      enabled?: boolean;
      wechat_enabled?: boolean;
      sound_enabled?: boolean;
    }
  ) {
    try {
      await api(`/api/monitors/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });

      await loadDashboard();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function deleteMonitor(item: MonitorItem) {
    if (!window.confirm(`确定删除监控项「${item.name}」吗？`)) {
      return;
    }

    try {
      await api(`/api/monitors/${item.id}`, {
        method: "DELETE"
      });

      await loadDashboard();
      setMessage(`监控项「${item.name}」已删除`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function refreshMonitor(item: MonitorItem) {
    setMonitors((current) =>
      current.map((monitor) =>
        monitor.id === item.id
          ? { ...monitor, pending: true }
          : monitor
      )
    );

    try {
      await api(`/api/monitors/${item.id}/refresh`, {
        method: "POST"
      });

      window.setTimeout(() => {
        void loadDashboard();
      }, 1200);
    } catch (err) {
      setError(errorMessage(err));
      await loadDashboard();
    }
  }

  function openAddModal() {
    setEditing(null);
    setError("");
    setModalOpen(true);
  }

  function openEditModal(item: MonitorItem) {
    setEditing(item);
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  async function handleSaveMonitor(
    payload: SaveMonitorPayload
  ) {
    setLoading(true);
    setError("");

    try {
      if (editing) {
        await api(`/api/monitors/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
      } else {
        await api("/api/monitors", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }

      setMessage(
        editing ? "监控项更新成功" : "监控项创建成功"
      );
      closeModal();
      await loadDashboard();
    } catch (err) {
      setError(errorMessage(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function handleGlobalNotify(value: boolean) {
    try {
      await api("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          global_wechat_enabled: value
        })
      });

      setSettings((current) => ({
        ...current,
        global_wechat_enabled: value
      }));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function handleSoundChange(
    next: SoundAlertSettings
  ): void {
    soundSettingsRef.current = next;
    setSoundSettings(next);
    saveSoundAlertSettings(next);
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
      <LoginCard
        loading={loading}
        error={error}
        onLogin={handleLogin}
      />
    );
  }

  return (
    <main className="page">
      <header className="page-top">
        <div className="brand">
          <h1>Crypto Market Monitor</h1>
          <p>行情来源 OKX 优先 · Binance 备用</p>
        </div>

        <div className="top-actions">
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <input
              value={search}
              placeholder="搜索标的 / 名称"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <button
            className="button primary"
            onClick={openAddModal}
          >
            + 新建监控项
          </button>

          <button className="button" onClick={handleLogout}>
            退出
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

      <div className="stats-line">
        <span>
          <strong>{monitors.length}</strong> 全部监控项
        </span>
        <span className="stat-running">
          <strong>
            {monitors.filter((item) => item.enabled === 1).length}
          </strong>{" "}
          运行中
        </span>
        <span>
          <strong>{stats.today}</strong> 今日信号
        </span>
        <span className={monitors.some((item) => item.last_error) ? "stat-error" : ""}>
          <strong>
            {monitors.filter((item) => Boolean(item.last_error)).length}
          </strong>{" "}
          接口异常
        </span>
      </div>

      <nav className="monitor-tabs" aria-label="监控项分类">
        {(
          [
            ["all", "全部", categoryCounts.all],
            ["ema", "EMA 趋势", categoryCounts.ema],
            ["combo", "趋势 + KDJ 入场", categoryCounts.combo],
            ["kdj", "J 极值", categoryCounts.kdj]
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            className={`monitor-tab ${
              category === key ? "active" : ""
            }`}
            onClick={() => setCategory(key)}
          >
            {label} <span>{count}</span>
          </button>
        ))}
      </nav>

      <MonitorList
        monitors={filteredMonitors}
        latestSignals={latestAlertByMonitor}
        onToggle={(id, patch) => void toggleMonitor(id, patch)}
        onEdit={openEditModal}
        onDelete={(item) => void deleteMonitor(item)}
        onRefresh={(item) => void refreshMonitor(item)}
      />

      <NotificationSettings
        globalNotify={settings.global_wechat_enabled}
        serverchanConfigured={settings.serverchan_configured}
        onChange={(value) => void handleGlobalNotify(value)}
      />

      <SoundSettings
        value={soundSettings}
        onChange={handleSoundChange}
      />

      <section className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">信号记录</div>
            <div className="panel-subtitle">
              每个监控项独立记录触发结果与条件快照
            </div>
          </div>
        </div>

        <SignalTable signals={signals} monitors={monitors} />
      </section>

      <footer className="footer">
        Crypto Market Monitor · 行情来源 OKX 优先，Binance 备用
        <br />
        仅提供行情监控与信号提醒，不执行自动交易
      </footer>

      <SignalToasts
        toasts={toasts}
        monitors={monitors}
        onDismiss={(id) =>
          setToasts((current) =>
            current.filter((signal) => signal.id !== id)
          )
        }
      />

      {modalOpen && (
        <MonitorModal
          key={editing?.id ?? "new"}
          item={editing}
          catalog={catalog}
          serverchanConfigured={settings.serverchan_configured}
          loading={loading}
          error={error}
          onClose={closeModal}
          onSave={handleSaveMonitor}
        />
      )}
    </main>
  );
}
