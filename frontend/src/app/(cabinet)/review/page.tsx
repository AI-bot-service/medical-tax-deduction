"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useDashboardStore } from "@/lib/store";
import { ReceiptSidePanel } from "@/components/ui/ReceiptSidePanel";
import type {
  ReceiptListResponse, ReceiptListItem, MonthGroup, OCRStatus,
} from "@/types/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRub(amount: string | null | undefined): string {
  if (!amount) return "—";
  const n = parseFloat(amount);
  return n.toLocaleString("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function formatMonthLabel(ym: string): string {
  return new Date(ym + "-01").toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
}

// ---------------------------------------------------------------------------
// OCR Status Badge
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<OCRStatus, { cls: string; dot: string; label: string }> = {
  DONE:             { cls: "badge badge-done",    dot: "#22C55E", label: "Готов" },
  REVIEW:           { cls: "badge badge-review",  dot: "#F59E0B", label: "Проверка" },
  FAILED:           { cls: "badge badge-failed",  dot: "#EF4444", label: "Ошибка" },
  PENDING:          { cls: "badge badge-pending", dot: "#7B6FD4", label: "Обработка" },
  DUPLICATE_REVIEW: { cls: "badge badge-review",  dot: "#F59E0B", label: "Дубликат" },
};

function StatusBadge({ status }: { status: OCRStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
  return (
    <span className={cfg.cls}>
      <span className="badge-dot" style={{ background: cfg.dot }} />
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sort controls
// ---------------------------------------------------------------------------

type SortField = "purchase_date" | "total_amount" | "pharmacy_name";
type SortDir   = "asc" | "desc";

function sortReceipts(receipts: ReceiptListItem[], field: SortField, dir: SortDir): ReceiptListItem[] {
  return [...receipts].sort((a, b) => {
    let cmp = 0;
    if (field === "purchase_date")     cmp = (a.purchase_date ?? "").localeCompare(b.purchase_date ?? "");
    else if (field === "total_amount") cmp = parseFloat(a.total_amount ?? "0") - parseFloat(b.total_amount ?? "0");
    else                               cmp = (a.pharmacy_name ?? "").localeCompare(b.pharmacy_name ?? "");
    return dir === "asc" ? cmp : -cmp;
  });
}

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
        padding: "10px 16px",
        textAlign: align,
        fontSize: "11px", fontWeight: 600,
        color: isActive ? "var(--accent)" : "var(--text-secondary)",
        letterSpacing: "0.04em", textTransform: "uppercase",
        cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
        background: "var(--bg)",
        transition: "color 0.15s",
      }}
    >
      {children}
      <span style={{ marginLeft: 4, opacity: isActive ? 1 : 0.3 }}>
        {isActive ? (dir === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </th>
  );
}

// ---------------------------------------------------------------------------
// MonthAccordion
// ---------------------------------------------------------------------------

function MonthAccordion({
  group, sortField, sortDir, onSort, defaultOpen, onDelete,
  selectedReceiptId, onSelectReceipt,
}: {
  group: MonthGroup;
  sortField: SortField; sortDir: SortDir;
  onSort: (f: SortField) => void;
  defaultOpen: boolean;
  onDelete: (id: string) => Promise<void>;
  selectedReceiptId: string | null;
  onSelectReceipt: (id: string | null) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [animatingId, setAnimatingId] = useState<string | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const sorted      = sortReceipts(group.receipts.filter(r => !deletedIds.has(r.id)), sortField, sortDir);
  const reviewCount = group.receipts.filter(r => r.ocr_status === "REVIEW").length;
  const dupeCount   = group.receipts.filter(r => r.ocr_status === "DUPLICATE_REVIEW").length;

  const activeReceiptInGroup = selectedReceiptId && group.receipts.some(r => r.id === selectedReceiptId)
    ? selectedReceiptId
    : null;

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
            {group.receipts.length} чек{group.receipts.length === 1 ? "" : "а"}
          </span>
          {reviewCount > 0 && (
            <span className="badge badge-review" style={{ fontSize: "10px" }}>
              <span className="badge-dot" style={{ background: "#F59E0B" }} />{reviewCount}
            </span>
          )}
          {dupeCount > 0 && (
            <span className="badge badge-review" style={{ fontSize: "10px" }}>
              <span className="badge-dot" style={{ background: "#F59E0B" }} />Дубли: {dupeCount}
            </span>
          )}
        </div>
        <span style={{
          fontSize: "15px", fontWeight: 800,
          color: "var(--text-primary)", letterSpacing: "-0.03em",
          marginLeft: 8, flexShrink: 0,
        }}>
          {formatRub(group.total_amount)}
        </span>
      </button>

      {open && (
        <div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 90 }} />
                <col style={{ width: 210 }} />
                <col />
                <col style={{ width: 120 }} />
                <col style={{ width: 60 }} />
                <col style={{ width: 85 }} />
                <col style={{ width: 85 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 52 }} />
              </colgroup>
              <thead>
                <tr>
                  <SortTh field="purchase_date" active={sortField} dir={sortDir} onSort={onSort}>Дата</SortTh>
                  <SortTh field="pharmacy_name" active={sortField} dir={sortDir} onSort={onSort}>Аптека</SortTh>
                  <th style={{ padding: "10px 16px", fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "left", background: "var(--bg)" }}>Название лекарства</th>
                  <th style={{ padding: "10px 12px", fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "left", background: "var(--bg)" }}>МНН</th>
                  <th style={{ padding: "10px 8px", fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "right", background: "var(--bg)" }}>Кол-во</th>
                  <th style={{ padding: "10px 12px", fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "right", background: "var(--bg)" }}>Цена</th>
                  <th style={{ padding: "10px 16px", fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "right", background: "var(--bg)" }}>Сумма</th>
                  <th style={{ padding: "10px 12px", fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "left", background: "var(--bg)" }}>Статус</th>
                  <th style={{ padding: "10px 8px", background: "var(--bg)" }} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => {
                  const rowBg = i % 2 === 0 ? "var(--surface)" : "var(--surface-subtle)";
                  const isSelected = selectedReceiptId === r.id;
                  const hoverBg = "rgba(123,111,212,0.04)";
                  const selectedBg = "rgba(123,111,212,0.08)";
                  const isHovered = hoveredId === r.id;
                  const isDeleting = animatingId === r.id;
                  const bg = isSelected
                    ? selectedBg
                    : isHovered && confirmId !== r.id && !isDeleting
                    ? hoverBg
                    : rowBg;
                  const hasItems = r.items && r.items.length > 0;
                  const rowSpanCount = hasItems ? r.items.length + 1 : 2;

                  const sharedCellStyle = {
                    borderTop: "1px solid var(--border-light)",
                    background: bg,
                    transition: isDeleting ? "none" : "background 0.12s",
                    verticalAlign: "top" as const,
                  };

                  const deleteCell = (
                    <td
                      rowSpan={rowSpanCount}
                      style={{ ...sharedCellStyle, padding: "10px 8px", textAlign: "center", width: 52, verticalAlign: "middle" }}
                      onClick={e => e.stopPropagation()}
                    >
                      {confirmId === r.id ? (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                          <button
                            onClick={() => { setConfirmId(null); setAnimatingId(r.id); }}
                            style={{ padding: "4px 8px", fontSize: "11px", fontWeight: 700, background: "#EF4444", color: "#fff", border: "none", borderRadius: "var(--r-sm)", cursor: "pointer", whiteSpace: "nowrap" }}
                          >Удалить</button>
                          <button
                            onClick={() => setConfirmId(null)}
                            style={{ padding: "4px 8px", fontSize: "11px", background: "var(--bg)", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", cursor: "pointer" }}
                          >Отмена</button>
                        </div>
                      ) : (
                        <button
                          className="delete-btn"
                          title="Удалить чек"
                          onClick={() => setConfirmId(r.id)}
                          style={{ opacity: 0.25, transform: "scale(0.9)", transition: "opacity 0.15s, transform 0.15s, color 0.15s, background 0.15s", background: "none", border: "none", cursor: "pointer", padding: "5px", borderRadius: "var(--r-sm)", color: "#EF4444", lineHeight: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                          onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.10)"; e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "scale(1)"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "none"; if (confirmId !== r.id) { e.currentTarget.style.opacity = "0.25"; e.currentTarget.style.transform = "scale(0.9)"; } }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                        </button>
                      )}
                    </td>
                  );

                  const handleRowClick = () => {
                    if (!isDeleting && confirmId !== r.id) {
                      onSelectReceipt(isSelected ? null : r.id);
                    }
                  };

                  const handleRowEvents = {
                    onMouseEnter: () => { if (!isDeleting) setHoveredId(r.id); },
                    onMouseLeave: () => setHoveredId(null),
                    onClick: handleRowClick,
                  };

                  const statusCell = (rowSpan: number) => (
                    <td
                      rowSpan={rowSpan}
                      style={{ ...sharedCellStyle, padding: "12px 12px", verticalAlign: "middle" }}
                      onClick={e => e.stopPropagation()}
                    >
                      <StatusBadge status={r.ocr_status} />
                    </td>
                  );

                  if (!hasItems) {
                    return [
                      <tr
                        key={`${r.id}-main`}
                        className={isDeleting ? "row-deleting" : ""}
                        onAnimationEnd={() => {
                          if (animatingId === r.id) {
                            setDeletedIds(prev => new Set([...prev, r.id]));
                            setAnimatingId(null);
                            void onDelete(r.id);
                          }
                        }}
                        style={{ cursor: isDeleting || confirmId === r.id ? "default" : "pointer" }}
                        {...handleRowEvents}
                      >
                        <td rowSpan={2} style={{ ...sharedCellStyle, padding: "12px 16px", fontSize: "13px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                          {formatDate(r.purchase_date)}
                        </td>
                        <td rowSpan={2} style={{ ...sharedCellStyle, padding: "12px 16px", fontSize: "13px", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.pharmacy_name ?? <span style={{ color: "var(--text-muted)" }}>—</span>}
                        </td>
                        <td colSpan={5} style={{ ...sharedCellStyle, padding: "12px 16px", fontSize: "13px", color: "var(--text-muted)", fontStyle: "italic" }}>нет данных о препаратах</td>
                        {statusCell(2)}
                        {deleteCell}
                      </tr>,
                      <tr key={`${r.id}-total`} style={{ cursor: "pointer" }} {...handleRowEvents}>
                        <td colSpan={4} style={{ ...sharedCellStyle, padding: "8px 12px 12px", fontSize: "13px", color: "var(--text-muted)", textAlign: "right", borderTop: "none" }}>Итого:</td>
                        <td style={{ ...sharedCellStyle, padding: "8px 16px 12px", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", textAlign: "right", letterSpacing: "-0.02em", whiteSpace: "nowrap", borderTop: "none" }}>{formatRub(r.total_amount)}</td>
                      </tr>,
                    ];
                  }

                  return [
                    ...r.items.map((item, idx) => (
                      <tr
                        key={`${r.id}-item-${item.id}`}
                        className={idx === 0 && isDeleting ? "row-deleting" : ""}
                        onAnimationEnd={idx === 0 ? () => {
                          if (animatingId === r.id) {
                            setDeletedIds(prev => new Set([...prev, r.id]));
                            setAnimatingId(null);
                            void onDelete(r.id);
                          }
                        } : undefined}
                        style={{ cursor: isDeleting || confirmId === r.id ? "default" : "pointer" }}
                        {...handleRowEvents}
                      >
                        {idx === 0 && (
                          <td rowSpan={rowSpanCount} style={{ ...sharedCellStyle, padding: "12px 16px", fontSize: "13px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                            {formatDate(r.purchase_date)}
                          </td>
                        )}
                        {idx === 0 && (
                          <td rowSpan={rowSpanCount} style={{ ...sharedCellStyle, padding: "12px 16px", fontSize: "13px", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.pharmacy_name ?? <span style={{ color: "var(--text-muted)" }}>—</span>}
                          </td>
                        )}
                        <td style={{ ...sharedCellStyle, padding: idx === 0 ? "12px 16px 6px" : "4px 16px", fontSize: "13px", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", borderTop: idx === 0 ? "1px solid var(--border-light)" : "none" }}>
                          {item.drug_name}
                          {item.is_rx && <span title="Рецептурный" style={{ marginLeft: 4, fontSize: "11px" }}>💊</span>}
                        </td>
                        <td style={{ ...sharedCellStyle, padding: idx === 0 ? "12px 12px 6px" : "4px 12px", fontSize: "12px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", borderTop: idx === 0 ? "1px solid var(--border-light)" : "none" }}>
                          {item.drug_inn ?? <span style={{ color: "var(--text-muted)" }}>—</span>}
                        </td>
                        <td style={{ ...sharedCellStyle, padding: idx === 0 ? "12px 8px 6px" : "4px 8px", fontSize: "13px", color: "var(--text-secondary)", textAlign: "right", whiteSpace: "nowrap", borderTop: idx === 0 ? "1px solid var(--border-light)" : "none" }}>
                          {item.quantity}
                        </td>
                        <td style={{ ...sharedCellStyle, padding: idx === 0 ? "12px 12px 6px" : "4px 12px", fontSize: "13px", color: "var(--text-secondary)", textAlign: "right", whiteSpace: "nowrap", borderTop: idx === 0 ? "1px solid var(--border-light)" : "none" }}>
                          {formatRub(item.unit_price)}
                        </td>
                        <td style={{ ...sharedCellStyle, padding: idx === 0 ? "12px 16px 6px" : "4px 16px", fontSize: "13px", color: "var(--text-secondary)", textAlign: "right", whiteSpace: "nowrap", borderTop: idx === 0 ? "1px solid var(--border-light)" : "none" }}>
                          {formatRub(item.total_price)}
                        </td>
                        {idx === 0 && statusCell(rowSpanCount)}
                        {idx === 0 && deleteCell}
                      </tr>
                    )),
                    <tr key={`${r.id}-total`} style={{ cursor: "pointer" }} {...handleRowEvents}>
                      <td colSpan={4} style={{ ...sharedCellStyle, padding: "6px 12px 12px", fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "right", borderTop: "none" }}>Итого:</td>
                      <td style={{ ...sharedCellStyle, padding: "6px 16px 12px", fontSize: "14px", fontWeight: 800, color: "var(--text-primary)", textAlign: "right", letterSpacing: "-0.02em", whiteSpace: "nowrap", borderTop: "none" }}>{formatRub(r.total_amount)}</td>
                    </tr>,
                  ];
                })}
              </tbody>
            </table>
          </div>

          {/* Карточка редактирования — появляется под таблицей при выборе чека */}
          {activeReceiptInGroup && (
            <div style={{
              padding: "16px",
              borderTop: "2px solid var(--accent-mid)",
              background: "var(--surface-subtle)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Редактирование чека
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={() => router.push(`/receipts/${activeReceiptInGroup}`)}
                    style={{
                      fontSize: "12px", fontWeight: 600,
                      color: "var(--text-secondary)",
                      background: "none", border: "1px solid var(--border)",
                      borderRadius: "var(--r-sm)",
                      padding: "4px 10px",
                      cursor: "pointer",
                      fontFamily: "Urbanist, sans-serif",
                    }}
                  >
                    Открыть полностью →
                  </button>
                  <button
                    onClick={() => onSelectReceipt(null)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 28, height: 28,
                      borderRadius: "var(--r-sm)",
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      cursor: "pointer",
                      fontSize: "14px",
                      color: "var(--text-secondary)",
                      fontFamily: "Urbanist, sans-serif",
                      lineHeight: 1,
                    }}
                    title="Закрыть"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <ReceiptSidePanel
                receiptId={activeReceiptInGroup}
                onNavigate={() => router.push(`/receipts/${activeReceiptInGroup}`)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MonthFilterPills
// ---------------------------------------------------------------------------

function MonthFilterPills({ months, value, onChange }: { months: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      <button className={`filter-pill ${value === "all" ? "active" : ""}`} onClick={() => onChange("all")}>
        Все месяцы
      </button>
      {months.map(m => (
        <button key={m} className={`filter-pill ${value === m ? "active" : ""}`} onClick={() => onChange(m)}>
          {formatMonthLabel(m)}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary strip
// ---------------------------------------------------------------------------

function SummaryStrip({ data, filter }: { data: ReceiptListResponse; filter: string }) {
  const months = filter === "all" ? data.months : data.months.filter(m => m.month === filter);
  const total  = months.reduce((s, m) => s + m.receipts.reduce((rs, r) => rs + parseFloat(r.total_amount ?? "0"), 0), 0);
  const count  = months.reduce((s, m) => s + m.receipts.length, 0);
  const deduction = (total * 0.13).toFixed(0);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
      {[
        { label: "На проверке", value: String(count), color: "var(--text-primary)" },
        { label: "Сумма расходов", value: parseFloat(String(total)).toLocaleString("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }), color: "var(--text-primary)" },
        { label: "Вычет 13%", value: parseFloat(deduction).toLocaleString("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }), color: "var(--accent)" },
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
// Skeleton loader
// ---------------------------------------------------------------------------

function SkeletonList() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {[1, 2, 3].map(i => (
        <div key={i} className="card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 24, height: 24, borderRadius: "var(--r-sm)", background: "var(--bg)" }} />
          <div style={{ flex: 1, height: 16, borderRadius: 4, background: "var(--bg)", maxWidth: 160 }} />
          <div style={{ height: 14, borderRadius: 4, background: "var(--bg)", width: 80 }} />
          <div style={{ height: 18, borderRadius: 4, background: "var(--bg)", width: 100 }} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "56px 24px", gap: 16,
      background: "var(--surface)", borderRadius: "var(--r-md)",
      border: "1px dashed var(--border-strong)",
    }}>
      <div style={{ fontSize: 40 }}>✅</div>
      <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>Нет чеков на проверке</div>
      <div style={{ fontSize: "13px", color: "var(--text-secondary)", maxWidth: 320, textAlign: "center" }}>
        Все чеки прошли автоматическую обработку или ещё не загружены
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const REVIEW_STATUSES = new Set<OCRStatus>(["REVIEW", "DUPLICATE_REVIEW"]);

export default function ReviewListPage() {
  const queryClient = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [sortField, setSortField]         = useState<SortField>("purchase_date");
  const [sortDir, setSortDir]             = useState<SortDir>("desc");
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);
  const selectedYear = useDashboardStore(s => s.selectedYear);

  const { data, isLoading, isError, refetch } = useQuery<ReceiptListResponse>({
    queryKey: ["receipts-list", selectedYear],
    queryFn:  () => api.get<ReceiptListResponse>(`/api/v1/receipts?year=${selectedYear}`),
    staleTime: 30_000,
  });

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  }

  async function handleDelete(id: string) {
    await api.delete(`/api/v1/receipts/${id}`);
    if (selectedReceiptId === id) setSelectedReceiptId(null);
    void queryClient.invalidateQueries({ queryKey: ["receipts-list"] });
    void refetch();
  }

  // Фильтруем только чеки на проверке (REVIEW + DUPLICATE_REVIEW)
  const reviewData: ReceiptListResponse | undefined = data
    ? {
        total_count: data.months.reduce((s, m) => s + m.receipts.filter(r => REVIEW_STATUSES.has(r.ocr_status)).length, 0),
        months: data.months
          .map(m => ({
            ...m,
            receipts: m.receipts.filter(r => REVIEW_STATUSES.has(r.ocr_status)),
            total_amount: m.receipts
              .filter(r => REVIEW_STATUSES.has(r.ocr_status))
              .reduce((s, r) => s + parseFloat(r.total_amount ?? "0"), 0)
              .toFixed(2),
          }))
          .filter(m => m.receipts.length > 0),
      }
    : undefined;

  const allMonths     = reviewData?.months.map(m => m.month) ?? [];
  const visibleMonths = reviewData
    ? selectedMonth === "all" ? reviewData.months : reviewData.months.filter(m => m.month === selectedMonth)
    : [];

  return (
    <>
      {/* ── Summary strip ── */}
      {reviewData && reviewData.total_count > 0 && (
        <SummaryStrip data={reviewData} filter={selectedMonth} />
      )}

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
          <span>⚠</span> Не удалось загрузить список чеков.
          <button
            onClick={() => void refetch()}
            style={{ marginLeft: "auto", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: "13px" }}
          >
            Повторить
          </button>
        </div>
      )}

      {/* ── Empty ── */}
      {!isLoading && reviewData && reviewData.total_count === 0 && <EmptyState />}

      {/* ── Content ── */}
      {reviewData && reviewData.total_count > 0 && (
        <>
          <div style={{ marginBottom: 16 }}>
            <MonthFilterPills months={allMonths} value={selectedMonth} onChange={setSelectedMonth} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {visibleMonths.length === 0 ? (
              <div style={{
                padding: "32px", textAlign: "center",
                background: "var(--surface)", borderRadius: "var(--r-md)",
                border: "1px solid var(--border)",
                fontSize: "13px", color: "var(--text-muted)",
              }}>
                Нет чеков за выбранный период
              </div>
            ) : (
              visibleMonths.map((group, i) => (
                <MonthAccordion
                  key={group.month}
                  group={group}
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  defaultOpen={i === 0}
                  onDelete={handleDelete}
                  selectedReceiptId={selectedReceiptId}
                  onSelectReceipt={setSelectedReceiptId}
                />
              ))
            )}
          </div>
        </>
      )}
    </>
  );
}
