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
const NDFL_RATE       = 0.13;

function fmt(v: string | number | null | undefined): string {
  if (v === undefined || v === null) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "—";
  return n.toLocaleString("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function fmtDateFull(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function fmtMonth(yyyymm: string): string {
  return new Date(yyyymm + "-01").toLocaleDateString("ru-RU", { month: "short" });
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

function HeroCard({ summary, totalCount }: { summary: Summary; totalCount: number }) {
  const year    = new Date().getFullYear();
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
            fontSize: "28px", boxShadow: "var(--shadow-accent)",
          }}>💊</div>
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
            <FieldInfo icon="📅" label="Налоговый период" value={`${year} год`} />
            <FieldInfo icon="💰" label="Расходы на лекарства" value={fmt(summary.total_amount)} />
            <FieldInfo icon="🧾" label="Чеков загружено" value={`${totalCount} шт.`} />
            <FieldInfo icon="📋" label="Тип" value="Физ. лицо" />
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
          <a href="/export" className="btn btn-secondary btn-sm">
            📥 Скачать документы
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

function FieldInfo({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <span style={{ fontSize: "13px" }}>{icon}</span>
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
// Section 2 — Status Kanban Row
// ---------------------------------------------------------------------------

interface KanbanCard {
  label:   string;
  count:   number;
  amount:  number;
  badge:   string;
  badgeClass: string;
  bg:      string;
  icon:    string;
}

function StatusKanban({ receipts }: { receipts: ReceiptListItem[] }) {
  function sum(arr: ReceiptListItem[]) {
    return arr.reduce((s, r) => s + parseFloat(r.total_amount || "0"), 0);
  }

  const done       = receipts.filter((r) => r.ocr_status === "DONE");
  const review     = receipts.filter((r) => r.ocr_status === "REVIEW");
  const failed     = receipts.filter((r) => r.ocr_status === "FAILED");
  const processing = receipts.filter((r) => !["DONE","REVIEW","FAILED"].includes(r.ocr_status));

  const cards: KanbanCard[] = [
    {
      label: "Распознано",
      count: done.length,
      amount: sum(done),
      badge: "Готово",
      badgeClass: "badge-done",
      bg: "var(--tint-green)",
      icon: "✓",
    },
    {
      label: "На проверке",
      count: review.length,
      amount: sum(review),
      badge: "Ожидание",
      badgeClass: "badge-review",
      bg: "var(--tint-purple)",
      icon: "⚠",
    },
    {
      label: "Ошибка OCR",
      count: failed.length,
      amount: sum(failed),
      badge: "Требует внимания",
      badgeClass: "badge-failed",
      bg: "var(--tint-pink)",
      icon: "✗",
    },
    {
      label: "Обработка",
      count: processing.length,
      amount: sum(processing),
      badge: "В работе",
      badgeClass: "badge-pending",
      bg: "var(--tint-blue)",
      icon: "↑",
    },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px" }}>
      {cards.map((c, i) => (
        <div
          key={c.label}
          className={`card reveal reveal-${i + 1}`}
          style={{ padding: "18px 20px", cursor: "default" }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "14px" }}>
            {/* Icon bubble */}
            <div style={{
              width: "38px", height: "38px", borderRadius: "10px",
              background: c.bg,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "16px", fontWeight: 800, color: "var(--text-primary)",
            }}>
              {c.icon}
            </div>
            <span className={`badge ${c.badgeClass}`} style={{ fontSize: "10px" }}>{c.badge}</span>
          </div>

          <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", letterSpacing: ".04em", textTransform: "uppercase", marginBottom: "4px" }}>
            {c.label}
          </div>

          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-.06em", lineHeight: 1, marginBottom: "6px" }}>
            {c.count}
          </div>

          <div style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>
            {fmt(c.amount)}
          </div>

          <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--border-light)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                {receipts.length > 0 ? `${Math.round((c.count / receipts.length) * 100)}% от всех` : "0%"}
              </span>
              <a
                href="/receipts"
                style={{
                  fontSize: "11px", fontWeight: 700, color: "var(--accent)",
                  textDecoration: "none",
                }}
              >
                Смотреть →
              </a>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 3a — Receipts as appointment-style list
// ---------------------------------------------------------------------------

function ReceiptsSchedule({ receipts }: { receipts: ReceiptListItem[] }) {
  const router = useRouter();

  function statusDot(status: string) {
    if (status === "DONE")    return "var(--green)";
    if (status === "REVIEW")  return "var(--yellow)";
    if (status === "FAILED")  return "var(--red)";
    return "var(--accent)";
  }

  function badgeEl(r: ReceiptListItem) {
    const pct = r.ocr_confidence !== null && r.ocr_confidence !== undefined
      ? Math.round(r.ocr_confidence * 100)
      : null;
    if (r.ocr_status === "DONE")
      return <span className="badge badge-done">{pct !== null ? `✓ ${pct}%` : "Готов"}</span>;
    if (r.ocr_status === "REVIEW")
      return <span className="badge badge-review">Проверка</span>;
    if (r.ocr_status === "FAILED")
      return <span className="badge badge-failed">Ошибка</span>;
    return <span className="badge badge-pending">Обработка</span>;
  }

  return (
    <div className="card reveal reveal-3" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div className="card-header">
        <div>
          <div className="card-title">Последние чеки</div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "1px" }}>
            {receipts.length} записей
          </div>
        </div>
        <a href="/receipts" className="card-action">Все чеки →</a>
      </div>

      {receipts.length === 0 ? (
        <div style={{
          padding: "40px 20px", textAlign: "center",
          color: "var(--text-muted)", fontSize: "13px",
        }}>
          Загрузите первый чек из аптеки
        </div>
      ) : (
        <div style={{ padding: "8px 0" }}>
          {receipts.map((r, i) => (
            <div
              key={r.id}
              onClick={() => router.push(`/receipts/${r.id}`)}
              style={{
                display: "flex", alignItems: "center", gap: "12px",
                padding: "10px 20px", cursor: "pointer",
                transition: "background var(--t-fast)",
                borderBottom: i < receipts.length - 1 ? "1px solid var(--border-light)" : "none",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(123,111,212,.04)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {/* Date column */}
              <div style={{
                flexShrink: 0, width: "48px", textAlign: "center",
                padding: "6px", borderRadius: "10px",
                background: "var(--bg)",
              }}>
                <div style={{ fontSize: "16px", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1 }}>
                  {r.purchase_date ? new Date(r.purchase_date).getDate() : "—"}
                </div>
                <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  {r.purchase_date
                    ? new Date(r.purchase_date).toLocaleDateString("ru-RU", { month: "short" })
                    : ""}
                </div>
              </div>

              {/* Status line */}
              <div style={{
                width: "3px", height: "36px", borderRadius: "2px", flexShrink: 0,
                background: statusDot(r.ocr_status),
              }} />

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: "13px", fontWeight: 700, color: "var(--text-primary)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {r.pharmacy_name ?? "Аптека"}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "1px" }}>
                  {fmtDateFull(r.purchase_date)}
                </div>
              </div>

              {/* Amount */}
              <div style={{ flexShrink: 0, textAlign: "right" }}>
                <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--text-primary)" }}>
                  {fmt(r.total_amount)}
                </div>
                <div style={{ marginTop: "3px" }}>{badgeEl(r)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 3b — Follow-up / Side Panel
// ---------------------------------------------------------------------------

function SidePanel({ summary, months }: { summary: Summary; months: MonthSummary[] }) {
  const limit  = Math.min(summary.limit_used_pct ?? 0, 100);
  const values = months.map((m) => parseFloat(m.total_amount || "0"));
  const max    = Math.max(...values, 1);
  const current = new Date().toISOString().slice(0, 7);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

      {/* Quick actions */}
      <div className="card reveal reveal-2" style={{ padding: "18px 20px" }}>
        <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "12px", letterSpacing: "-.01em" }}>
          Быстрые действия
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[
            { icon: "📸", label: "Загрузить чек",       href: "/receipts", primary: true },
            { icon: "📋", label: "Просмотреть рецепты",  href: "/prescriptions" },
            { icon: "👁", label: "На проверке",           href: "/review" },
            { icon: "📥", label: "Скачать документы",     href: "/export" },
          ].map((a) => (
            <a
              key={a.href}
              href={a.href}
              style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "9px 12px", borderRadius: "var(--r-sm)",
                background: a.primary ? "var(--accent)" : "var(--bg)",
                color: a.primary ? "#fff" : "var(--text-primary)",
                fontSize: "12px", fontWeight: 600, textDecoration: "none",
                border: a.primary ? "none" : "1px solid var(--border)",
                transition: "opacity .15s, transform .15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = ".85"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "1";   e.currentTarget.style.transform = "none"; }}
            >
              <span style={{ fontSize: "15px" }}>{a.icon}</span>
              {a.label}
            </a>
          ))}
        </div>
      </div>

      {/* Limit progress */}
      <div className="card reveal reveal-3" style={{ padding: "18px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>
            Лимит вычета
          </span>
          <span style={{
            fontSize: "13px", fontWeight: 800,
            color: limit >= 90 ? "var(--red)" : limit >= 60 ? "var(--yellow)" : "var(--green)",
          }}>
            {limit.toFixed(1)}%
          </span>
        </div>
        <div className="progress-wrap">
          <div
            className="progress-fill"
            style={{
              width: `${limit}%`,
              background: limit >= 90
                ? "linear-gradient(90deg, var(--red), #ff8a8a)"
                : limit >= 60
                ? "linear-gradient(90deg, var(--yellow), #fcd34d)"
                : undefined,
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
          <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{fmt(summary.total_amount)}</span>
          <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>лимит 150 000 ₽</span>
        </div>
      </div>

      {/* Mini bar chart */}
      {months.length > 0 && (
        <div className="card reveal reveal-4" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "14px" }}>
            Расходы по месяцам
          </div>
          <div className="chart-bars">
            {months.slice(-8).map((m) => {
              const val = parseFloat(m.total_amount || "0");
              const h   = Math.round((val / max) * 100);
              return (
                <div key={m.month} className="chart-bar-col">
                  <div
                    className={`chart-bar ${m.month === current ? "active" : ""}`}
                    style={{ height: `${Math.max(h, 4)}%` }}
                    title={`${fmtMonth(m.month)}: ${fmt(m.total_amount)}`}
                  />
                  <span className="chart-bar-label">{fmtMonth(m.month)}</span>
                </div>
              );
            })}
          </div>
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

function DashboardContent({ summary }: { summary: Summary }) {
  const { data: receiptData } = useQuery<ReceiptListResponse>({
    queryKey: ["receipts-list"],
    queryFn:  () => api.get<ReceiptListResponse>("/api/v1/receipts"),
    staleTime: 60_000,
  });

  const allReceipts: ReceiptListItem[] = (receiptData?.months ?? []).flatMap((m) => m.receipts);
  const recentReceipts = allReceipts.slice(0, 8);
  const totalCount     = summary.months.reduce((s, m) => s + m.receipts_count, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Hero */}
      <HeroCard summary={summary} totalCount={totalCount} />

      {/* Status Kanban */}
      <StatusKanban receipts={allReceipts} />

      {/* Receipts schedule + side panel */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "16px", alignItems: "start" }}>
        <ReceiptsSchedule receipts={recentReceipts} />
        <SidePanel summary={summary} months={summary.months} />
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
        <div className="card" style={{
          padding: "40px", textAlign: "center",
          color: "var(--red-text)", background: "var(--red-bg)", borderColor: "var(--red)",
        }}>
          Не удалось загрузить данные. Проверьте соединение.
        </div>
      )}

      {summary && <DashboardContent summary={summary} />}
    </>
  );
}
