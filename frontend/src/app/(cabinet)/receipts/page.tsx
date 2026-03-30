"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { uploadWithProgress } from "@/components/ui/UploadZone";
import { useBatchStore } from "@/lib/store";
import type {
  ReceiptListResponse, ReceiptListItem, MonthGroup, OCRStatus, BatchJob,
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
}: {
  group: MonthGroup;
  sortField: SortField; sortDir: SortDir;
  onSort: (f: SortField) => void;
  defaultOpen: boolean;
  onDelete: (id: string) => Promise<void>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [animatingId, setAnimatingId] = useState<string | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const sorted   = sortReceipts(group.receipts.filter(r => !deletedIds.has(r.id)), sortField, sortDir);
  const rxCount  = group.receipts.filter(r => r.needs_prescription).length;
  const doneCount  = group.receipts.filter(r => r.ocr_status === "DONE").length;
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
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <SortTh field="purchase_date" active={sortField} dir={sortDir} onSort={onSort}>Дата</SortTh>
                <SortTh field="pharmacy_name" active={sortField} dir={sortDir} onSort={onSort}>Аптека</SortTh>
                <SortTh field="total_amount"  active={sortField} dir={sortDir} onSort={onSort} align="right">Сумма</SortTh>
                <th style={{ padding: "10px 16px", fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "center", background: "var(--bg)" }}>Статус</th>
                <th style={{ padding: "10px 16px", fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "center", background: "var(--bg)", width: 40 }}>Rx</th>
                <th style={{ padding: "10px 8px", background: "var(--bg)", width: 44 }} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr
                  key={r.id}
                  className={animatingId === r.id ? "row-deleting" : ""}
                  onAnimationEnd={() => {
                    if (animatingId === r.id) {
                      setDeletedIds(prev => new Set([...prev, r.id]));
                      setAnimatingId(null);
                      void onDelete(r.id);
                    }
                  }}
                  onClick={() => (confirmId === r.id || animatingId === r.id) ? undefined : router.push(`/receipts/${r.id}`)}
                  style={{
                    borderTop: "1px solid var(--border-light)",
                    cursor: (confirmId === r.id || animatingId === r.id) ? "default" : "pointer",
                    transition: animatingId === r.id ? "none" : "background 0.12s",
                    background: i % 2 === 0 ? "var(--surface)" : "var(--surface-subtle)",
                  }}
                  onMouseEnter={e => {
                    if (confirmId !== r.id && animatingId !== r.id) e.currentTarget.style.background = "rgba(123,111,212,0.04)";
                    const btn = e.currentTarget.querySelector<HTMLButtonElement>(".delete-btn");
                    if (btn) { btn.style.opacity = "1"; btn.style.transform = "scale(1)"; }
                  }}
                  onMouseLeave={e => {
                    if (animatingId !== r.id) e.currentTarget.style.background = i % 2 === 0 ? "var(--surface)" : "var(--surface-subtle)";
                    const btn = e.currentTarget.querySelector<HTMLButtonElement>(".delete-btn");
                    if (btn && confirmId !== r.id) { btn.style.opacity = "0.25"; btn.style.transform = "scale(0.9)"; }
                  }}
                >
                  <td style={{ padding: "12px 16px", fontSize: "13px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{formatDate(r.purchase_date)}</td>
                  <td style={{ padding: "12px 16px", fontSize: "13px", color: "var(--text-primary)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.pharmacy_name ?? <span style={{ color: "var(--text-muted)" }}>—</span>}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", textAlign: "right", letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{formatRub(r.total_amount)}</td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}><StatusBadge status={r.ocr_status} confidence={r.ocr_confidence} /></td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    {r.needs_prescription && <span title="Требуется рецепт" style={{ fontSize: "14px" }}>💊</span>}
                  </td>
                  <td style={{ padding: "12px 8px", textAlign: "center", width: 52 }} onClick={e => e.stopPropagation()}>
                    {confirmId === r.id ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "center" }}>
                        <button
                          onClick={() => { setConfirmId(null); setAnimatingId(r.id); }}
                          style={{ padding: "4px 10px", fontSize: "12px", fontWeight: 700, background: "#EF4444", color: "#fff", border: "none", borderRadius: "var(--r-sm)", cursor: "pointer", whiteSpace: "nowrap" }}
                        >Удалить</button>
                        <button
                          onClick={() => setConfirmId(null)}
                          style={{ padding: "4px 8px", fontSize: "12px", background: "var(--bg)", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", cursor: "pointer" }}
                        >Отмена</button>
                      </div>
                    ) : (
                      <button
                        className="delete-btn"
                        title="Удалить чек"
                        onClick={() => setConfirmId(r.id)}
                        style={{ opacity: 0.25, transform: "scale(0.9)", transition: "opacity 0.15s, transform 0.15s, color 0.15s, background 0.15s", background: "none", border: "none", cursor: "pointer", padding: "5px", borderRadius: "var(--r-sm)", color: "#EF4444", lineHeight: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.10)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
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
// Processing Pipeline
// ---------------------------------------------------------------------------

type UploadState = "idle" | "uploading" | "done" | "error";
type StepKind   = "pending" | "idle" | "active" | "done" | "alert";

/* ── Step icon circle ── */
function StepCircle({
  kind, children, progress, spinning,
}: {
  kind: StepKind;
  children: React.ReactNode;
  progress?: number;   // 0–100, shows arc progress ring
  spinning?: boolean;  // shows rotating outer ring
}) {
  const D = 64; // diameter
  const r = D / 2 + 5; // arc radius
  const circ = 2 * Math.PI * r;

  const cfg: Record<StepKind, { bg: string; border: string; color: string; anim?: string }> = {
    pending: { bg: "var(--bg)",          border: "var(--border)",      color: "var(--text-muted)" },
    idle:    { bg: "var(--accent-light)", border: "var(--accent-mid)",  color: "var(--accent)",    anim: "ppIdlePulse 2.6s ease-in-out infinite" },
    active:  { bg: "var(--accent)",       border: "var(--accent-dark)", color: "#fff",             anim: "ppActivePulse 1.5s ease-in-out infinite" },
    done:    { bg: "#22C55E",             border: "#16A34A",            color: "#fff" },
    alert:   { bg: "#F59E0B",             border: "#D97706",            color: "#fff",             anim: "ppAlertPulse 1.8s ease-in-out infinite" },
  };
  const c = cfg[kind];

  return (
    <div style={{ position: "relative", width: D, height: D, flexShrink: 0 }}>
      {/* Progress arc (upload) */}
      {progress !== undefined && (
        <svg
          width={D + 14} height={D + 14}
          style={{ position: "absolute", top: -7, left: -7, transform: "rotate(-90deg)", pointerEvents: "none", zIndex: 2 }}
        >
          <circle cx={(D + 14) / 2} cy={(D + 14) / 2} r={r}
            fill="none" stroke="rgba(123,111,212,0.18)" strokeWidth="3"
          />
          <circle cx={(D + 14) / 2} cy={(D + 14) / 2} r={r}
            fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round"
            strokeDasharray={`${(progress / 100) * circ} ${circ}`}
            style={{ transition: "stroke-dasharray 0.25s ease" }}
          />
        </svg>
      )}

      {/* Spinning ring */}
      {spinning && (
        <div style={{
          position: "absolute", inset: -4, borderRadius: "50%",
          border: "3px solid transparent",
          borderTopColor: "var(--accent)",
          animation: "ppSpin 0.85s linear infinite",
          zIndex: 2,
        }} />
      )}

      {/* Main circle */}
      <div style={{
        width: D, height: D, borderRadius: "50%",
        background: c.bg,
        border: `2px solid ${c.border}`,
        color: c.color,
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: c.anim,
        transition: "background 0.35s, border-color 0.35s, color 0.35s",
        overflow: "hidden",
        position: "relative",
        zIndex: 1,
      }}>
        {/* Scan beam overlay (step 2 active) */}
        {kind === "active" && !spinning && (
          <div style={{
            position: "absolute", left: 0, right: 0, height: 2,
            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.9) 40%, rgba(255,255,255,0.9) 60%, transparent 100%)",
            animation: "ppScanBeam 1.6s ease-in-out infinite",
            pointerEvents: "none", zIndex: 3,
          }} />
        )}

        {/* Icon or checkmark */}
        {kind === "done" ? (
          <span style={{ animation: "ppCheckPop 0.45s var(--ease-spring) both", display: "flex" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/* ── Single step node ── */
function PipelineStep({
  kind, label, sublabel, icon, onClick, progress, spinning,
}: {
  kind: StepKind;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  onClick?: () => void;
  progress?: number;
  spinning?: boolean;
}) {
  const labelColor =
    kind === "done"    ? "#16A34A" :
    kind === "alert"   ? "#92400E" :
    kind === "active"  ? "var(--accent)" :
    kind === "idle"    ? "var(--text-primary)" :
    "var(--text-muted)";

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: 10, flex: 1, minWidth: 0,
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      <StepCircle kind={kind} progress={progress} spinning={spinning}>
        {icon}
      </StepCircle>

      <div style={{ textAlign: "center", width: "100%" }}>
        <div style={{
          fontSize: "12px", fontWeight: 700, letterSpacing: "-0.01em",
          color: labelColor,
          transition: "color 0.3s",
        }}>
          {label}
        </div>
        <div style={{
          fontSize: "11px", color: "var(--text-muted)", marginTop: 2,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          maxWidth: 120,
        }}>
          {sublabel}
        </div>
      </div>
    </div>
  );
}

/* ── Arrow connector ── */
function StepConnector({ filled }: { filled: boolean }) {
  return (
    <div style={{
      flexShrink: 0, width: 52,
      display: "flex", alignItems: "flex-start",
      paddingTop: 30,
    }}>
      <div style={{ position: "relative", width: "100%", height: 2 }}>
        {/* Track */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: 1,
          background: "var(--border-strong)",
        }} />
        {/* Fill */}
        {filled && (
          <div style={{
            position: "absolute", inset: 0, borderRadius: 1,
            background: "#22C55E",
            animation: "ppLineFill 0.55s var(--ease-spring) both",
            transformOrigin: "left",
          }} />
        )}
        {/* Arrow tip */}
        <div style={{
          position: "absolute", right: -1, top: "50%",
          width: 6, height: 6,
          borderTop: `2px solid ${filled ? "#22C55E" : "var(--border-strong)"}`,
          borderRight: `2px solid ${filled ? "#22C55E" : "var(--border-strong)"}`,
          transform: "translateY(-50%) rotate(45deg)",
          transition: "border-color 0.5s",
        }} />
      </div>
    </div>
  );
}

/* ── SVG icons ── */
function IconUpload() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M12 12v9" />
      <path d="m16 16-4-4-4 4" />
    </svg>
  );
}

function IconScan() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  );
}

function IconReview() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

/* ── Dot loader (3 pulsing dots) ── */
function DotLoader() {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", justifyContent: "center", height: 14 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 5, height: 5, borderRadius: "50%",
          background: "rgba(255,255,255,0.85)",
          animation: `ppDotBlink 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
    </div>
  );
}

/* ── Main ProcessingPipeline component ── */
function ProcessingPipeline({
  onRefetch,
}: {
  onRefetch: () => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);

  const {
    activeBatch, totalFiles, doneCount, reviewCount, failedCount, completed,
    startBatch, clearBatch,
  } = useBatchStore();

  // ── Derived states ────────────────────────────────────────────────────────
  // Батч завершён (с ревью или без) → шаг 1 всегда возвращается к облаку
  const batchCompleted = !!activeBatch && completed;

  const step1Kind: StepKind =
    batchCompleted              ? "idle" :
    uploadState === "uploading"  ? "active" :
    uploadState === "error"      ? "idle" :
    uploadState === "done" || !!activeBatch ? "done" :
    "idle";

  const step2Kind: StepKind =
    !!activeBatch && !completed ? "active" :
    !!activeBatch &&  completed ? "done" :
    "pending";

  const step3Kind: StepKind =
    !!activeBatch && completed && reviewCount > 0  ? "alert" :
    !!activeBatch && completed && reviewCount === 0 ? "done" :
    "pending";

  // ── Subtitle texts ────────────────────────────────────────────────────────
  const step1Sub =
    batchCompleted              ? "Нажмите для загрузки" :
    uploadState === "uploading"  ? `${uploadProgress}%` :
    uploadState === "error"      ? "Ошибка — повторите" :
    uploadState === "done" || !!activeBatch ? "Файлы переданы" :
    "Нажмите для загрузки";

  const processed = doneCount + reviewCount + failedCount;
  const step2Sub =
    !!activeBatch && !completed ? `${processed} / ${totalFiles}` :
    !!activeBatch &&  completed ? `${totalFiles} ${plural(totalFiles, "файл", "файла", "файлов")}` :
    "Ожидает загрузки";

  const step3Sub =
    step3Kind === "alert" ? `${reviewCount} ${plural(reviewCount, "документ", "документа", "документов")} →` :
    step3Kind === "done"  ? "Всё проверено" :
    "Ожидает обработки";

  // ── Handlers ─────────────────────────────────────────────────────────────
  function triggerUpload() {
    if (uploadState === "uploading") return;
    if (completed) {
      clearBatch();
      setUploadState("idle");
      setUploadProgress(0);
    }
    // micro-task to allow state flush before click
    setTimeout(() => fileInputRef.current?.click(), 0);
  }

  async function handleFiles(files: FileList) {
    if (!files.length) return;
    const fd = new FormData();
    Array.from(files).forEach(f => fd.append("files", f));

    setUploadState("uploading");
    setUploadProgress(0);

    try {
      const job: BatchJob = await uploadWithProgress("/api/v1/batch", fd, setUploadProgress);
      startBatch(job.batch_id, job.total_files);
      setUploadState("done");
      onRefetch();
    } catch {
      setUploadState("error");
      setTimeout(() => setUploadState("idle"), 4000);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="card"
      style={{ padding: "22px 28px", marginBottom: 20 }}
    >
      <div style={{ display: "flex", alignItems: "flex-start" }}>

        {/* ── Step 1: Upload ── */}
        <PipelineStep
          kind={step1Kind}
          label="Загрузить"
          sublabel={step1Sub}
          icon={step2Kind === "active" ? <DotLoader /> : <IconUpload />}
          onClick={triggerUpload}
          progress={uploadState === "uploading" ? uploadProgress : undefined}
          spinning={uploadState === "uploading"}
        />

        <StepConnector filled={step1Kind === "done"} />

        {/* ── Step 2: OCR ── */}
        <PipelineStep
          kind={step2Kind}
          label="Распознавание"
          sublabel={step2Sub}
          icon={<IconScan />}
        />

        <StepConnector filled={step2Kind === "done"} />

        {/* ── Step 3: Operator review ── */}
        <PipelineStep
          kind={step3Kind}
          label="Проверка"
          sublabel={step3Sub}
          icon={<IconReview />}
          onClick={step3Kind === "alert" ? () => router.push("/review") : undefined}
        />
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp,.pdf"
        style={{ display: "none" }}
        onChange={e => { if (e.target.files?.length) void handleFiles(e.target.files); }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReceiptsPage() {
  const router = useRouter();
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [sortField, setSortField]         = useState<SortField>("purchase_date");
  const [sortDir, setSortDir]             = useState<SortDir>("desc");

  // pipeline ref so EmptyState can trigger upload
  const pipelineUploadRef = useRef<(() => void) | null>(null);

  const { activeBatch, completed, reviewCount } = useBatchStore(s => ({
    activeBatch: s.activeBatch,
    completed:   s.completed,
    reviewCount: s.reviewCount,
  }));

  const { data, isLoading, isError, refetch } = useQuery<ReceiptListResponse>({
    queryKey: ["receipts-list"],
    queryFn:  () => api.get<ReceiptListResponse>("/api/v1/receipts"),
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
      {/* ── Processing Pipeline (replaces old header + upload button) ── */}
      <ProcessingPipeline
        onRefetch={() => void refetch()}
      />

      {/* ── Duplicate alert banner ── */}
      {activeBatch && completed && reviewCount > 0 && (
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
              {reviewCount} {plural(reviewCount, "документ требует", "документа требуют", "документов требуют")} проверки — среди них могут быть дубликаты уже загруженных файлов.{" "}
              <a
                href="/review"
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
          <SummaryStrip data={doneData} filter={selectedMonth} />
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
