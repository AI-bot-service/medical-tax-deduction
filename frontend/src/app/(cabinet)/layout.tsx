"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { YearFilter } from "@/components/ui/YearFilter";
import { BadgePercent, Info, HeartPulse } from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/lib/store";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Deduction types config — add new items here to extend the list
// ---------------------------------------------------------------------------

interface DeductionType {
  key:       string;
  label:     string;
  href:      string;
  icon:      React.ReactNode;
  available: boolean; // false = shown grayed-out (coming soon)
}

const DEDUCTION_TYPES: DeductionType[] = [
  {
    key:       "social",
    label:     "Социальный вычет",
    href:      "/dashboard",
    icon:      <HeartPulse size={13} strokeWidth={2} />,
    available: true,
  },
];

// ---------------------------------------------------------------------------
// Nav config — HEITKAMP section groups
// ---------------------------------------------------------------------------

interface NavItem {
  href:   string;
  label:  string;
  icon:   string;
  badge?: "accent" | "yellow";
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Меню",
    items: [
      { href: "/dashboard",     label: "Дашборд",      icon: "⊞" },
      { href: "/receipts",      label: "Мои чеки",      icon: "🧾" },
      { href: "/prescriptions", label: "Рецепты",       icon: "💊" },
    ],
  },
  {
    label: "Управление",
    items: [
      { href: "/review",      label: "На проверке",        icon: "👁",  badge: "yellow" },
      { href: "/duplicates",  label: "Дубли",              icon: "📋", badge: "accent" },
      { href: "/export",      label: "Экспорт документов", icon: "📥" },
    ],
  },
];

const NAV_BOTTOM: NavItem[] = [
  { href: "/profile", label: "Профиль", icon: "👤" },
];

// ---------------------------------------------------------------------------
// Icon components (SVG — cleaner than emoji for HEITKAMP aesthetic)
// ---------------------------------------------------------------------------

function GridIcon()    { return <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M1 1h6v6H1V1zm0 8h6v6H1V9zm8-8h6v6H9V1zm0 8h6v6H9V9z"/></svg>; }
function ReceiptIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>; }
function PillIcon()    { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 20H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2v3"/><circle cx="18" cy="18" r="4"/><path d="m15.3 18 1.4 1.4M15.3 18l1.4-1.4"/></svg>; }
function EyeIcon()     { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>; }
function DownloadIcon(){ return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>; }
function UserIcon()    { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>; }
function LogoutIcon()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>; }
function CopyIcon()    { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>; }

const ICONS: Record<string, React.ReactNode> = {
  "⊞": <GridIcon />,
  "🧾": <ReceiptIcon />,
  "💊": <PillIcon />,
  "👁": <EyeIcon />,
  "📥": <DownloadIcon />,
  "👤": <UserIcon />,
  "📋": <CopyIcon />,
};

// ---------------------------------------------------------------------------
// InfoPopup — описание социального вычета
// ---------------------------------------------------------------------------

function InfoPopup() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button
        aria-label="Информация о социальном вычете"
        title="Что такое социальный вычет?"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "none",
          border: "none",
          padding: "2px",
          cursor: "pointer",
          color: "var(--text-muted)",
          borderRadius: "4px",
          transition: "color 0.15s, background 0.15s",
          lineHeight: 1,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)";
          (e.currentTarget as HTMLButtonElement).style.background = "var(--accent-light)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
          (e.currentTarget as HTMLButtonElement).style.background = "none";
        }}
      >
        <Info size={13} strokeWidth={2} />
      </button>

      {open && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            left: "calc(100% + 8px)",
            top: "-8px",
            zIndex: 200,
            width: "260px",
            background: "var(--surface, #fff)",
            border: "1px solid var(--border, #e0e0e8)",
            borderRadius: "10px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            padding: "14px 16px",
            fontSize: "12px",
            color: "var(--text-secondary)",
            lineHeight: "1.55",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--text-primary)", marginBottom: "6px" }}>
            Социальный вычет
          </div>
          <p style={{ margin: "0 0 8px" }}>
            Возврат 13% НДФЛ с расходов на лечение и лекарства (ст.&nbsp;219 НК&nbsp;РФ).
            Лимит — до&nbsp;150&nbsp;000&nbsp;₽ в год, максимальный возврат — 19&nbsp;500&nbsp;₽.
          </p>
          <p style={{ margin: "0 0 10px" }}>
            Сохраняйте чеки из аптек и справки от врачей — система сформирует
            пакет документов для ИФНС автоматически.
          </p>
          <Link
            href="/info/social-vychet"
            onClick={() => setOpen(false)}
            style={{
              color: "var(--accent)",
              fontWeight: 600,
              fontSize: "12px",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "3px",
            }}
          >
            Подробнее →
          </Link>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeductionNav — expandable list of deduction types (config-driven)
// ---------------------------------------------------------------------------

function DeductionNav({ activeKey }: { activeKey: string }) {
  const router = useRouter();

  return (
    <div style={{ padding: "8px 0 4px" }}>
      <span className="sidebar-section-label">Тип вычета</span>
      <div className="nav-items-group">
        {DEDUCTION_TYPES.map((type) => {
          const isActive = type.key === activeKey;
          return (
            <button
              key={type.key}
              className={`nav-item ${isActive ? "active" : ""}`}
              onClick={() => type.available && router.push(type.href)}
              disabled={!type.available}
              title={type.available ? undefined : "Скоро"}
              style={!type.available ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
            >
              <span className="nav-icon" aria-hidden="true">{type.icon}</span>
              <span style={{ flex: 1, textAlign: "left" }}>{type.label}</span>
              {isActive && (
                <span
                  style={{
                    width: "6px", height: "6px",
                    borderRadius: "50%",
                    background: "var(--accent)",
                    flexShrink: 0,
                  }}
                  aria-hidden="true"
                />
              )}
              {!type.available && (
                <span
                  style={{
                    fontSize: "9px", color: "var(--text-muted)",
                    background: "var(--bg)", border: "1px solid var(--border)",
                    borderRadius: "4px", padding: "1px 5px", fontWeight: 600, flexShrink: 0,
                  }}
                >
                  скоро
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
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

  function navigate(href: string) { router.push(href); onClose(); }

  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? "open" : ""}`} onClick={onClose} aria-hidden="true" />

      <aside className={`sidebar ${isOpen ? "open" : ""}`} aria-label="Навигация">

        {/* ── Logo ── */}
        <div className="sidebar-logo">
          <div className="logo-icon" aria-hidden="true" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BadgePercent size={18} strokeWidth={2} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="logo-name" style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              Социальный вычет
              <InfoPopup />
            </div>
            <div className="logo-tagline">Налоговый вычет</div>
          </div>
          <button className="sidebar-collapse-btn" aria-label="Свернуть меню" title="Свернуть">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1 2h8M1 5h8M1 8h8" />
            </svg>
          </button>
        </div>

        {/* ── Deduction type selector ── */}
        <DeductionNav activeKey="social" />

        {/* ── Nav groups ── */}
        <nav style={{ flex: 1 }}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <span className="sidebar-section-label">{group.label}</span>
              <div className="nav-items-group">
                {group.items.map((item) => (
                  <button
                    key={item.href}
                    className={`nav-item ${isActive(item.href) ? "active" : ""}`}
                    onClick={() => navigate(item.href)}
                  >
                    <span className="nav-icon" aria-hidden="true">
                      {ICONS[item.icon] ?? item.icon}
                    </span>
                    <span style={{ flex: 1, textAlign: "left" }}>{item.label}</span>
                    {item.badge && (
                      <span className={`nav-badge ${item.badge === "yellow" ? "yellow" : ""}`}>
                        !
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* ── Bottom ── */}
        <div className="sidebar-bottom">
          <div className="nav-items-group">
            {NAV_BOTTOM.map((item) => (
              <button
                key={item.href}
                className={`nav-item ${isActive(item.href) ? "active" : ""}`}
                onClick={() => navigate(item.href)}
              >
                <span className="nav-icon" aria-hidden="true">
                  {ICONS[item.icon] ?? item.icon}
                </span>
                <span style={{ flex: 1, textAlign: "left" }}>{item.label}</span>
              </button>
            ))}

            <button
              className="nav-item"
              onClick={handleLogout}
              style={{ color: "var(--red-text)" }}
            >
              <span className="nav-icon" aria-hidden="true" style={{ color: "var(--red)" }}>
                <LogoutIcon />
              </span>
              <span style={{ flex: 1, textAlign: "left" }}>Выйти</span>
            </button>
          </div>

          {/* Version tag */}
          <div style={{
            padding: "10px 18px 0",
            fontSize: "10px", color: "var(--text-muted)",
            display: "flex", alignItems: "center", gap: "6px",
          }}>
            <span style={{
              background: "var(--accent-light)", color: "var(--accent)",
              borderRadius: "4px", padding: "1px 6px", fontWeight: 700,
            }}>v0.1</span>
            ст. 219 НК РФ
          </div>
        </div>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// Topbar
// ---------------------------------------------------------------------------

const PAGE_TITLES: Record<string, string> = {
  "/dashboard":     "Дашборд",
  "/receipts":      "Мои чеки",
  "/prescriptions": "Рецепты",
  "/review":        "На проверке",
  "/duplicates":    "Дубли",
  "/export":        "Экспорт документов",
  "/profile":       "Профиль",
};

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function Topbar({ onMenuToggle: _onMenuToggle }: { onMenuToggle: () => void }) {
  const pathname = usePathname();
  const isDashboard = pathname === "/dashboard" || pathname === "/";

  return (
    <header className="topbar" style={{ position: "sticky" }}>
      {/* Left: YearFilter always visible */}
      <YearFilter />

      {/* Center: page title on non-dashboard pages */}
      {!isDashboard && (
        <span
          className="topbar-title"
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            pointerEvents: "none",
          }}
        >
          {Object.entries(PAGE_TITLES).find(([key]) => pathname.startsWith(key))?.[1] ?? "Кабинет"}
        </span>
      )}

      {/* Right: search + actions */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
        {/* Search */}
        <div className="topbar-search">
          <span style={{ color: "var(--text-muted)", display: "flex", alignItems: "center" }}>
            <SearchIcon />
          </span>
          <input
            type="text"
            placeholder="Поиск по аптеке, дате..."
            style={{
              background: "none", border: "none", outline: "none",
              fontSize: "13px", color: "var(--text-primary)", width: "100%",
              fontFamily: "inherit",
            }}
          />
          <span style={{
            fontSize: "10px", color: "var(--text-muted)",
            background: "var(--bg)", border: "1px solid var(--border)",
            borderRadius: "4px", padding: "1px 6px", fontWeight: 700, flexShrink: 0,
          }}>⌘K</span>
        </div>

        <button className="topbar-icon-btn" aria-label="Настройки" style={{ display: "flex" }}>
          <SettingsIcon />
        </button>

        <button className="topbar-icon-btn" aria-label="Уведомления" style={{ display: "flex" }}>
          <BellIcon />
          <span className="notif-dot" aria-hidden="true" />
        </button>

        <div className="avatar avatar-sm" style={{ cursor: "pointer", fontSize: "11px" }}>
          МВ
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function CabinetLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="dashboard-layout">
      <a href="#main-content" className="skip-link">Перейти к содержимому</a>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="main-wrap">
        <Topbar onMenuToggle={() => setSidebarOpen((v) => !v)} />

        <main id="main-content" className="page-content">
          {children}
        </main>
      </div>
    </div>
  );
}
