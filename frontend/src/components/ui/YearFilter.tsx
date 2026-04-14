"use client";

import { useDashboardStore } from "@/lib/store";

/**
 * YearFilter — Панель 2 дашборда.
 * Отображает 4 года: текущий и 3 предыдущих (динамически).
 * Активный год выделен акцентным цветом.
 */
export function YearFilter() {
  const selectedYear   = useDashboardStore((s) => s.selectedYear);
  const setSelectedYear = useDashboardStore((s) => s.setSelectedYear);

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "3px",
        background: "var(--bg)",
        borderRadius: "var(--r-md)",
        border: "1px solid var(--border)",
        width: "fit-content",
      }}
    >
      {years.map((year) => {
        const isActive = year === selectedYear;
        return (
          <button
            key={year}
            onClick={() => setSelectedYear(year)}
            style={{
              padding: "4px 14px",
              borderRadius: "var(--r-sm)",
              border: "none",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: isActive ? 800 : 600,
              letterSpacing: "-.02em",
              transition: "background var(--t-fast), color var(--t-fast)",
              background: isActive
                ? "var(--accent)"
                : "transparent",
              color: isActive
                ? "#fff"
                : "var(--text-secondary)",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = "var(--accent-light)";
                e.currentTarget.style.color = "var(--accent)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text-secondary)";
              }
            }}
          >
            {year}
          </button>
        );
      })}
    </div>
  );
}
