"use client";

import React, { useState } from "react";
import type { Prescription, DocType, RiskLevel } from "@/types/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PrescriptionSortField = "issue_date" | "expires_at";
export type PrescriptionSortDir   = "asc" | "desc";

export interface PrescriptionTableProps {
  prescriptions: Prescription[];
  sortField?:    PrescriptionSortField;
  sortDir?:      PrescriptionSortDir;
  onSort?:       (field: PrescriptionSortField) => void;
  onDelete?:     (id: string) => Promise<void>;
}

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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "2-digit",
  });
}

function getDaysLeft(expiresAt: string): number {
  return Math.floor((new Date(expiresAt).getTime() - Date.now()) / 86400000);
}

// ---------------------------------------------------------------------------
// SortTh
// ---------------------------------------------------------------------------

function SortTh({
  field, active, dir, onSort, children,
}: {
  field: PrescriptionSortField;
  active: PrescriptionSortField;
  dir: PrescriptionSortDir;
  onSort: (f: PrescriptionSortField) => void;
  children: React.ReactNode;
}) {
  const isActive = active === field;
  return (
    <th
      onClick={() => onSort(field)}
      style={{
        padding: "10px 16px", textAlign: "left",
        fontSize: "11px", fontWeight: 600,
        color: isActive ? "var(--accent)" : "var(--text-secondary)",
        letterSpacing: "0.04em", textTransform: "uppercase",
        cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
        background: "var(--bg)", transition: "color 0.15s",
      }}
    >
      {children}
      <span style={{ marginLeft: 4, opacity: isActive ? 1 : 0.3 }}>
        {isActive ? (dir === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </th>
  );
}

function PlainTh({
  align = "left", children, style,
}: {
  align?: "left" | "right" | "center";
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <th style={{
      padding: "10px 12px", fontSize: "11px", fontWeight: 600,
      color: "var(--text-secondary)", letterSpacing: "0.04em",
      textTransform: "uppercase", textAlign: align,
      background: "var(--bg)", whiteSpace: "nowrap", ...style,
    }}>
      {children}
    </th>
  );
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

function StatusBadge({ prescription }: { prescription: Prescription }) {
  if (prescription.status === "deleted") {
    return (
      <span className="badge" style={{
        background: "var(--bg)", color: "var(--text-muted)",
        border: "1px solid var(--border)", fontSize: "10px",
        padding: "2px 8px", borderRadius: "var(--r-pill)",
        display: "inline-flex", alignItems: "center", gap: 4,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-muted)", display: "inline-block" }} />
        Удалён
      </span>
    );
  }

  const daysLeft = getDaysLeft(prescription.expires_at);

  if (daysLeft < 0) {
    return (
      <span className="badge badge-failed" style={{ fontSize: "10px" }}>
        <span className="badge-dot" style={{ background: "#EF4444" }} />
        Просрочен
      </span>
    );
  }
  if (daysLeft <= 14) {
    return (
      <span className="badge badge-review" style={{ fontSize: "10px" }}>
        <span className="badge-dot" style={{ background: "#F59E0B" }} />
        Истекает
      </span>
    );
  }
  return (
    <span className="badge badge-done" style={{ fontSize: "10px" }}>
      <span className="badge-dot" style={{ background: "#22C55E" }} />
      Активен
    </span>
  );
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  if (risk === "DISPUTED") {
    return (
      <span style={{
        fontSize: "10px", fontWeight: 600,
        padding: "2px 8px", borderRadius: "var(--r-pill)",
        background: "rgba(245,158,11,0.10)", color: "#B45309",
        border: "1px solid rgba(245,158,11,0.25)",
        display: "inline-flex", alignItems: "center", gap: 3,
      }}>
        ⚠ Спорный
      </span>
    );
  }
  if (risk === "HIGH") {
    return (
      <span style={{
        fontSize: "10px", fontWeight: 600,
        padding: "2px 8px", borderRadius: "var(--r-pill)",
        background: "var(--red-bg)", color: "var(--red-text)",
        border: "1px solid rgba(239,68,68,0.25)",
        display: "inline-flex", alignItems: "center", gap: 3,
      }}>
        🔴 Высокий
      </span>
    );
  }
  return <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>—</span>;
}

// ---------------------------------------------------------------------------
// ExpiryCell
// ---------------------------------------------------------------------------

function ExpiryCell({ expiresAt }: { expiresAt: string }) {
  const daysLeft = getDaysLeft(expiresAt);
  const label = formatDate(expiresAt);

  if (daysLeft < 0) {
    return (
      <span style={{
        fontSize: "12px", fontWeight: 600,
        color: "var(--red-text)", background: "var(--red-bg)",
        padding: "2px 6px", borderRadius: "var(--r-sm)",
      }}>
        {label}
      </span>
    );
  }
  if (daysLeft <= 14) {
    return (
      <span style={{
        fontSize: "12px", fontWeight: 600,
        color: "#92400E", background: "rgba(245,158,11,0.10)",
        padding: "2px 6px", borderRadius: "var(--r-sm)",
      }}>
        {label}
      </span>
    );
  }
  return <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{label}</span>;
}

// ---------------------------------------------------------------------------
// DeleteButton
// ---------------------------------------------------------------------------

function DeleteButton({ deleting, onClick }: { deleting: boolean; onClick: () => void }) {
  return (
    <button
      className="delete-btn"
      title="Удалить рецепт"
      onClick={onClick}
      disabled={deleting}
      style={{
        opacity: deleting ? 0 : 0.25, transform: "scale(0.9)",
        transition: "opacity 0.15s, transform 0.15s, color 0.15s, background 0.15s",
        background: "none", border: "none", cursor: "pointer",
        padding: "5px", borderRadius: "var(--r-sm)",
        color: "#EF4444", lineHeight: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}
      onMouseEnter={e => {
        if (!deleting) {
          e.currentTarget.style.background = "rgba(239,68,68,0.10)";
          e.currentTarget.style.opacity = "1";
          e.currentTarget.style.transform = "scale(1)";
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = "none";
        if (!deleting) {
          e.currentTarget.style.opacity = "0.25";
          e.currentTarget.style.transform = "scale(0.9)";
        }
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
        <path d="M10 11v6M14 11v6"/>
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
      </svg>
    </button>
  );
}

// ---------------------------------------------------------------------------
// PrescriptionTable
// ---------------------------------------------------------------------------

export default function PrescriptionTable({
  prescriptions,
  sortField = "issue_date",
  sortDir   = "desc",
  onSort,
  onDelete,
}: PrescriptionTableProps) {
  const [animatingId, setAnimatingId] = useState<string | null>(null);
  const [deletedIds,  setDeletedIds]  = useState<Set<string>>(new Set());
  const [hoveredId,   setHoveredId]   = useState<string | null>(null);

  const visible = prescriptions.filter(p => !deletedIds.has(p.id));

  function handleAnimEnd(id: string) {
    if (animatingId === id) {
      setDeletedIds(prev => new Set([...prev, id]));
      setAnimatingId(null);
      void onDelete?.(id);
    }
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
        <colgroup>
          <col style={{ width: 90 }}  />  {/* Дата */}
          <col style={{ width: 80 }}  />  {/* Тип */}
          <col />                          {/* Препарат */}
          <col style={{ width: 110 }} />  {/* Дозировка */}
          <col style={{ width: 160 }} />  {/* Врач */}
          <col style={{ width: 95 }}  />  {/* Истекает */}
          <col style={{ width: 95 }}  />  {/* Статус */}
          <col style={{ width: 95 }}  />  {/* Риск */}
          <col style={{ width: 52 }}  />  {/* Действия */}
        </colgroup>

        <thead>
          <tr>
            {onSort ? (
              <SortTh field="issue_date" active={sortField} dir={sortDir} onSort={onSort}>
                Дата выдачи
              </SortTh>
            ) : (
              <PlainTh style={{ padding: "10px 16px" }}>Дата выдачи</PlainTh>
            )}
            <PlainTh>Тип</PlainTh>
            <PlainTh style={{ padding: "10px 16px" }}>Препарат</PlainTh>
            <PlainTh>Дозировка</PlainTh>
            <PlainTh>Врач</PlainTh>
            {onSort ? (
              <SortTh field="expires_at" active={sortField} dir={sortDir} onSort={onSort}>
                Истекает
              </SortTh>
            ) : (
              <PlainTh>Истекает</PlainTh>
            )}
            <PlainTh align="center">Статус</PlainTh>
            <PlainTh align="center">Риск</PlainTh>
            <th style={{ padding: "10px 8px", background: "var(--bg)" }} />
          </tr>
        </thead>

        <tbody>
          {visible.map((p, i) => {
            const rowBg     = i % 2 === 0 ? "var(--surface)" : "var(--surface-subtle)";
            const hoverBg   = "rgba(123,111,212,0.04)";
            const isHovered = hoveredId === p.id;
            const isDeleting = animatingId === p.id;
            const bg = isHovered && !isDeleting ? hoverBg : rowBg;

            const cellBase: React.CSSProperties = {
              borderTop: "1px solid var(--border-light)",
              background: bg,
              transition: isDeleting ? "none" : "background 0.12s",
              verticalAlign: "middle",
              padding: "10px 12px",
            };

            const rowEvents = {
              onMouseEnter: () => { if (!isDeleting) setHoveredId(p.id); },
              onMouseLeave: () => setHoveredId(null),
            };

            return (
              <tr
                key={p.id}
                className={isDeleting ? "row-deleting" : ""}
                onAnimationEnd={() => handleAnimEnd(p.id)}
                {...rowEvents}
              >
                {/* Дата выдачи */}
                <td style={{ ...cellBase, padding: "10px 16px", fontSize: "13px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                  {formatDate(p.issue_date)}
                </td>

                {/* Тип документа */}
                <td style={{ ...cellBase }}>
                  <span style={{
                    fontSize: "11px", fontWeight: 700,
                    padding: "2px 7px", borderRadius: "var(--r-pill)",
                    background: "var(--accent-light)", color: "var(--accent)",
                    whiteSpace: "nowrap",
                  }}>
                    {DOC_TYPE_LABELS[p.doc_type as DocType] ?? p.doc_type}
                  </span>
                </td>

                {/* Препарат */}
                <td style={{ ...cellBase, padding: "10px 16px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.drug_name}
                  </div>
                  {p.drug_inn && (
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.drug_inn}
                    </div>
                  )}
                </td>

                {/* Дозировка */}
                <td style={{ ...cellBase, fontSize: "12px", color: "var(--text-secondary)" }}>
                  {p.dosage ?? <span style={{ color: "var(--text-muted)" }}>—</span>}
                </td>

                {/* Врач */}
                <td style={{ ...cellBase }}>
                  <div style={{ fontSize: "12px", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }}>
                    {p.doctor_name}
                  </div>
                  {p.doctor_specialty && (
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.doctor_specialty}
                    </div>
                  )}
                </td>

                {/* Истекает */}
                <td style={{ ...cellBase, whiteSpace: "nowrap" }}>
                  <ExpiryCell expiresAt={p.expires_at} />
                </td>

                {/* Статус */}
                <td style={{ ...cellBase, textAlign: "center" }}>
                  <StatusBadge prescription={p} />
                </td>

                {/* Риск */}
                <td style={{ ...cellBase, textAlign: "center" }}>
                  <RiskBadge risk={p.risk_level} />
                </td>

                {/* Действия */}
                <td
                  style={{ ...cellBase, padding: "10px 8px", textAlign: "center" }}
                  onClick={e => e.stopPropagation()}
                >
                  <DeleteButton
                    deleting={isDeleting}
                    onClick={() => { if (!isDeleting) setAnimatingId(p.id); }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
