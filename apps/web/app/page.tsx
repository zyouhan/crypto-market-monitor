"use client";

import {
  useCallback,
  useEffect,
  useState
} from "react";

import { LoginCard } from "./components/LoginCard";
import { NotificationSettings } from "./components/NotificationSettings";
import { SignalTable } from "./components/SignalTable";
import { SummaryCards } from "./components/SummaryCards";
import { SymbolCard } from "./components/SymbolCard";
import { SymbolModal } from "./components/SymbolModal";
import { api, errorMessage } from "./lib/api";
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
  const [settings, setSettings] = useState<SettingsData>({
    global_wechat_enabled: false,
    serverchan_configured: false
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SymbolItem | null>(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    const [symbolData, signalData, settingsData] =
      await Promise.all([
        api<SymbolItem[]>("/api/symbols"),
        api<{ items: SignalItem[] }>(
          "/api/signals?limit=100"
        ),
        api<SettingsData>("/api/settings")
      ]);

    setSymbols(symbolData);
    setSignals(signalData.items);
    setSettings(settingsData);
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
    }, 8000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [authenticated, loadDashboard]);

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
              <SymbolCard
                key={item.id}
                item={item}
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

        <SignalTable signals={signals} />
      </section>

      <footer className="footer">
        Crypto Market Monitor · 数据来源 Binance USDⓈ-M Futures
        <br />
        仅提供行情监控与信号提醒，不执行自动交易
      </footer>

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
