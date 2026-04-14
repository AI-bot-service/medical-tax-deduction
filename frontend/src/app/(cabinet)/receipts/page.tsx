"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { DuplicateReviewModal } from "@/components/ui/DuplicateReviewModal";
import { ProcessingPipeline } from "@/components/ui/ProcessingPipeline";
import ReceiptTable from "@/components/ui/ReceiptTable";
import type { SortField, SortDir } from "@/components/ui/ReceiptTable";
import { useBatchStore, useDashboardStore } from "@/lib/store";
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

function formatMonthLabel(ym: string): string {
  return new Date(ym + "-01").toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
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

function sortReceipts(receipts: ReceiptListItem[], field: SortField, dir: SortDir): ReceiptListItem[] {
  return [...receipts].sort((a, b) => {
    let cmp = 0;
    if (field === "purchase_date")     cmp = (a.purchase_date ?? "").localeCompare(b.purchase_date ?? "");
    else if (field === "total_amount") cmp = parseFloat(a.total_amount ?? "0") - parseFloat(b.total_amount ?? "0");
    else                               cmp = (a.pharmacy_name ?? "").localeCompare(b.pharmacy_name ?? "");
    return dir === "asc" ? cmp : -cmp;
  });
}

// ---------------------------------------------------------------------------
// MonthAccordion
// ---------------------------------------------------------------------------

function MonthAccordion({
  group, sortField, sortDir, onSort, defaultOpen, onDelete,
}: {
  group: MonthGroup;
  sortField: SortField; sortDir: SortDir;
  onSort: (f: SortField) => void;
  defaultOpen: boolean;
  onDelete: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const sorted      = sortReceipts(group.receipts, sortField, sortDir);
  const rxCount     = group.receipts.filter(r => r.needs_prescription).length;
  const doneCount   = group.receipts.filter(r => r.ocr_status === "DONE").length;
  const reviewCount = group.receipts.filter(r => r.ocr_status === "REVIEW").length;

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
          {doneCount > 0 && (
            <span className="badge badge-done" style={{ fontSize: "10px" }}>
              <span className="badge-dot" style={{ background: "#22C55E" }} />{doneCount}
            </span>
          )}
          {reviewCount > 0 && (
            <span className="badge badge-review" style={{ fontSize: "10px" }}>
              <span className="badge-dot" style={{ background: "#F59E0B" }} />{reviewCount}
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
        <span style={{
          fontSize: "15px", fontWeight: 800,
          color: "var(--text-primary)", letterSpacing: "-0.03em",
          marginLeft: 8, flexShrink: 0,
        }}>
          {formatRub(group.total_amount)}
        </span>
      </button>

      {open && (
        <ReceiptTable
          receipts={sorted}
          sortField={sortField}
          sortDir={sortDir}
          onSort={onSort}
          onDelete={onDelete}
        />
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
        { label: "Чеков", value: String(count), color: "var(--text-primary)" },
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
      <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>Чеки ещё не загружены</div>
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
  const queryClient = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [sortField, setSortField]         = useState<SortField>("purchase_date");
  const [sortDir, setSortDir]             = useState<SortDir>("desc");
const selectedYear = useDashboardStore(s => s.selectedYear);
  const activeBatch  = useBatchStore(s => s.activeBatch);
  const completed    = useBatchStore(s => s.completed);
  const reviewCount  = useBatchStore(s => s.reviewCount);
  const clearBatch   = useBatchStore(s => s.clearBatch);

  // Очередь ID чеков со статусом DUPLICATE_REVIEW для показа модалки
  const [duplicateQueue, setDuplicateQueue] = useState<string[]>([]);

  // После завершения батча ищем чеки с DUPLICATE_REVIEW в этом батче.
  // Если дублей нет — сбрасываем пайплайн, чтобы он не висел вечно.
  useEffect(() => {
    if (!activeBatch || !completed) return;
    api.get<ReceiptListResponse>(`/api/v1/receipts?batch_id=${activeBatch}`)
      .then(resp => {
        const dupeIds = resp.months
          .flatMap(m => m.receipts)
          .filter(r => r.ocr_status === "DUPLICATE_REVIEW")
          .map(r => r.id);
        if (dupeIds.length > 0) {
          setDuplicateQueue(dupeIds);
        } else {
          // Нет DUPLICATE_REVIEW — пайплайн сбрасываем, чек в REVIEW доступен через сайдбар
          setTimeout(() => clearBatch(), 3000);
        }
      })
      .catch(() => { /* ignore */ });
  }, [activeBatch, completed]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDuplicateDone(_receipt?: unknown) {
    setDuplicateQueue(prev => prev.slice(1));
    void queryClient.invalidateQueries({ queryKey: ["receipts-list"] });
    void queryClient.invalidateQueries({ queryKey: ["summary"] });
  }

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
    void refetch();
  }

  const doneData: ReceiptListResponse | undefined = data
    ? {
        total_count: data.months.reduce((s, m) => s + m.receipts.filter(r => r.ocr_status === "DONE").length, 0),
        months: data.months
          .map(m => ({ ...m, receipts: m.receipts.filter(r => r.ocr_status === "DONE") }))
          .filter(m => m.receipts.length > 0),
      }
    : undefined;

  const allMonths     = doneData?.months.map(m => m.month) ?? [];
  const visibleMonths = doneData
    ? selectedMonth === "all" ? doneData.months : doneData.months.filter(m => m.month === selectedMonth)
    : [];

  return (
    <>
      {/* ── Модалка проверки дубликата ── */}
      {duplicateQueue.length > 0 && (
        <DuplicateReviewModal
          receiptId={duplicateQueue[0]}
          onSaved={handleDuplicateDone}
          onCancelled={handleDuplicateDone}
        />
      )}

      {/* ── Summary strip — сразу после панели с годами ── */}
      {doneData && doneData.total_count > 0 && (
        <SummaryStrip data={doneData} filter={selectedMonth} />
      )}

      {/* ── Processing Pipeline ── */}
      <div style={{ marginBottom: 20 }}>
        <ProcessingPipeline
          onRefetch={() => void refetch()}
        />
      </div>

      {/* ── Duplicate alert banner — только если в батче есть реальные DUPLICATE_REVIEW ── */}
      {activeBatch && completed && duplicateQueue.length > 0 && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 12,
          padding: "14px 18px",
          background: "rgba(245,158,11,0.08)",
          border: "1px solid rgba(245,158,11,0.35)",
          borderRadius: "var(--r-md)",
          marginBottom: 20,
        }}>
          <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)", marginBottom: 2 }}>
              Обнаружены возможные дубликаты
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {duplicateQueue.length} {plural(duplicateQueue.length, "документ требует", "документа требуют", "документов требуют")} проверки — среди них могут быть дубликаты уже загруженных файлов.{" "}
              <a
                href="/duplicates"
                style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}
                onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
              >
                Перейти к проверке →
              </a>
            </div>
          </div>
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
      {doneData && doneData.total_count === 0 && (
        <EmptyState onUpload={() => {
          // find the pipeline's trigger via DOM (click the first step circle)
          document.querySelector<HTMLInputElement>("input[type=file][accept]")?.click();
        }} />
      )}

      {doneData && doneData.total_count > 0 && (
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
                />
              ))
            )}
          </div>
        </>
      )}
    </>
  );
}
