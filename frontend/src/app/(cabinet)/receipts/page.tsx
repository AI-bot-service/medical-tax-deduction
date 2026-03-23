"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { UploadZone } from "@/components/ui/UploadZone";
import { BatchProgress } from "@/components/ui/BatchProgress";
import { useBatchStore } from "@/lib/store";
import type { ReceiptListResponse, ReceiptListItem, MonthGroup, OCRStatus } from "@/types/api";

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
// OCR Status Badge  (HEITKAMP .badge-*)
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<OCRStatus, { cls: string; dot: string; label: string }> = {
  DONE:    { cls: "badge badge-done",    dot: "#22C55E", label: "Готов" },
  REVIEW:  { cls: "badge badge-review",  dot: "#F59E0B", label: "Проверка" },
  FAILED:  { cls: "badge badge-failed",  dot: "#EF4444", label: "Ошибка" },
  PENDING: { cls: "badge badge-pending", dot: "#7B6FD4", label: "Обработка" },
};

function StatusBadge({ status, confidence }: { status: OCRStatus; confidence?: number | null }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
  const pct = confidence != null ? ` ${Math.round(confidence * 100)}%` : "";
  return (
    <span className={cfg.cls}>
      <span className="badge-dot" style={{ background: cfg.dot }} />
      {cfg.label}{pct}
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
    if (field === "purchase_date")  cmp = (a.purchase_date ?? "").localeCompare(b.purchase_date ?? "");
    else if (field === "total_amount") cmp = parseFloat(a.total_amount ?? "0") - parseFloat(b.total_amount ?? "0");
    else                            cmp = (a.pharmacy_name ?? "").localeCompare(b.pharmacy_name ?? "");
    return dir === "asc" ? cmp : -cmp;
  });
}

// ---------------------------------------------------------------------------
// SortTh — sortable table header cell
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
// MonthAccordion — one collapsible month group
// ---------------------------------------------------------------------------

function MonthAccordion({
  group, sortField, sortDir, onSort, defaultOpen,
}: {
  group: MonthGroup;
  sortField: SortField; sortDir: SortDir;
  onSort: (f: SortField) => void;
  defaultOpen: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);

  const sorted   = sortReceipts(group.receipts, sortField, sortDir);
  const rxCount  = group.receipts.filter(r => r.needs_prescription).length;
  const doneCount  = group.receipts.filter(r => r.ocr_status === "DONE").length;
  const reviewCount = group.receipts.filter(r => r.ocr_status === "REVIEW").length;

  return (
    <div
      className="card"
      style={{ overflow: "hidden", transition: "box-shadow 0.2s" }}
    >
      {/* ── Month header (clickable) ── */}
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
        {/* Chevron */}
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

        {/* Month name */}
        <span style={{
          fontSize: "14px", fontWeight: 700,
          color: "var(--text-primary)", textTransform: "capitalize",
          flex: 1, textAlign: "left",
        }}>
          {formatMonthLabel(group.month)}
        </span>

        {/* Stats pills */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: "11px", color: "var(--text-muted)",
            padding: "2px 8px", background: "var(--bg)",
            borderRadius: "var(--r-pill)", border: "1px solid var(--border)",
          }}>
            {group.receipts.length} чек{group.receipts.length === 1 ? "" : "а"}
          </span>
          {doneCount > 0 && (
            <span className="badge badge-done" style={{ fontSize: "10px" }}>
              <span className="badge-dot" style={{ background: "#22C55E" }} />
              {doneCount}
            </span>
          )}
          {reviewCount > 0 && (
            <span className="badge badge-review" style={{ fontSize: "10px" }}>
              <span className="badge-dot" style={{ background: "#F59E0B" }} />
              {reviewCount}
            </span>
          )}
          {rxCount > 0 && (
            <span style={{
              fontSize: "10px", fontWeight: 600,
              padding: "2px 8px", borderRadius: "var(--r-pill)",
              background: "var(--purple-bg)", color: "var(--purple-text)",
            }}>
              💊 Rx: {rxCount}
            </span>
          )}
        </div>

        {/* Total */}
        <span style={{
          fontSize: "15px", fontWeight: 800,
          color: "var(--text-primary)", letterSpacing: "-0.03em",
          marginLeft: 8, flexShrink: 0,
        }}>
          {formatRub(group.total_amount)}
        </span>
      </button>

      {/* ── Receipts table ── */}
      {open && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <SortTh field="purchase_date" active={sortField} dir={sortDir} onSort={onSort}>
                  Дата
                </SortTh>
                <SortTh field="pharmacy_name" active={sortField} dir={sortDir} onSort={onSort}>
                  Аптека
                </SortTh>
                <SortTh field="total_amount" active={sortField} dir={sortDir} onSort={onSort} align="right">
                  Сумма
                </SortTh>
                <th style={{ padding: "10px 16px", fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "center", background: "var(--bg)" }}>
                  Статус
                </th>
                <th style={{ padding: "10px 16px", fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "center", background: "var(--bg)", width: 40 }}>
                  Rx
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/receipts/${r.id}`)}
                  style={{
                    borderTop: "1px solid var(--border-light)",
                    cursor: "pointer",
                    transition: "background 0.12s",
                    background: i % 2 === 0 ? "var(--surface)" : "var(--surface-subtle)",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(123,111,212,0.04)")}
                  onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "var(--surface)" : "var(--surface-subtle)")}
                >
                  <td style={{ padding: "12px 16px", fontSize: "13px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                    {formatDate(r.purchase_date)}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "13px", color: "var(--text-primary)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.pharmacy_name ?? <span style={{ color: "var(--text-muted)" }}>—</span>}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", textAlign: "right", letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>
                    {formatRub(r.total_amount)}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    <StatusBadge status={r.ocr_status} confidence={r.ocr_confidence} />
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    {r.needs_prescription && (
                      <span title="Требуется рецепт" style={{ fontSize: "14px" }}>💊</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MonthFilterPills
// ---------------------------------------------------------------------------

function MonthFilterPills({
  months, value, onChange,
}: {
  months: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      <button
        className={`filter-pill ${value === "all" ? "active" : ""}`}
        onClick={() => onChange("all")}
      >
        Все месяцы
      </button>
      {months.map(m => (
        <button
          key={m}
          className={`filter-pill ${value === m ? "active" : ""}`}
          onClick={() => onChange(m)}
        >
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
  const total  = months.reduce((s, m) => s + parseFloat(m.total_amount || "0"), 0);
  const count  = months.reduce((s, m) => s + m.receipts.length, 0);
  const deduction = (total * 0.13).toFixed(0);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
      {[
        { label: "Чеков", value: String(count), color: "var(--text-primary)" },
        {
          label: "Сумма расходов",
          value: parseFloat(String(total)).toLocaleString("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }),
          color: "var(--text-primary)",
        },
        {
          label: "Вычет 13%",
          value: parseFloat(deduction).toLocaleString("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }),
          color: "var(--accent)",
        },
      ].map(item => (
        <div key={item.label} className="kpi-card">
          <div className="kpi-label">{item.label}</div>
          <div className="kpi-value" style={{ color: item.color, fontSize: "22px" }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "56px 24px", gap: 16,
      background: "var(--surface)", borderRadius: "var(--r-md)",
      border: "1px dashed var(--border-strong)",
    }}>
      <div style={{ fontSize: 40 }}>🧾</div>
      <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
        Чеки ещё не загружены
      </div>
      <div style={{ fontSize: "13px", color: "var(--text-secondary)", maxWidth: 320, textAlign: "center" }}>
        Загрузите фото чека из аптеки — система распознает препараты автоматически
      </div>
      <button className="btn btn-primary" onClick={onUpload} style={{ marginTop: 4 }}>
        + Загрузить первый чек
      </button>
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
// Page
// ---------------------------------------------------------------------------

export default function ReceiptsPage() {
  const router      = useRouter();
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [showUpload, setShowUpload]       = useState(false);
  const [sortField, setSortField]         = useState<SortField>("purchase_date");
  const [sortDir, setSortDir]             = useState<SortDir>("desc");
  const activeBatch = useBatchStore(s => s.activeBatch);

  const { data, isLoading, isError, refetch } = useQuery<ReceiptListResponse>({
    queryKey: ["receipts-list"],
    queryFn:  () => api.get<ReceiptListResponse>("/api/v1/receipts"),
    staleTime: 30_000,
  });

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  }

  const allMonths     = data?.months.map(m => m.month) ?? [];
  const visibleMonths = data
    ? selectedMonth === "all" ? data.months : data.months.filter(m => m.month === selectedMonth)
    : [];

  return (
    <>
      {/* ── Page header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: "clamp(1.25rem,2.5vw,1.5rem)", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
            Мои чеки
          </h1>
          {data && (
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: 2 }}>
              {data.total_count} чек{data.total_count === 1 ? "" : "а"} за всё время
            </p>
          )}
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowUpload(v => !v)}
        >
          <span style={{ fontSize: 15 }}>+</span>
          {showUpload ? "Скрыть" : "Загрузить чеки"}
        </button>
      </div>

      {/* ── Upload zone ── */}
      {showUpload && (
        <div className="card" style={{ padding: "20px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
              Загрузка чеков
            </span>
            <button
              onClick={() => setShowUpload(false)}
              style={{ fontSize: 18, color: "var(--text-muted)", lineHeight: 1, background: "none", border: "none", cursor: "pointer", padding: "0 4px" }}
            >
              ×
            </button>
          </div>
          <UploadZone onUploaded={() => { setShowUpload(false); void refetch(); }} />
        </div>
      )}

      {/* ── Batch progress ── */}
      {activeBatch && (
        <div style={{ marginBottom: 20 }}>
          <BatchProgress />
        </div>
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

      {/* ── Content ── */}
      {data && data.total_count === 0 && (
        <EmptyState onUpload={() => setShowUpload(true)} />
      )}

      {data && data.total_count > 0 && (
        <>
          {/* Summary strip */}
          <SummaryStrip data={data} filter={selectedMonth} />

          {/* Month filter pills */}
          <div style={{ marginBottom: 16 }}>
            <MonthFilterPills months={allMonths} value={selectedMonth} onChange={setSelectedMonth} />
          </div>

          {/* Accordion month groups */}
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
                />
              ))
            )}
          </div>
        </>
      )}
    </>
  );
}
