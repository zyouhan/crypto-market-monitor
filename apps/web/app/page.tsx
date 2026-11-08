"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { LoginCard } from "./components/LoginCard";
import { NotificationSettings } from "./components/NotificationSettings";
import { SignalTable } from "./components/SignalTable";
import { SignalToasts } from "./components/SignalToasts";
import { SoundSettings } from "./components/SoundSettings";
import { SummaryCards } from "./components/SummaryCards";
import { SymbolCard } from "./components/SymbolCard";
import { SymbolModal } from "./components/SymbolModal";
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
  SaveSymbolPayload,
  SettingsData,
  SignalItem,
  SymbolItem
} from "./types";

export default function HomePage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [symbols, setSymbols] = useState<SymbolItem[]>([]);
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [alertSignals, setAlertSignals] = useState<
    SignalItem[]
  >([]);
  const [settings, setSettings] = useState<SettingsData>({
    global_wechat_enabled: false,
    serverchan_configured: false
  });

  const [toasts, setToasts] = useState<SignalItem[]>([]);
  const seenSignalIdsRef = useRef<Set<number> | null>(null);

  const [soundSettings, setSoundSettings] =
    useState<SoundAlertSettings>({
      ...DEFAULT_SOUND_ALERT_SETTINGS
    });
  const soundSettingsRef = useRef<SoundAlertSettings>({
    ...DEFAULT_SOUND_ALERT_SETTINGS
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SymbolItem | null>(null);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    const [
      symbolData,
      signalData,
      alertData,
      settingsData
    ] = await Promise.all([
      api<SymbolItem[]>("/api/symbols"),
      api<{ items: SignalItem[] }>(
        "/api/signals?limit=100"
      ),
      api<{ items: SignalItem[] }>(
        "/api/signals?limit=20&triggered=1"
      ),
      api<SettingsData>("/api/settings")
    ]);

    setSymbols(symbolData);
    setSignals(signalData.items);
    setAlertSignals(alertData.items);
    setSettings(settingsData);

    const alerts = alertData.items.filter(isAlertSignal);

    if (seenSignalIdsRef.current === null) {
      // 首次加载只建立基线，不弹历史提示
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

      if (
        fresh.some((signal) =>
          isSoundAlertSignal(signal, soundSettingsRef.current)
        )
      ) {
        playTripleBeep();
      }

      setToasts((current) =>
        [...current, ...fresh].slice(-4)
      );
    }
  }, []);

  const latestAlertBySymbol = useMemo(() => {
    const map = new Map<number, SignalItem>();

    for (const signal of alertSignals) {
      if (!isAlertSignal(signal)) {
        continue;
      }

      if (!map.has(signal.symbol_id)) {
        map.set(signal.symbol_id, signal);
      }
    }

    return map;
  }, [alertSignals]);

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

    // 上次已开启声音时，首次点击页面即解锁 AudioContext
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

    // 页面隐藏时暂停轮询，回到前台立即刷新一次
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
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
      setSymbols([]);
      setSignals([]);
      setAlertSignals([]);
      setToasts([]);
      seenSignalIdsRef.current = null;
    }
  }

  async function toggleSymbol(
    id: number,
    patch: {
      enabled?: boolean;
      notify_enabled?: boolean;
    }
  ) {
    try {
      await api(`/api/symbols/${id}`, {
        method: "PUT",
        body: JSON.stringify(patch)
      });

      await loadDashboard();
    } catch (err) {
      setError(errorMessage(err));
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
      setError(errorMessage(err));
    }
  }

  function openAddModal() {
    setEditing(null);
    setError("");
    setModalOpen(true);
  }

  function openEditModal(item: SymbolItem) {
    setEditing(item);
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  async function handleSaveSymbol(
    payload: SaveSymbolPayload
  ) {
    setLoading(true);
    setError("");

    try {
      if (editing) {
        await api(`/api/symbols/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
      } else {
        await api("/api/symbols", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }

      setMessage(editing ? "配置更新成功" : "标的添加成功");

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

  async function handleRefreshNow() {
    setRefreshing(true);
    setError("");
    setMessage("");

    try {
      await api("/api/symbols/refresh", { method: "POST" });

      setMessage(
        "已提交数据请求，正在拉取最新 K 线；完成后页面会自动刷新"
      );

      // Binance 正常时通常 1~2 秒内完成；保留一次延迟刷新兜底
      window.setTimeout(() => {
        void loadDashboard();
      }, 4000);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRefreshing(false);
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
      <LoginCard
        loading={loading}
        error={error}
        onLogin={handleLogin}
      />
    );
  }

  return (
    <main className="page">
      <header className="header">
        <div className="brand">
          <h1>Crypto Market Monitor</h1>
          <p>EMA 定趋势 · KDJ 找入场</p>
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

      <SummaryCards symbols={symbols} />

      <section className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">监控标的</div>
            <div className="panel-subtitle">
              每个标的独立配置 EMA 趋势参数与 KDJ 入场参数
            </div>
          </div>

          <div className="panel-actions">
            <button
              className="button"
              onClick={() => void handleRefreshNow()}
              disabled={refreshing}
            >
              {refreshing ? "请求中..." : "↻ 立即请求数据"}
            </button>

            <button
              className="button primary"
              onClick={openAddModal}
            >
              + 添加标的
            </button>
          </div>
        </div>

        {symbols.length === 0 ? (
          <div className="empty">暂无监控标的，请先添加</div>
        ) : (
          <div className="symbol-grid">
            {symbols.map((item) => (
              <SymbolCard
                key={item.id}
                item={item}
                latestSignal={
                  latestAlertBySymbol.get(item.id) ?? null
                }
                onToggle={(id, patch) =>
                  void toggleSymbol(id, patch)
                }
                onEdit={openEditModal}
                onDelete={(value) => void deleteSymbol(value)}
              />
            ))}
          </div>
        )}
      </section>

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
            <div className="panel-title">
              交叉与入场信号记录
            </div>
            <div className="panel-subtitle">
              最近 100 条趋势确认与入场信号
            </div>
          </div>
        </div>

        <SignalTable
          signals={signals}
          symbols={symbols.map((item) => item.symbol)}
        />
      </section>

      <footer className="footer">
        Crypto Market Monitor · 数据来源 Binance USDⓈ-M Futures
        <br />
        仅提供行情监控与信号提醒，不执行自动交易
      </footer>

      <SignalToasts
        toasts={toasts}
        onDismiss={(id) =>
          setToasts((current) =>
            current.filter((signal) => signal.id !== id)
          )
        }
      />

      {modalOpen && (
        <SymbolModal
          key={editing?.id ?? "new"}
          item={editing}
          loading={loading}
          error={error}
          onClose={closeModal}
          onSave={handleSaveSymbol}
        />
      )}
    </main>
  );
}
