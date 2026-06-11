"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useDashboardStore } from "@/lib/store";
import PrescriptionTable from "@/components/ui/PrescriptionTable";
import PrescriptionDetailDrawer from "@/components/ui/PrescriptionDetailDrawer";
import type { PrescriptionSortField, PrescriptionSortDir } from "@/components/ui/PrescriptionTable";
import type { Prescription, PrescriptionListResponse, DocType } from "@/types/api";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOC_TYPE_LABELS: Record<DocType, string> = {
  recipe_107:   "107-1/у",
  recipe_egisz: "ЕГИСЗ",
  doc_025:      "025/у",
  doc_003:      "003/у",
  doc_043:      "043/у",
  doc_111:      "111/у",
  doc_025_1:    "025-1/у",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDaysLeft(expiresAt: string): number {
  return Math.floor((new Date(expiresAt).getTime() - Date.now()) / 86400000);
}

function formatMonthLabel(ym: string): string {
  return new Date(ym + "-01").toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PrescriptionMonthGroup = { month: string; prescriptions: Prescription[] };

// ---------------------------------------------------------------------------
// Grouping & sorting
// ---------------------------------------------------------------------------

function groupByMonth(items: Prescription[]): PrescriptionMonthGroup[] {
  const map = new Map<string, Prescription[]>();
  for (const p of items) {
    const key = p.issue_date.slice(0, 7);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, prescriptions]) => ({ month, prescriptions }));
}

function sortPrescriptions(
  items: Prescription[],
  field: PrescriptionSortField,
  dir: PrescriptionSortDir,
): Prescription[] {
  return [...items].sort((a, b) => {
    const cmp = field === "issue_date"
      ? a.issue_date.localeCompare(b.issue_date)
      : a.expires_at.localeCompare(b.expires_at);
    return dir === "asc" ? cmp : -cmp;
  });
}

// ---------------------------------------------------------------------------
// SummaryStrip
// ---------------------------------------------------------------------------

function SummaryStrip({ items }: { items: Prescription[] }) {
  const total       = items.length;
  const active      = items.filter(p => getDaysLeft(p.expires_at) >= 0 && p.status !== "deleted").length;
  const expiringSoon = items.filter(p => { const d = getDaysLeft(p.expires_at); return d >= 0 && d <= 14; }).length;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
      {[
        { label: "Рецептов",      value: String(total),        color: "var(--text-primary)" },
        { label: "Активных",      value: String(active),       color: "var(--text-primary)" },
        { label: "Истекает скоро", value: String(expiringSoon), color: expiringSoon > 0 ? "var(--accent)" : "var(--text-primary)" },
      ].map(item => (
        <div key={item.label} className="kpi-card">
          <div className="kpi-label">{item.label}</div>
          <div className="kpi-value" style={{ color: item.color, fontSize: "22px" }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DocTypeFilterPills
// ---------------------------------------------------------------------------

function DocTypeFilterPills({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      <button
        className={`filter-pill ${value === "all" ? "active" : ""}`}
        onClick={() => onChange("all")}
      >
        Все
      </button>
      {(Object.entries(DOC_TYPE_LABELS) as [DocType, string][]).map(([key, label]) => (
        <button
          key={key}
          className={`filter-pill ${value === key ? "active" : ""}`}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MonthAccordion
// ---------------------------------------------------------------------------

function MonthAccordion({
  group, sortField, sortDir, onSort, defaultOpen, onDelete, onRowClick,
}: {
  group:        PrescriptionMonthGroup;
  sortField:    PrescriptionSortField;
  sortDir:      PrescriptionSortDir;
  onSort:       (f: PrescriptionSortField) => void;
  defaultOpen:  boolean;
  onDelete:     (id: string) => Promise<void>;
  onRowClick:   (id: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const sorted       = sortPrescriptions(group.prescriptions, sortField, sortDir);
  const activeCount  = group.prescriptions.filter(p => getDaysLeft(p.expires_at) >= 0).length;
  const soonCount    = group.prescriptions.filter(p => { const d = getDaysLeft(p.expires_at); return d >= 0 && d <= 14; }).length;
  const expiredCount = group.prescriptions.filter(p => getDaysLeft(p.expires_at) < 0).length;
  const n            = group.prescriptions.length;

  function pluralRx(n: number) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return "рецепт";
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return "рецепта";
    return "рецептов";
  }

  return (
    <div className="card" style={{ overflow: "hidden", transition: "box-shadow 0.2s" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          padding: "16px 20px", gap: 12,
          background: "none", border: "none", cursor: "pointer",
          borderBottom: open ? "1px solid var(--border-light)" : "none",
          transition: "background 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-subtle)")}
        onMouseLeave={e => (e.currentTarget.style.background = "none")}
      >
        <span style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 24, height: 24, borderRadius: "var(--r-sm)",
          background: open ? "var(--accent-light)" : "var(--bg)",
          color: open ? "var(--accent)" : "var(--text-muted)",
          transition: "all 0.2s", flexShrink: 0,
          fontSize: 12, fontWeight: 700,
        }}>
          {open ? "▲" : "▼"}
        </span>

        <span style={{
          fontSize: "14px", fontWeight: 700,
          color: "var(--text-primary)", textTransform: "capitalize",
          flex: 1, textAlign: "left",
        }}>
          {formatMonthLabel(group.month)}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: "11px", color: "var(--text-muted)",
            padding: "2px 8px", background: "var(--bg)",
            borderRadius: "var(--r-pill)", border: "1px solid var(--border)",
          }}>
            {n} {pluralRx(n)}
          </span>

          {activeCount > 0 && (
            <span className="badge badge-done" style={{ fontSize: "10px" }}>
              <span className="badge-dot" style={{ background: "#22C55E" }} />
              {activeCount}
            </span>
          )}
          {soonCount > 0 && (
            <span className="badge badge-review" style={{ fontSize: "10px" }}>
              <span className="badge-dot" style={{ background: "#F59E0B" }} />
              {soonCount}
            </span>
          )}
          {expiredCount > 0 && (
            <span className="badge badge-failed" style={{ fontSize: "10px" }}>
              <span className="badge-dot" style={{ background: "#EF4444" }} />
              {expiredCount}
            </span>
          )}
        </div>
      </button>

      {open && (
        <PrescriptionTable
          prescriptions={sorted}
          sortField={sortField}
          sortDir={sortDir}
          onSort={onSort}
          onDelete={onDelete}
          onRowClick={onRowClick}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "56px 24px", gap: 16,
      background: "var(--surface)", borderRadius: "var(--r-md)",
      border: "1px dashed var(--border-strong)",
    }}>
      <div style={{ fontSize: 40 }}>📋</div>
      <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
        Рецепты ещё не добавлены
      </div>
      <div style={{ fontSize: "13px", color: "var(--text-secondary)", maxWidth: 320, textAlign: "center" }}>
        Добавьте рецепт от врача — это поможет подтвердить расходы на рецептурные препараты
      </div>
      <button className="btn btn-primary" onClick={onAdd} style={{ marginTop: 4 }}>
        + Добавить первый рецепт
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SkeletonList
// ---------------------------------------------------------------------------

function SkeletonList() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {[1, 2, 3].map(i => (
        <div key={i} className="card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 24, height: 24, borderRadius: "var(--r-sm)", background: "var(--bg)" }} />
          <div style={{ flex: 1, height: 16, borderRadius: 4, background: "var(--bg)", maxWidth: 180 }} />
          <div style={{ height: 14, borderRadius: 4, background: "var(--bg)", width: 80 }} />
          <div style={{ height: 14, borderRadius: 4, background: "var(--bg)", width: 60 }} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PrescriptionsPage() {
  const router       = useRouter();
  const queryClient  = useQueryClient();
  const selectedYear = useDashboardStore(s => s.selectedYear);

  const [docTypeFilter, setDocTypeFilter]         = useState<string>("all");
  const [sortField, setSortField]                 = useState<PrescriptionSortField>("issue_date");
  const [sortDir, setSortDir]                     = useState<PrescriptionSortDir>("desc");
  const [drawerPrescriptionId, setDrawerPrescriptionId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<PrescriptionListResponse>({
    queryKey: ["prescriptions", docTypeFilter, selectedYear],
    queryFn: () => {
      const params = new URLSearchParams({ year: String(selectedYear) });
      if (docTypeFilter !== "all") params.set("doc_type", docTypeFilter);
      return api.get<PrescriptionListResponse>(`/api/v1/prescriptions?${params}`);
    },
    staleTime: 30_000,
  });

  function handleSort(field: PrescriptionSortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/api/v1/prescriptions/${id}`);
      void queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
      void refetch();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        alert(e.message);
      }
    }
  }

  const items  = data?.items ?? [];
  const groups = groupByMonth(items);

  return (
    <>
      {/* ── Шапка с кнопкой ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: 20 }}>
        <button
          className="btn btn-primary"
          onClick={() => router.push("/prescriptions/new")}
        >
          + Добавить рецепт
        </button>
      </div>

      {/* ── Summary strip ── */}
      {items.length > 0 && <SummaryStrip items={items} />}

      {/* ── Loading ── */}
      {isLoading && <SkeletonList />}

      {/* ── Error ── */}
      {isError && (
        <div style={{
          padding: "20px 24px", borderRadius: "var(--r-md)",
          background: "var(--red-bg)", color: "var(--red-text)",
          fontSize: "13px", fontWeight: 500,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span>⚠</span> Не удалось загрузить список рецептов.
          <button
            onClick={() => void refetch()}
            style={{
              marginLeft: "auto", textDecoration: "underline",
              background: "none", border: "none", cursor: "pointer",
              color: "inherit", fontSize: "13px",
            }}
          >
            Повторить
          </button>
        </div>
      )}

      {/* ── Empty state ── */}
      {!isLoading && !isError && items.length === 0 && (
        <EmptyState onAdd={() => router.push("/prescriptions/new")} />
      )}

      {/* ── Content ── */}
      {items.length > 0 && (
        <>
          <div style={{ marginBottom: 16 }}>
            <DocTypeFilterPills value={docTypeFilter} onChange={setDocTypeFilter} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {groups.length === 0 ? (
              <div style={{
                padding: "32px", textAlign: "center",
                background: "var(--surface)", borderRadius: "var(--r-md)",
                border: "1px solid var(--border)",
                fontSize: "13px", color: "var(--text-muted)",
              }}>
                Нет рецептов за выбранный период
              </div>
            ) : (
              groups.map((group, i) => (
                <MonthAccordion
                  key={group.month}
                  group={group}
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  defaultOpen={i === 0}
                  onDelete={handleDelete}
                  onRowClick={setDrawerPrescriptionId}
                />
              ))
            )}
          </div>
        </>
      )}

      <PrescriptionDetailDrawer
        prescriptionId={drawerPrescriptionId}
        onClose={() => setDrawerPrescriptionId(null)}
        onDeleted={() => {
          setDrawerPrescriptionId(null);
          void refetch();
          void queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
        }}
        onSaved={() => {
          void refetch();
          void queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
        }}
      />
    </>
  );
}
