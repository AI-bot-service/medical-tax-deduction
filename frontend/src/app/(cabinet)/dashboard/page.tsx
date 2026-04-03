"use client";

import { useSummary } from "@/hooks/useSummary";
import type { Summary } from "@/types/api";
import { YearFilter } from "@/components/ui/YearFilter";
import { LimitsPanel } from "@/components/ui/LimitsPanel";
import { DocumentsPanel } from "@/components/ui/DocumentsPanel";
import { useDashboardStore } from "@/lib/store";
import { Pill, Calendar, Banknote, ReceiptText, ClipboardList, Download, type LucideIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEDUCTION_LIMIT = 150_000;
const NDFL_RATE       = 0.13;

function fmt(v: string | number | null | undefined): string {
  if (v === undefined || v === null) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "—";
  return n.toLocaleString("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
}

// ── Year timeline progress ───────────────────────────────────────────────────
function yearProgress(year: number): number {
  const start   = new Date(year, 0, 1).getTime();
  const end     = new Date(year, 11, 31, 23, 59).getTime();
  const now     = Math.min(Date.now(), end);
  return Math.round(((now - start) / (end - start)) * 100);
}

// ---------------------------------------------------------------------------
// Section 1 — Hero Card (HEITKAMP CRM profile card)
// ---------------------------------------------------------------------------

function HeroCard({ summary, totalCount, year }: { summary: Summary; totalCount: number; year: number }) {
  const pct     = yearProgress(year);
  const ndfl    = Math.round(parseFloat(summary.deduction_amount || "0") * NDFL_RATE);
  const limit   = Math.min(summary.limit_used_pct ?? 0, 100);
  const today   = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

  const limitColor =
    limit >= 90 ? "var(--red)"    :
    limit >= 60 ? "var(--yellow)" :
    "var(--green)";

  return (
    <div className="card reveal reveal-1" style={{ padding: "24px 28px", overflow: "hidden", position: "relative" }}>
      {/* Background orb */}
      <div style={{
        position: "absolute", right: "180px", top: "-60px",
        width: "220px", height: "220px", borderRadius: "50%",
        background: "radial-gradient(circle, var(--accent-light), transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{ display: "flex", alignItems: "flex-start", gap: "24px" }}>

        {/* Avatar block */}
        <div style={{ flexShrink: 0 }}>
          <div style={{
            width: "72px", height: "72px", borderRadius: "18px",
            background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-mid) 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "var(--shadow-accent)",
          }}><Pill size={32} color="#fff" strokeWidth={1.75} /></div>
          <div style={{ marginTop: "8px", textAlign: "center" }}>
            <span className="badge badge-done" style={{ fontSize: "10px" }}>Активный</span>
          </div>
        </div>

        {/* Center info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <h2 style={{
              fontSize: "1.2rem", fontWeight: 800,
              color: "var(--text-primary)", letterSpacing: "-.03em", margin: 0,
            }}>
              Налоговый кабинет
            </h2>
            <span style={{
              fontSize: "11px", fontWeight: 600, color: "var(--text-muted)",
              background: "var(--bg)", border: "1px solid var(--border)",
              borderRadius: "6px", padding: "2px 8px",
            }}>
              ст. 219 НК РФ
            </span>
          </div>

          <div style={{ display: "flex", gap: "20px", marginBottom: "16px", flexWrap: "wrap" }}>
            <FieldInfo icon={Calendar} label="Налоговый период" value={`${year} год`} />
            <FieldInfo icon={Banknote} label="Расходы на лекарства" value={fmt(summary.total_amount)} />
            <FieldInfo icon={ReceiptText} label="Чеков загружено" value={`${totalCount} шт.`} />
            <FieldInfo icon={ClipboardList} label="Тип" value="Физ. лицо" />
          </div>

          {/* Year timeline bar */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>
                1 янв {year}
              </span>
              <span style={{
                fontSize: "11px", fontWeight: 700, color: "var(--accent)",
                background: "var(--accent-light)", borderRadius: "6px", padding: "1px 8px",
              }}>
                Сегодня: {today}
              </span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>
                31 дек {year}
              </span>
            </div>
            <div style={{
              height: "6px", background: "var(--bg)", borderRadius: "var(--r-pill)", overflow: "hidden",
            }}>
              <div style={{
                height: "100%", width: `${pct}%`,
                background: "linear-gradient(90deg, var(--accent), var(--accent-mid))",
                borderRadius: "var(--r-pill)",
                transition: "width 1s var(--ease-spring)",
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
              <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Начало периода</span>
              <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{pct}% года пройдено</span>
              <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Конец периода</span>
            </div>
          </div>
        </div>

        {/* Right: CTA + big stats */}
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "12px" }}>
          <a href="/receipts" className="btn btn-primary btn-sm">
            + Загрузить чек
          </a>
          <a href="/export" className="btn btn-secondary btn-sm" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Download size={14} /> Скачать документы
          </a>

          {/* NDFL highlight */}
          <div style={{
            marginTop: "4px",
            background: "linear-gradient(135deg, var(--accent), var(--accent-mid))",
            borderRadius: "var(--r-md)", padding: "12px 16px",
            color: "#fff", textAlign: "right", minWidth: "140px",
          }}>
            <div style={{ fontSize: "10px", fontWeight: 600, opacity: .75, letterSpacing: ".05em", textTransform: "uppercase" }}>
              Возврат НДФЛ 13%
            </div>
            <div style={{ fontSize: "1.4rem", fontWeight: 800, letterSpacing: "-.06em", lineHeight: 1.1 }}>
              {fmt(ndfl)}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom stats row */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
        gap: "1px", background: "var(--border)",
        marginTop: "20px",
        borderRadius: "var(--r-md)", overflow: "hidden",
        border: "1px solid var(--border)",
      }}>
        {[
          { label: "Сумма расходов",     value: fmt(summary.total_amount),       sub: `${totalCount} чеков` },
          { label: "Сумма к вычету",      value: fmt(summary.deduction_amount),   sub: `лимит ${fmt(DEDUCTION_LIMIT)}` },
          { label: "Возврат НДФЛ 13%",   value: fmt(ndfl),                       sub: "к получению" },
          {
            label: "Лимит использован",
            value: `${limit.toFixed(1)}%`,
            sub: `${fmt(summary.total_amount)} из ${fmt(DEDUCTION_LIMIT)}`,
            color: limitColor,
          },
        ].map((s) => (
          <div key={s.label} style={{
            background: "var(--surface-subtle)", padding: "12px 16px",
          }}>
            <div style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", marginBottom: "4px" }}>
              {s.label}
            </div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: s.color ?? "var(--text-primary)", letterSpacing: "-.04em", lineHeight: 1 }}>
              {s.value}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "3px" }}>{s.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FieldInfo({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <Icon size={15} color="var(--accent)" strokeWidth={1.75} />
      <div>
        <div style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" }}>
          {label}
        </div>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{value}</div>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function Skeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {[200, 100, 300].map((h, i) => (
        <div key={i} style={{
          height: `${h}px`, borderRadius: "var(--r-md)",
          background: "var(--border-light)",
          animation: "pulse 1.5s ease-in-out infinite",
        }} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard Content
// ---------------------------------------------------------------------------

function DashboardContent({ summary, year }: { summary: Summary; year: number }) {
  const totalCount = summary.months.reduce((s, m) => s + m.receipts_count, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Hero */}
      <HeroCard summary={summary} totalCount={totalCount} year={year} />

      {/* Panel 2: Year Filter */}
      <YearFilter />

      {/* Panel 3: Limits */}
      <LimitsPanel />

      {/* Panel 4: Documents */}
      <DocumentsPanel />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const year = useDashboardStore((s) => s.selectedYear);
  const { data: summary, isLoading, isError } = useSummary(year);

  return (
    <>
      {isLoading && <Skeleton />}

      {isError && (
        <div className="card" style={{
          padding: "40px", textAlign: "center",
          color: "var(--red-text)", background: "var(--red-bg)", borderColor: "var(--red)",
        }}>
          Не удалось загрузить данные. Проверьте соединение.
        </div>
      )}

      {summary && <DashboardContent summary={summary} year={year} />}
    </>
  );
}
