"use client";

import { useState, type FormEvent } from "react";

interface LoginCardProps {
  loading: boolean;
  error: string;
  onLogin: (
    username: string,
    password: string
  ) => Promise<void>;
}

export function LoginCard({
  loading,
  error,
  onLogin
}: LoginCardProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setSubmitting(true);

    try {
      await onLogin(username, password);
      setPassword("");
    } catch {
      // 错误由页面统一展示
    } finally {
      setSubmitting(false);
    }
  }

  const busy = loading || submitting;

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Crypto Market Monitor</h1>
        <p>加密货币市场多指标监控系统</p>

        {error && <div className="message error">{error}</div>}

        <div className="form-field">
          <label>用户名</label>
          <input
            value={username}
            onChange={(event) =>
              setUsername(event.target.value)
            }
            autoComplete="username"
            required
          />
        </div>

        <div className="form-field">
          <label>密码</label>
          <input
            type="password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            autoComplete="current-password"
            required
          />
        </div>

        <button
          className="button primary"
          disabled={busy}
          type="submit"
        >
          {busy ? "登录中..." : "登录"}
        </button>
      </form>
    </main>
  );
}
