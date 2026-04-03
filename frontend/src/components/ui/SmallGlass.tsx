"use client";

import { useState } from "react";

export interface SmallGlassProps {
  categoryName: string;
  color: string;
  spent: number;
  limit: number | null;
  refund: number;
  isUncapped: boolean;
}

/**
 * SmallGlass — малый стакан для отдельной категории вычета (Панель 3).
 * Отображает заполнение стакана пропорционально spent/limit.
 * Для безлимитных категорий (isUncapped=true): символ ∞ вместо заливки.
 */
export function SmallGlass({
  categoryName,
  color,
  spent,
  limit,
  refund,
  isUncapped,
}: SmallGlassProps) {
  const [hovered, setHovered] = useState(false);

  const fillPercent =
    !isUncapped && limit != null && limit > 0
      ? Math.min((spent / limit) * 100, 100)
      : 0;

  const pctLabel = isUncapped ? "—" : `${Math.round(fillPercent)}%`;

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("ru-RU", {
      style: "decimal",
      maximumFractionDigits: 0,
    }).format(n) + " ₽";

  const glassW = 72;
  const glassH = 80;

  return (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Процент над стаканом */}
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: isUncapped ? "var(--text-muted)" : fillPercent > 0 ? color : "var(--text-muted)",
          minHeight: 18,
          letterSpacing: "-.02em",
        }}
      >
        {pctLabel}
      </span>

      {/* Стакан */}
      <div
        style={{
          position: "relative",
          width: glassW,
          height: glassH,
          borderRadius: "0 0 var(--r-sm) var(--r-sm)",
          border: `2px solid var(--border-strong)`,
          background: "var(--surface)",
          overflow: "hidden",
          boxShadow: "var(--shadow-sm)",
          cursor: "default",
        }}
      >
        {/* Заливка */}
        {!isUncapped && fillPercent > 0 && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: `${fillPercent}%`,
              background: color,
              opacity: 0.25,
              transition: "height 600ms var(--ease-spring)",
            }}
          />
        )}

        {/* Цветная полоска заливки (передний слой) */}
        {!isUncapped && fillPercent > 0 && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: `${fillPercent}%`,
              background: `linear-gradient(to top, ${color}55, ${color}22)`,
              borderTop: `2px solid ${color}88`,
              transition: "height 600ms var(--ease-spring)",
            }}
          />
        )}

        {/* Символ ∞ для безлимитных */}
        {isUncapped && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: color,
                opacity: 0.7,
                animation: "smallGlassPulse 2s ease-in-out infinite",
              }}
            >
              ∞
            </span>
          </div>
        )}
      </div>

      {/* Подпись под стаканом */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          textAlign: "center",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-primary)",
            maxWidth: 80,
            lineHeight: 1.3,
            letterSpacing: "-.01em",
          }}
        >
          {categoryName}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          {isUncapped ? "∞" : limit != null ? formatCurrency(limit) : "—"}
        </span>
        <span style={{ fontSize: 11, color, fontWeight: 600 }}>
          до {formatCurrency(refund)}
        </span>
      </div>

      {/* Tooltip при hover */}
      {hovered && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--text-primary)",
            color: "#fff",
            borderRadius: "var(--r-sm)",
            padding: "8px 12px",
            fontSize: 12,
            lineHeight: 1.6,
            whiteSpace: "nowrap",
            zIndex: 100,
            boxShadow: "var(--shadow-md)",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4, borderBottom: "1px solid rgba(255,255,255,.2)", paddingBottom: 4 }}>
            {categoryName}
          </div>
          <div>Потрачено: {formatCurrency(spent)}</div>
          {!isUncapped && limit != null && (
            <div>Лимит: {formatCurrency(limit)}</div>
          )}
          {isUncapped && <div>Лимит: без ограничений</div>}
          <div>Макс. возврат: {formatCurrency(refund)}</div>
          {/* Стрелочка */}
          <div
            style={{
              position: "absolute",
              bottom: -5,
              left: "50%",
              transform: "translateX(-50%) rotate(45deg)",
              width: 10,
              height: 10,
              background: "var(--text-primary)",
            }}
          />
        </div>
      )}

      <style>{`
        @keyframes smallGlassPulse {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.08); }
        }
      `}</style>
    </div>
  );
}
