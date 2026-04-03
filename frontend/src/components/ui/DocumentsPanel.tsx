"use client";

import {
  Stethoscope,
  ScrollText,
  ShoppingBag,
  ShieldCheck,
  FileSpreadsheet,
} from "lucide-react";
import { DocumentGroup } from "./DocumentGroup";
import { useDocumentStats } from "@/hooks/useDocumentStats";
import { useDashboardStore } from "@/lib/store";

const GROUPS = [
  {
    key: "clinic_certs",
    title: "Справки из клиник",
    description: "КНД 1151156, договоры с клиниками",
    icon: Stethoscope,
  },
  {
    key: "recipes",
    title: "Рецепты",
    description: "Бланки 107-1/у и ЕГИСЗ-рецепты",
    icon: ScrollText,
  },
  {
    key: "pharmacy_receipts",
    title: "Чеки из аптек",
    description: "Кассовые чеки на лекарства",
    icon: ShoppingBag,
  },
  {
    key: "vhi_docs",
    title: "Документы ДМС",
    description: "Справки КНД 1151159, полисы ДМС",
    icon: ShieldCheck,
  },
  {
    key: "ndfl_certs",
    title: "Справки 2-НДФЛ",
    description: "Справки от работодателя о доходах",
    icon: FileSpreadsheet,
  },
] as const;

/**
 * DocumentsPanel — Панель 4: «Мои документы».
 * Отображает 5 групп документов со счётчиками из /api/v1/documents/stats?year={year}.
 */
export function DocumentsPanel() {
  const year = useDashboardStore((s) => s.selectedYear);
  const { data, isLoading } = useDocumentStats(year);

  // Build a lookup from group_key → counts
  const counts: Record<string, { uploaded: number; pending: number }> = {};
  for (const group of data?.groups ?? []) {
    counts[group.group_key] = {
      uploaded: group.uploaded_count,
      pending: group.pending_count,
    };
  }

  const totalPending = Object.values(counts).reduce((s, g) => s + g.pending, 0);

  return (
    <div className="card" style={{ padding: "20px 24px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "var(--text-primary)",
              letterSpacing: "-.02em",
            }}
          >
            Мои документы
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            {year} год
            {totalPending > 0 && (
              <span
                style={{
                  marginLeft: 8,
                  background: "var(--warning-light, #FEF3C7)",
                  color: "var(--warning, #F59E0B)",
                  borderRadius: 6,
                  padding: "1px 7px",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {totalPending} на проверке
              </span>
            )}
          </div>
        </div>

        {/* Legend */}
        <div
          style={{
            display: "flex",
            gap: 14,
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
          <span>
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: 2,
                background: "var(--accent)",
                marginRight: 4,
              }}
            />
            Подтверждено
          </span>
          <span>
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: 2,
                background: "var(--warning, #F59E0B)",
                marginRight: 4,
              }}
            />
            На проверке
          </span>
        </div>
      </div>

      {/* Groups list */}
      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                height: 64,
                borderRadius: 10,
                background: "var(--border-light)",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            />
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {GROUPS.map((g) => {
            const c = counts[g.key] ?? { uploaded: 0, pending: 0 };
            return (
              <DocumentGroup
                key={g.key}
                groupKey={g.key}
                title={g.title}
                description={g.description}
                icon={g.icon}
                uploadedCount={c.uploaded}
                pendingCount={c.pending}
                year={year}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
