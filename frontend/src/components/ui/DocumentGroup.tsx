"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export interface DocumentGroupProps {
  title: string;
  description: string;
  icon: LucideIcon;
  uploadedCount: number;
  pendingCount: number;
  groupKey: string;
  year: number;
}

/**
 * DocumentGroup — горизонтальная карточка группы документов (Панель 4).
 * Отображает иконку, название, пояснение, два счётчика и статусный индикатор.
 * uploadedCount > 0 → ссылка на /receipts?type={groupKey}&status=confirmed&year={year}
 * pendingCount > 0 → ссылка на /receipts?type={groupKey}&status=pending&year={year}
 */
export function DocumentGroup({
  title,
  description,
  icon: Icon,
  uploadedCount,
  pendingCount,
  groupKey,
  year,
}: DocumentGroupProps) {
  // Status indicator: ✅ if no pending and some uploaded, ⚠️ if pending>0, ○ if both=0
  const statusIcon =
    pendingCount > 0
      ? "⚠️"
      : uploadedCount > 0
      ? "✅"
      : "○";

  const statusColor =
    pendingCount > 0
      ? "var(--warning, #F59E0B)"
      : uploadedCount > 0
      ? "var(--success, #3BAB72)"
      : "var(--text-muted)";

  return (
    <div
      className="card"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "14px 18px",
        borderRadius: 10,
      }}
    >
      {/* Icon */}
      <div
        style={{
          flexShrink: 0,
          width: 40,
          height: 40,
          borderRadius: 10,
          background: "var(--accent-light, #EEF0FB)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--accent)",
        }}
      >
        <Icon size={20} strokeWidth={1.8} />
      </div>

      {/* Title + description */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text)",
            lineHeight: 1.3,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            marginTop: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {description}
        </div>
      </div>

      {/* Counters */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        {uploadedCount > 0 ? (
          <Link
            href={`/receipts?type=${groupKey}&status=confirmed&year=${year}`}
            style={{
              color: "var(--accent)",
              textDecoration: "none",
              background: "var(--accent-light, #EEF0FB)",
              borderRadius: 6,
              padding: "2px 8px",
              transition: "opacity 0.15s",
            }}
            title="Подтверждённые документы"
          >
            {uploadedCount}
          </Link>
        ) : (
          <span style={{ color: "var(--text-muted)", padding: "2px 8px" }}>0</span>
        )}

        <span style={{ color: "var(--border-strong, #C7C7CC)", fontSize: 11 }}>/</span>

        {pendingCount > 0 ? (
          <Link
            href={`/receipts?type=${groupKey}&status=pending&year=${year}`}
            style={{
              color: "var(--warning, #F59E0B)",
              textDecoration: "none",
              background: "var(--warning-light, #FEF3C7)",
              borderRadius: 6,
              padding: "2px 8px",
              transition: "opacity 0.15s",
            }}
            title="Ожидают проверки"
          >
            {pendingCount}
          </Link>
        ) : (
          <span style={{ color: "var(--text-muted)", padding: "2px 8px" }}>0</span>
        )}
      </div>

      {/* Status indicator */}
      <div
        style={{
          flexShrink: 0,
          fontSize: 16,
          color: statusColor,
          width: 24,
          textAlign: "center",
        }}
        title={
          pendingCount > 0
            ? "Есть документы на проверке"
            : uploadedCount > 0
            ? "Все документы подтверждены"
            : "Нет документов"
        }
      >
        {statusIcon}
      </div>
    </div>
  );
}
