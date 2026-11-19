"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { useAuth } from "./AuthProvider";
import { useMonitorRuntime } from "./MonitorRuntimeProvider";

type IconName =
  | "monitor"
  | "trades"
  | "cases"
  | "checks"
  | "stats"
  | "menu"
  | "logout"
  | "collapse"
  | "expand";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    monitor: <path d="M3 12h4l2-7 4 14 2-7h6" />,
    trades: (
      <>
        <path d="M5 4h11l3 3v13H5z" />
        <path d="M8 8h6M8 12h7M8 16h4" />
      </>
    ),
    cases: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="8" cy="10" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </>
    ),
    checks: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="m8 12 2 2 5-5M8 17h5" />
      </>
    ),
    stats: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    logout: (
      <>
        <path d="M10 17l5-5-5-5M15 12H3" />
        <path d="M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" />
      </>
    ),
    collapse: <path d="m14 6-6 6 6 6" />,
    expand: <path d="m10 6 6 6-6 6" />
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "监控中心", icon: "monitor" },
  {
    href: "/trades",
    label: "交易记录",
    icon: "trades",
    badge: "心态监控"
  },
  { href: "/cases", label: "交易案例", icon: "cases" },
  {
    href: "/self-checks",
    label: "开单自查记录",
    icon: "checks"
  },
  { href: "/stats", label: "策略统计", icon: "stats" }
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { monitorCount } = useMonitorRuntime();
  const { logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setCollapsed(
      window.localStorage.getItem("app-sidebar-collapsed") === "1"
    );
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      "app-sidebar-collapsed",
      collapsed ? "1" : "0"
    );
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function handleLogout(): Promise<void> {
    await logout();
  }

  return (
    <div
      className={`app-shell ${collapsed ? "is-collapsed" : ""} ${
        mobileOpen ? "is-mobile-open" : ""
      }`}
    >
      <button
        type="button"
        className="app-mobile-toggle"
        aria-label="打开导航"
        onClick={() => setMobileOpen((current) => !current)}
      >
        <Icon name="menu" />
      </button>

      <aside className="app-sidebar">
        <div className="app-sidebar-brand">
          <span className="app-sidebar-logo">
            <Icon name="monitor" />
          </span>
          <span className="app-sidebar-brand-text">
            Market
            <small>Monitor</small>
          </span>
        </div>

        <nav className="app-sidebar-nav" aria-label="主导航">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`app-nav-item ${active ? "active" : ""}`}
                title={collapsed ? item.label : undefined}
                onClick={() => setMobileOpen(false)}
              >
                <span className="app-nav-icon">
                  <Icon name={item.icon} />
                </span>
                <span className="app-nav-label">{item.label}</span>
                {item.href === "/" && monitorCount !== null && (
                  <span className="app-nav-count">
                    {monitorCount}
                  </span>
                )}
                {item.badge && (
                  <span className="app-nav-badge">{item.badge}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="app-sidebar-footer">
          <div className="app-sidebar-user">
            <span className="app-sidebar-avatar">K</span>
            <span className="app-sidebar-user-text">
              <strong>交易员</strong>
              <small>记录与复盘</small>
            </span>
          </div>
          <button
            type="button"
            className="app-sidebar-logout"
            aria-label="退出登录"
            title="退出登录"
            onClick={() => void handleLogout()}
          >
            <Icon name="logout" />
            <span className="app-sidebar-logout-label">退出</span>
          </button>
          <button
            type="button"
            className="app-sidebar-toggle"
            aria-label={collapsed ? "展开导航" : "收起导航"}
            onClick={() => setCollapsed((current) => !current)}
          >
            <Icon name={collapsed ? "expand" : "collapse"} />
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <button
          type="button"
          className="app-sidebar-backdrop"
          aria-label="关闭导航"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="app-content">{children}</div>
    </div>
  );
}
