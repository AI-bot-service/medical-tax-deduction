"use client";

import { useRouter } from "next/navigation";
import { useSummary } from "@/hooks/useSummary";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Summary, MonthSummary, ReceiptListItem, ReceiptListResponse } from "@/types/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEDUCTION_LIMIT = 150_000;
const NDFL_RATE = 0.13;

function fmt(amount: string | number | null | undefined): string {
  if (amount === undefined || amount === null) return "—";
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(n)) return "—";
  return n.toLocaleString("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU");
}

function fmtMonth(yyyymm: string): string {
  return new Date(yyyymm + "-01").toLocaleDateString("ru-RU", {
    month: "short",
  });
}

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

interface KpiCardProps {
  label: string;
  value: string;
  meta?: string;
  dotColor: string;
  delay: "reveal-1" | "reveal-2" | "reveal-3" | "reveal-4";
}

function KpiCard({ label, value, meta, dotColor, delay }: KpiCardProps) {
  return (
    <div className={`kpi-card reveal ${delay}`}>
      <div className="orb" style={{ background: dotColor }} />
      <div className="kpi-label">
        <span className="kpi-dot" style={{ background: dotColor }} />
        {label}
      </div>
      <div className="kpi-value" style={{ color: "var(--text-primary)" }}>
        {value}
      </div>
      {meta && <div className="kpi-meta">{meta}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deduction gradient card
// ---------------------------------------------------------------------------

function DeductionCard({ amount }: { amount: string }) {
  const n = parseFloat(amount || "0");
  const ndfl = Math.round(n * NDFL_RATE);
  return (
    <div className="deduction-card reveal reveal-1" style={{ position: "relative", zIndex: 0 }}>
      <div style={{ fontSize: "11px", fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", opacity: .75, marginBottom: "10px" }}>
        Возврат НДФЛ 13%
      </div>
      <div style={{ fontSize: "2.125rem", fontWeight: 800, lineHeight: 1, letterSpacing: "-.06em", marginBottom: "6px", position: "relative", zIndex: 1 }}>
        {fmt(ndfl)}
      </div>
      <div style={{ fontSize: "13px", opacity: .8, position: "relative", zIndex: 1 }}>
        Сумма к вычету: <strong>{fmt(amount)}</strong>
      </div>
      <div style={{ marginTop: "18px", position: "relative", zIndex: 1 }}>
        <button className="btn btn-ghost btn-sm">
          Скачать пакет документов →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Limit Progress
// ---------------------------------------------------------------------------

function LimitProgress({ pct, spent }: { pct: number; spent: string }) {
  const capped = Math.min(pct, 100);
  const color =
    capped >= 90 ? "var(--red)" :
    capped >= 60 ? "var(--yellow)" :
    "var(--accent)";

  return (
    <div className="card reveal reveal-2" style={{ padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
          Использовано лимита вычета
        </span>
        <span style={{ fontSize: "13px", fontWeight: 800, color }}>
          {capped.toFixed(1)}%
        </span>
      </div>

      <div className="progress-wrap">
        <div
          className="progress-fill"
          style={{
            width: `${capped}%`,
            background: capped >= 90
              ? `linear-gradient(90deg, var(--red), #ff8a8a)`
              : capped >= 60
              ? `linear-gradient(90deg, var(--yellow), #fcd34d)`
              : undefined,
          }}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px" }}>
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          Потрачено: {spent}
        </span>
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          Лимит: {fmt(DEDUCTION_LIMIT)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini Bar Chart
// ---------------------------------------------------------------------------

function MonthChart({ months }: { months: MonthSummary[] }) {
  if (months.length === 0) return null;

  const values = months.map((m) => parseFloat(m.total_amount || "0"));
  const max = Math.max(...values, 1);
  const currentMonth = new Date().toISOString().slice(0, 7);

  return (
    <div className="card reveal reveal-3" style={{ overflow: "hidden" }}>
      <div className="card-header">
        <span className="card-title">Расходы по месяцам</span>
      </div>
      <div className="card-body">
        <div className="chart-bars">
          {months.slice(-8).map((m) => {
            const val = parseFloat(m.total_amount || "0");
            const h = Math.round((val / max) * 100);
            const isActive = m.month === currentMonth;
            return (
              <div key={m.month} className="chart-bar-col">
                <div
                  className={`chart-bar ${isActive ? "active" : ""}`}
                  style={{ height: `${Math.max(h, 4)}%` }}
                  title={`${fmtMonth(m.month)}: ${fmt(m.total_amount)}`}
                />
                <span className="chart-bar-label">{fmtMonth(m.month)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OCR Badge
// ---------------------------------------------------------------------------

function OcrBadge({ status, confidence }: { status: string; confidence?: number | null }) {
  if (status === "DONE") {
    const pct = confidence !== null && confidence !== undefined ? Math.round(confidence * 100) : null;
    if (pct !== null) {
      if (pct >= 85) return <span className="badge badge-done"><span className="badge-dot" style={{ background: "var(--green)" }} />✓ {pct}%</span>;
      if (pct >= 60) return <span className="badge badge-review"><span className="badge-dot" style={{ background: "var(--yellow)" }} />⚠ {pct}%</span>;
      return <span className="badge badge-failed"><span className="badge-dot" style={{ background: "var(--red)" }} />✗ {pct}%</span>;
    }
    return <span className="badge badge-done"><span className="badge-dot" style={{ background: "var(--green)" }} />Готов</span>;
  }
  if (status === "REVIEW")  return <span className="badge badge-review"><span className="badge-dot" style={{ background: "var(--yellow)" }} />Проверка</span>;
  if (status === "FAILED")  return <span className="badge badge-failed"><span className="badge-dot" style={{ background: "var(--red)" }} />Ошибка</span>;
  return <span className="badge badge-pending"><span className="badge-dot" style={{ background: "var(--purple)" }} />Обработка</span>;
}

// ---------------------------------------------------------------------------
// Recent Receipts
// ---------------------------------------------------------------------------

function RecentReceipts({ receipts }: { receipts: ReceiptListItem[] }) {
  const router = useRouter();

  return (
    <div className="card reveal reveal-4" style={{ overflow: "hidden" }}>
      <div className="card-header">
        <span className="card-title">Последние чеки</span>
        <a href="/receipts" className="card-action">Все чеки →</a>
      </div>

      {receipts.length === 0 ? (
        <div className="card-body" style={{ textAlign: "center", color: "var(--text-muted)", padding: "32px 20px" }}>
          Чеков пока нет — загрузите первый
        </div>
      ) : (
        <div className="table-wrap">
          <table className="ds-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Аптека</th>
                <th style={{ textAlign: "right" }}>Сумма</th>
                <th style={{ textAlign: "center" }}>Статус</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/receipts/${r.id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <td style={{ color: "var(--text-secondary)" }}>{fmtDate(r.purchase_date)}</td>
                  <td style={{ maxWidth: "160px" }}>
                    <span style={{
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontWeight: 500,
                    }}>
                      {r.pharmacy_name ?? "Аптека"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>
                    {fmt(r.total_amount)}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <OcrBadge status={r.ocr_status} confidence={r.ocr_confidence} />
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
// Skeleton
// ---------------------------------------------------------------------------

function Skeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "16px" }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              height: "120px",
              borderRadius: "var(--r-md)",
              background: "var(--border-light)",
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
        ))}
      </div>
      <div style={{ height: "80px", borderRadius: "var(--r-md)", background: "var(--border-light)", animation: "pulse 1.5s ease-in-out infinite" }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard content
// ---------------------------------------------------------------------------

function DashboardContent({ summary }: { summary: Summary }) {
  const { data: receiptData } = useQuery<ReceiptListResponse>({
    queryKey: ["receipts-list"],
    queryFn: () => api.get<ReceiptListResponse>("/api/v1/receipts"),
    staleTime: 60_000,
  });

  const allReceipts: ReceiptListItem[] = (receiptData?.months ?? []).flatMap((m) => m.receipts);
  const recentReceipts = allReceipts.slice(0, 6);

  const totalCount = summary.months.reduce((s, m) => s + m.receipts_count, 0);
  const reviewCount = allReceipts.filter((r) => r.ocr_status === "REVIEW" || r.ocr_status === "FAILED").length;
  const ndflReturn = Math.round(parseFloat(summary.deduction_amount || "0") * NDFL_RATE);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "16px" }}>
        <KpiCard
          label="Расходы на лекарства"
          value={fmt(summary.total_amount)}
          meta={`${totalCount} чек${totalCount === 1 ? "" : "ов"}`}
          dotColor="var(--accent)"
          delay="reveal-1"
        />
        <KpiCard
          label="Возврат НДФЛ"
          value={fmt(ndflReturn)}
          meta="13% от вычета"
          dotColor="var(--green)"
          delay="reveal-2"
        />
        <KpiCard
          label="Чеков загружено"
          value={String(totalCount)}
          meta={`${summary.months.length} мес.`}
          dotColor="var(--blue)"
          delay="reveal-3"
        />
        <KpiCard
          label="Требуют проверки"
          value={String(reviewCount)}
          meta={reviewCount > 0 ? "Нужно внимание" : "Всё в порядке"}
          dotColor={reviewCount > 0 ? "var(--red)" : "var(--green)"}
          delay="reveal-4"
        />
      </div>

      {/* Deduction + Limit row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "16px" }}>
        <DeductionCard amount={summary.deduction_amount} />
        <LimitProgress pct={summary.limit_used_pct} spent={fmt(summary.total_amount)} />
      </div>

      {/* Chart + Table row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "16px" }}>
        <MonthChart months={summary.months} />
        <RecentReceipts receipts={recentReceipts} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const year = new Date().getFullYear();
  const { data: summary, isLoading, isError } = useSummary(year);

  return (
    <>
      {isLoading && <Skeleton />}

      {isError && (
        <div
          className="card"
          style={{
            padding: "40px",
            textAlign: "center",
            color: "var(--red-text)",
            background: "var(--red-bg)",
            borderColor: "var(--red)",
          }}
        >
          Не удалось загрузить данные. Проверьте соединение.
        </div>
      )}

      {summary && <DashboardContent summary={summary} />}
    </>
  );
}
