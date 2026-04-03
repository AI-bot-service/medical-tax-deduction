"use client";

import { useState } from "react";

export interface BigGlassProps {
  totalLimit: number;
  treatmentAmount: number;
  educationAmount: number;
}

const COLOR_TREATMENT = "#4A8FE2";
const COLOR_EDUCATION = "#3BAB72";

/**
 * BigGlass — большой общий стакан с двумя цветными зонами (Панель 3).
 * Синяя зона (лечение) + зелёная зона (обучение своё).
 * Высота пропорциональна суммам расходов относительно общего лимита.
 */
export function BigGlass({
  totalLimit,
  treatmentAmount,
  educationAmount,
}: BigGlassProps) {
  const [hovered, setHovered] = useState(false);

  const total = treatmentAmount + educationAmount;
  const fillPercent = totalLimit > 0 ? Math.min((total / totalLimit) * 100, 100) : 0;

  const treatmentPct = totalLimit > 0 ? Math.min((treatmentAmount / totalLimit) * 100, 100) : 0;
  const educationPct = totalLimit > 0 ? Math.min((educationAmount / totalLimit) * 100, 100) : 0;

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("ru-RU", {
      style: "decimal",
      maximumFractionDigits: 0,
    }).format(n) + " ₽";

  const glassW = 120;
  const glassH = 140;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        position: "relative",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Заголовок над стаканом */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-secondary)",
            letterSpacing: ".04em",
            textTransform: "uppercase",
          }}
        >
          Общий лимит
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: "-.02em",
          }}
        >
          {formatCurrency(total)} / {formatCurrency(totalLimit)}
        </span>
        <span
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: fillPercent > 0 ? COLOR_TREATMENT : "var(--text-muted)",
            letterSpacing: "-.03em",
            lineHeight: 1,
          }}
        >
          {Math.round(fillPercent)}%
        </span>
      </div>

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
          boxShadow: "var(--shadow-md)",
          cursor: "default",
        }}
      >
        {/* Зона лечения (синяя, снизу) */}
        {treatmentPct > 0 && (
          <>
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: `${treatmentPct}%`,
                background: COLOR_TREATMENT,
                opacity: 0.2,
                transition: "height 600ms var(--ease-spring)",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: `${treatmentPct}%`,
                background: `linear-gradient(to top, ${COLOR_TREATMENT}66, ${COLOR_TREATMENT}22)`,
                transition: "height 600ms var(--ease-spring)",
              }}
            />
          </>
        )}

        {/* Зона обучения (зелёная, поверх лечения) */}
        {educationPct > 0 && (
          <>
            <div
              style={{
                position: "absolute",
                bottom: `${treatmentPct}%`,
                left: 0,
                right: 0,
                height: `${educationPct}%`,
                background: COLOR_EDUCATION,
                opacity: 0.2,
                transition: "height 600ms var(--ease-spring), bottom 600ms var(--ease-spring)",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: `${treatmentPct}%`,
                left: 0,
                right: 0,
                height: `${educationPct}%`,
                background: `linear-gradient(to top, ${COLOR_EDUCATION}66, ${COLOR_EDUCATION}22)`,
                borderTop: `2px solid ${COLOR_EDUCATION}88`,
                transition: "height 600ms var(--ease-spring), bottom 600ms var(--ease-spring)",
              }}
            />
          </>
        )}

        {/* Граница между зонами */}
        {treatmentPct > 0 && educationPct > 0 && (
          <div
            style={{
              position: "absolute",
              bottom: `${treatmentPct}%`,
              left: 0,
              right: 0,
              height: 2,
              background: "rgba(255,255,255,0.6)",
              transition: "bottom 600ms var(--ease-spring)",
            }}
          />
        )}

        {/* Риска верхней границы заливки */}
        {treatmentPct > 0 && (
          <div
            style={{
              position: "absolute",
              bottom: `${treatmentPct}%`,
              left: 0,
              right: 0,
              height: 2,
              background: `${COLOR_TREATMENT}88`,
              transition: "bottom 600ms var(--ease-spring)",
            }}
          />
        )}
      </div>

      {/* Легенда */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: COLOR_TREATMENT,
              opacity: 0.8,
            }}
          />
          <span style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 500 }}>
            Лечение
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: COLOR_EDUCATION,
              opacity: 0.8,
            }}
          />
          <span style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 500 }}>
            Обучение
          </span>
        </div>
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
            padding: "10px 14px",
            fontSize: 12,
            lineHeight: 1.7,
            whiteSpace: "nowrap",
            zIndex: 100,
            boxShadow: "var(--shadow-md)",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontWeight: 700,
              marginBottom: 4,
              borderBottom: "1px solid rgba(255,255,255,.2)",
              paddingBottom: 4,
            }}
          >
            Общий лимит
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: 2,
                background: COLOR_TREATMENT,
                flexShrink: 0,
              }}
            />
            Лечение: {formatCurrency(treatmentAmount)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: 2,
                background: COLOR_EDUCATION,
                flexShrink: 0,
              }}
            />
            Обучение: {formatCurrency(educationAmount)}
          </div>
          <div
            style={{
              marginTop: 4,
              borderTop: "1px solid rgba(255,255,255,.2)",
              paddingTop: 4,
              fontWeight: 600,
            }}
          >
            Итого: {formatCurrency(total)} / {formatCurrency(totalLimit)}
          </div>
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
    </div>
  );
}
