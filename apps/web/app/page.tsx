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
import { StrategyStatsModal } from "./components/StrategyStatsModal";
import { api, errorMessage } from "./lib/api";
import { isAlertSignal } from "./lib/format";
import {
  DEFAULT_SOUND_ALERT_SETTINGS,
  getSoundAlertKind,
  loadSoundAlertSettings,
  playSignalSound,
  saveSoundAlertSettings,
  unlockAudio,
  type SoundSignalKind,
  type SoundAlertSettings
} from "./lib/sound";
import type {
  ConditionCatalogItem,
  ConditionKind,
  MonitorItem,
  MonitorSignalItem,
  SaveMonitorPayload,
  SettingsData,
  SignalStats
} from "./types";

type MonitorCategory = "all" | ConditionKind;

const TRIGGER_TAB_LABELS: Record<ConditionKind, string> = {
  EMA_CROSS: "EMA 交叉",
  KDJ_EXTREME: "KDJ 极值",
  VOLUME_SPIKE: "成交量",
  PRICE_LEVEL: "压力支撑",
  MACD_DEA_TURN: "MACD",
  ADX_TREND: "ADX",
  EMA_FAST_TURN: "EMA 快线"
};

function monitorCategory(
  monitor: MonitorItem
): ConditionKind | null {
  const trigger = monitor.conditions.find(
    (condition) => condition.role === "trigger"
  );

  return trigger?.kind ?? null;
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
    global_monitor_enabled: true,
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
  const [strategyStatsOpen, setStrategyStatsOpen] = useState(false);

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

      let soundKind: SoundSignalKind | null = null;

      for (const signal of fresh) {
        const monitor = signal.monitor_id
          ? monitorById.get(signal.monitor_id)
          : undefined;

        if (monitor?.sound_enabled !== 1) {
          continue;
        }

        const kind = getSoundAlertKind(
          signal,
          soundSettingsRef.current
        );

        if (kind) {
          soundKind = kind;
          break;
        }
      }

      if (soundKind) {
        playSignalSound(soundKind);
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
      all: monitors.length
    } as Record<MonitorCategory, number>;

    for (const definition of catalog) {
      counts[definition.kind] = 0;
    }

    for (const monitor of monitors) {
      const kind = monitorCategory(monitor);

      if (kind) {
        counts[kind] = (counts[kind] ?? 0) + 1;
      }
    }

    return counts;
  }, [monitors, catalog]);

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

  async function recordTradeAction(
    item: MonitorItem,
    action: "T_LONG" | "T_SHORT"
  ) {
    const label = action === "T_LONG" ? "正T" : "反T";

    if (
      !window.confirm(
        `确定记录「${item.name}」的${label}操作吗？`
      )
    ) {
      return;
    }

    try {
      await api(`/api/monitors/${item.id}/trade-actions`, {
        method: "POST",
        body: JSON.stringify({ action })
      });

      await loadDashboard();
      setMessage(`已记录「${item.name}」的${label}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function closePosition(item: MonitorItem) {
    if (
      !window.confirm(
        `确定将「${item.name}」标记为已平仓，并取消活动的止损观察吗？`
      )
    ) {
      return;
    }

    try {
      await api(`/api/monitors/${item.id}/close-position`, {
        method: "POST"
      });

      await loadDashboard();
      setMessage(`监控项「${item.name}」已标记平仓`);
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
    payloads: SaveMonitorPayload[]
  ) {
    setLoading(true);
    setError("");

    try {
      if (editing) {
        const payload = payloads[0];

        if (!payload) {
          throw new Error("缺少监控项数据");
        }

        await api(`/api/monitors/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });

        setMessage("监控项更新成功");
        closeModal();
        await loadDashboard();
        return;
      }

      const failures: string[] = [];
      let created = 0;

      for (const payload of payloads) {
        try {
          await api("/api/monitors", {
            method: "POST",
            body: JSON.stringify(payload)
          });
          created += 1;
        } catch (err) {
          failures.push(
            `${payload.symbol}: ${errorMessage(err)}`
          );
        }
      }

      if (failures.length > 0) {
        if (created > 0) {
          await loadDashboard();
        }

        setError(
          `已创建 ${created} 个，失败 ${failures.length} 个：${failures.join(
            "；"
          )}`
        );
        throw new Error("部分监控项创建失败");
      }

      setMessage(
        `已创建 ${payloads.length} 个监控项`
      );
      closeModal();
      await loadDashboard();
    } catch (err) {
      if (!errorMessage(err).includes("部分监控项")) {
        setError(errorMessage(err));
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function handleGlobalMonitor(value: boolean) {
    try {
      await api("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          global_monitor_enabled: value
        })
      });

      setSettings((current) => ({
        ...current,
        global_monitor_enabled: value
      }));
    } catch (err) {
      setError(errorMessage(err));
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
            className="button"
            onClick={() => setStrategyStatsOpen(true)}
          >
            策略统计
          </button>

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
        {!settings.global_monitor_enabled && (
          <span className="global-paused">全局监控已暂停</span>
        )}
      </div>

      <nav className="monitor-tabs" aria-label="监控项分类">
        {[
          {
            key: "all" as MonitorCategory,
            label: "全部",
            count: categoryCounts.all
          },
          ...catalog.map((definition) => ({
            key: definition.kind as MonitorCategory,
            label:
              TRIGGER_TAB_LABELS[definition.kind] ??
              definition.label,
            count: categoryCounts[definition.kind] ?? 0
          }))
        ].map(({ key, label, count }) => (
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
        onClosePosition={(item) => void closePosition(item)}
        onTradeAction={(item, action) =>
          void recordTradeAction(item, action)
        }
      />

      <NotificationSettings
        globalMonitor={settings.global_monitor_enabled}
        globalNotify={settings.global_wechat_enabled}
        serverchanConfigured={settings.serverchan_configured}
        onMonitorChange={(value) =>
          void handleGlobalMonitor(value)
        }
        onNotifyChange={(value) =>
          void handleGlobalNotify(value)
        }
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
              每个监控项独立记录触发条件与触发详情
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

      {strategyStatsOpen && (
        <StrategyStatsModal
          onClose={() => setStrategyStatsOpen(false)}
          onChanged={loadDashboard}
        />
      )}
    </main>
  );
}
