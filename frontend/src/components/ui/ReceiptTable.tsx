"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReceiptListItem } from "@/types/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SortField = "purchase_date" | "total_amount" | "pharmacy_name";
export type SortDir   = "asc" | "desc";

export type ReceiptTableColumnKey =
  | "date"
  | "pharmacy"
  | "drug_name"
  | "inn"
  | "quantity"
  | "price"
  | "total"
  | "actions";

export interface ReceiptTableColumns {
  date?:      boolean;
  pharmacy?:  boolean;
  drug_name?: boolean;
  inn?:       boolean;
  quantity?:  boolean;
  price?:     boolean;
  total?:     boolean;
  actions?:   boolean;
}

export const DEFAULT_COLUMNS: Required<ReceiptTableColumns> = {
  date: true, pharmacy: true, drug_name: true, inn: true,
  quantity: true, price: true, total: true, actions: true,
};

export interface ReceiptTableProps {
  receipts:    ReceiptListItem[];
  columns?:    ReceiptTableColumns;
  sortField?:  SortField;
  sortDir?:    SortDir;
  onSort?:     (field: SortField) => void;
  onDelete?:   (id: string) => Promise<void>;
  onRowClick?: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRub(amount: string | null | undefined): string {
  if (!amount) return "—";
  return parseFloat(amount).toLocaleString("ru-RU", {
    style: "currency", currency: "RUB", maximumFractionDigits: 0,
  });
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// SortTh
// ---------------------------------------------------------------------------

function SortTh({
  field, active, dir, onSort, align = "left", children,
}: {
  field: SortField; active: SortField; dir: SortDir;
  onSort: (f: SortField) => void; align?: "left" | "right" | "center";
  children: React.ReactNode;
}) {
  const isActive = active === field;
  return (
    <th
      onClick={() => onSort(field)}
      style={{
        padding: "10px 16px", textAlign: align,
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

function PlainTh({ align = "left", children, style }: {
  align?: "left" | "right" | "center";
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <th style={{
      padding: "10px 12px", fontSize: "11px", fontWeight: 600,
      color: "var(--text-secondary)", letterSpacing: "0.04em",
      textTransform: "uppercase", textAlign: align,
      background: "var(--bg)", ...style,
    }}>
      {children}
    </th>
  );
}

// ---------------------------------------------------------------------------
// DeleteButton
// ---------------------------------------------------------------------------

function DeleteButton({ deleting, onClick }: { deleting: boolean; onClick: () => void }) {
  return (
    <button
      className="delete-btn"
      title="Удалить чек"
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
// ReceiptTable
// ---------------------------------------------------------------------------

export default function ReceiptTable({
  receipts,
  columns: columnsProp,
  sortField = "purchase_date",
  sortDir   = "desc",
  onSort,
  onDelete,
  onRowClick,
}: ReceiptTableProps) {
  const router = useRouter();
  const cols: Required<ReceiptTableColumns> = { ...DEFAULT_COLUMNS, ...columnsProp };

  const [animatingId, setAnimatingId] = useState<string | null>(null);
  const [deletedIds,  setDeletedIds]  = useState<Set<string>>(new Set());
  const [hoveredId,   setHoveredId]   = useState<string | null>(null);

  const visible = receipts.filter(r => !deletedIds.has(r.id));

  // colgroup widths (null = flexible)
  const colWidths: Array<{ key: ReceiptTableColumnKey; w: number | null }> = [
    { key: "date",      w: 90   },
    { key: "pharmacy",  w: 210  },
    { key: "drug_name", w: null },
    { key: "inn",       w: 120  },
    { key: "quantity",  w: 60   },
    { key: "price",     w: 85   },
    { key: "total",     w: 85   },
    { key: "actions",   w: 52   },
  ];

  // How many of the "middle" columns (drug_name → price) are visible.
  // Used to compute colSpan for the totals row label.
  const midCols: ReceiptTableColumnKey[] = ["drug_name", "inn", "quantity", "price"];
  const visibleMidCount = midCols.filter(k => cols[k]).length;

  // Total row: left-side colspan = fixed cols before drug_name that are present
  // but NOT included in rowspan (date, pharmacy already rowspan'd).
  // So label colspan = number of visible mid cols, total cell = 1 (if total visible).

  function handleRowClick(id: string) {
    if (onRowClick) { onRowClick(id); return; }
    router.push(`/receipts/${id}`);
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          {colWidths.map(({ key, w }) =>
            cols[key] ? (
              <col key={key} style={w ? { width: w } : undefined} />
            ) : null
          )}
        </colgroup>

        <thead>
          <tr>
            {cols.date && (
              onSort
                ? <SortTh field="purchase_date" active={sortField} dir={sortDir} onSort={onSort}>Дата</SortTh>
                : <PlainTh>Дата</PlainTh>
            )}
            {cols.pharmacy && (
              onSort
                ? <SortTh field="pharmacy_name" active={sortField} dir={sortDir} onSort={onSort}>Аптека</SortTh>
                : <PlainTh>Аптека</PlainTh>
            )}
            {cols.drug_name && (
              <PlainTh align="left" style={{ padding: "10px 16px" }}>Название лекарства</PlainTh>
            )}
            {cols.inn      && <PlainTh align="left">МНН</PlainTh>}
            {cols.quantity && <PlainTh align="right" style={{ padding: "10px 8px" }}>Кол&#8209;во</PlainTh>}
            {cols.price    && <PlainTh align="right">Цена</PlainTh>}
            {cols.total    && <PlainTh align="right" style={{ padding: "10px 16px" }}>Сумма</PlainTh>}
            {cols.actions  && <th style={{ padding: "10px 8px", background: "var(--bg)" }} />}
          </tr>
        </thead>

        <tbody>
          {visible.map((r, i) => {
            const rowBg     = i % 2 === 0 ? "var(--surface)" : "var(--surface-subtle)";
            const hoverBg   = "rgba(123,111,212,0.04)";
            const isHovered = hoveredId === r.id;
            const isDeleting = animatingId === r.id;
            const bg = isHovered && !isDeleting ? hoverBg : rowBg;

            const hasItems    = r.items && r.items.length > 0;
            const rowSpanCount = hasItems ? r.items.length + 1 : 2;

            const sharedCell: React.CSSProperties = {
              borderTop: "1px solid var(--border-light)",
              background: bg,
              transition: isDeleting ? "none" : "background 0.12s",
              verticalAlign: "top",
            };

            const rowEvents = {
              onMouseEnter: () => { if (!isDeleting) setHoveredId(r.id); },
              onMouseLeave: () => setHoveredId(null),
              onClick:      () => { if (!isDeleting) handleRowClick(r.id); },
            };

            const onAnimEnd = (rowId: string) => () => {
              if (animatingId === rowId) {
                setDeletedIds(prev => new Set([...prev, rowId]));
                setAnimatingId(null);
                void onDelete?.(rowId);
              }
            };

            const deleteCell = cols.actions ? (
              <td
                rowSpan={rowSpanCount}
                style={{ ...sharedCell, padding: "10px 8px", textAlign: "center", verticalAlign: "middle" }}
                onClick={e => e.stopPropagation()}
              >
                <DeleteButton
                  deleting={isDeleting}
                  onClick={() => { if (!isDeleting) setAnimatingId(r.id); }}
                />
              </td>
            ) : null;

            // Totals row — label spans mid cols, value in total col
            const totalsRow = (
              <tr key={`${r.id}-total`} style={{ cursor: "pointer" }} {...rowEvents}>
                {visibleMidCount > 0 && (
                  <td
                    colSpan={visibleMidCount}
                    style={{
                      ...sharedCell,
                      padding: hasItems ? "6px 12px 12px" : "8px 12px 12px",
                      fontSize: hasItems ? "12px" : "13px",
                      fontWeight: hasItems ? 600 : 400,
                      color: "var(--text-muted)",
                      textTransform: hasItems ? "uppercase" : undefined,
                      letterSpacing: hasItems ? "0.04em" : undefined,
                      textAlign: "right", borderTop: "none",
                    }}
                  >
                    Итого:
                  </td>
                )}
                {cols.total && (
                  <td style={{
                    ...sharedCell,
                    padding: hasItems ? "6px 16px 12px" : "8px 16px 12px",
                    fontSize: hasItems ? "14px" : "14px",
                    fontWeight: 800, color: "var(--text-primary)",
                    textAlign: "right", letterSpacing: "-0.02em",
                    whiteSpace: "nowrap", borderTop: "none",
                  }}>
                    {formatRub(r.total_amount)}
                  </td>
                )}
                {/* Fill action col if actions visible but no deleteCell in totals */}
                {cols.actions && <td style={{ ...sharedCell, borderTop: "none" }} />}
              </tr>
            );

            if (!hasItems) {
              return [
                <tr
                  key={`${r.id}-main`}
                  className={isDeleting ? "row-deleting" : ""}
                  onAnimationEnd={onAnimEnd(r.id)}
                  style={{ cursor: isDeleting ? "default" : "pointer" }}
                  {...rowEvents}
                >
                  {cols.date && (
                    <td rowSpan={2} style={{ ...sharedCell, padding: "12px 16px", fontSize: "13px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                      {formatDate(r.purchase_date)}
                    </td>
                  )}
                  {cols.pharmacy && (
                    <td rowSpan={2} style={{ ...sharedCell, padding: "12px 16px", fontSize: "13px", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.pharmacy_name ?? <span style={{ color: "var(--text-muted)" }}>—</span>}
                    </td>
                  )}
                  <td colSpan={visibleMidCount} style={{ ...sharedCell, padding: "12px 16px", fontSize: "13px", color: "var(--text-muted)", fontStyle: "italic" }}>
                    нет данных о препаратах
                  </td>
                  {deleteCell}
                </tr>,
                totalsRow,
              ];
            }

            return [
              ...r.items.map((item, idx) => (
                <tr
                  key={`${r.id}-item-${item.id}`}
                  className={idx === 0 && isDeleting ? "row-deleting" : ""}
                  onAnimationEnd={idx === 0 ? onAnimEnd(r.id) : undefined}
                  style={{ cursor: isDeleting ? "default" : "pointer" }}
                  {...rowEvents}
                >
                  {idx === 0 && cols.date && (
                    <td rowSpan={rowSpanCount} style={{ ...sharedCell, padding: "12px 16px", fontSize: "13px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                      {formatDate(r.purchase_date)}
                    </td>
                  )}
                  {idx === 0 && cols.pharmacy && (
                    <td rowSpan={rowSpanCount} style={{ ...sharedCell, padding: "12px 16px", fontSize: "13px", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.pharmacy_name ?? <span style={{ color: "var(--text-muted)" }}>—</span>}
                    </td>
                  )}
                  {cols.drug_name && (
                    <td style={{ ...sharedCell, padding: idx === 0 ? "12px 16px 6px" : "4px 16px", fontSize: "13px", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", borderTop: idx === 0 ? "1px solid var(--border-light)" : "none" }}>
                      {item.drug_name}
                      {item.is_rx && <span title="Рецептурный" style={{ marginLeft: 4, fontSize: "11px" }}>💊</span>}
                    </td>
                  )}
                  {cols.inn && (
                    <td style={{ ...sharedCell, padding: idx === 0 ? "12px 12px 6px" : "4px 12px", fontSize: "12px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", borderTop: idx === 0 ? "1px solid var(--border-light)" : "none" }}>
                      {item.drug_inn ?? <span style={{ color: "var(--text-muted)" }}>—</span>}
                    </td>
                  )}
                  {cols.quantity && (
                    <td style={{ ...sharedCell, padding: idx === 0 ? "12px 8px 6px" : "4px 8px", fontSize: "13px", color: "var(--text-secondary)", textAlign: "right", whiteSpace: "nowrap", borderTop: idx === 0 ? "1px solid var(--border-light)" : "none" }}>
                      {item.quantity}
                    </td>
                  )}
                  {cols.price && (
                    <td style={{ ...sharedCell, padding: idx === 0 ? "12px 12px 6px" : "4px 12px", fontSize: "13px", color: "var(--text-secondary)", textAlign: "right", whiteSpace: "nowrap", borderTop: idx === 0 ? "1px solid var(--border-light)" : "none" }}>
                      {formatRub(item.unit_price)}
                    </td>
                  )}
                  {cols.total && (
                    <td style={{ ...sharedCell, padding: idx === 0 ? "12px 16px 6px" : "4px 16px", fontSize: "13px", color: "var(--text-secondary)", textAlign: "right", whiteSpace: "nowrap", borderTop: idx === 0 ? "1px solid var(--border-light)" : "none" }}>
                      {formatRub(item.total_price)}
                    </td>
                  )}
                  {idx === 0 && deleteCell}
                </tr>
              )),
              totalsRow,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
