"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthStore } from "@/lib/store";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Nav config
// ---------------------------------------------------------------------------

interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: "review" | "yellow";
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",     label: "Дашборд",           icon: "⊞" },
  { href: "/receipts",      label: "Мои чеки",           icon: "🧾" },
  { href: "/prescriptions", label: "Рецепты",            icon: "💊" },
  { href: "/review",        label: "На проверке",        icon: "👁", badge: "yellow" },
  { href: "/export",        label: "Экспорт документов", icon: "📥" },
];

const BOTTOM_ITEMS: NavItem[] = [
  { href: "/profile", label: "Профиль", icon: "👤" },
];

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router   = useRouter();
  const logout   = useAuthStore((s) => s.logout);

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
    return pathname.startsWith(href);
  }

  async function handleLogout() {
    try { await api.post("/api/v1/auth/logout", {}); } catch { /* ignore */ }
    logout();
    router.push("/login");
  }

  function navigate(href: string) {
    router.push(href);
    onClose();
  }

  return (
    <>
      {/* Overlay (mobile) */}
      <div
        className={`sidebar-overlay ${isOpen ? "open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className={`sidebar ${isOpen ? "open" : ""}`} aria-label="Навигация">
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="logo-icon" aria-hidden="true">💊</div>
          <div>
            <div className="logo-name">МедВычет</div>
            <div className="logo-tagline">Налоговый вычет на лекарства</div>
          </div>
        </div>

        {/* Main nav */}
        <nav>
          <span className="sidebar-section-label">Кабинет</span>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.href}
              className={`nav-item w-full text-left ${isActive(item.href) ? "active" : ""}`}
              onClick={() => navigate(item.href)}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
              {item.badge && (
                <span className={`nav-badge ${item.badge}`}>!</span>
              )}
            </button>
          ))}
        </nav>

        {/* Bottom */}
        <div className="sidebar-bottom">
          {BOTTOM_ITEMS.map((item) => (
            <button
              key={item.href}
              className={`nav-item w-full text-left ${isActive(item.href) ? "active" : ""}`}
              onClick={() => navigate(item.href)}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
          <button
            className="nav-item w-full text-left"
            onClick={handleLogout}
            style={{ color: "var(--red-text)" }}
          >
            <span className="nav-icon" aria-hidden="true">🚪</span>
            Выйти
          </button>
        </div>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// Topbar
// ---------------------------------------------------------------------------

interface TopbarProps {
  onMenuToggle: () => void;
}

const PAGE_TITLES: Record<string, string> = {
  "/dashboard":     "Дашборд",
  "/receipts":      "Мои чеки",
  "/prescriptions": "Рецепты",
  "/review":        "На проверке",
  "/export":        "Экспорт документов",
  "/profile":       "Профиль",
};

function Topbar({ onMenuToggle }: TopbarProps) {
  const pathname = usePathname();
  const year = new Date().getFullYear();

  const title =
    Object.entries(PAGE_TITLES).find(([key]) => pathname.startsWith(key))?.[1] ??
    "Кабинет";

  return (
    <header className="topbar">
      {/* Burger (mobile) */}
      <button
        className="topbar-icon-btn md:hidden"
        onClick={onMenuToggle}
        aria-label="Открыть меню"
        style={{ display: "flex" }}
      >
        ☰
      </button>

      <span className="topbar-title">{title}</span>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" }}>
        <span className="pill-year">{year}</span>

        <button className="topbar-icon-btn" aria-label="Уведомления">
          🔔
          <span className="notif-dot" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function CabinetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="dashboard-layout">
      <a href="#main-content" className="skip-link">Перейти к содержимому</a>

      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="main-wrap">
        <Topbar onMenuToggle={() => setSidebarOpen((v) => !v)} />

        <main id="main-content" className="page-content">
          {children}
        </main>
      </div>
    </div>
  );
}
