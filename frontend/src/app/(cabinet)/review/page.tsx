"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckIcon, ArrowRightIcon, AlertCircleIcon,
  ZoomInIcon, XIcon, ImageOffIcon, LoaderCircleIcon, StarIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useReviewStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress, ProgressTrack, ProgressIndicator } from "@/components/ui/progress";
import type { ReceiptListResponse, ReceiptListItem, ReceiptDetail } from "@/types/api";

// ---------------------------------------------------------------------------
// Confidence bar
// ---------------------------------------------------------------------------

function ConfBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "var(--green)" : pct >= 40 ? "var(--yellow)" : "var(--red)";
  const label = pct >= 70 ? "Высокая" : pct >= 40 ? "Средняя" : "Низкая";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          Точность OCR
        </span>
        <span style={{ fontSize: "12px", fontWeight: 700, color }}>{pct}% — {label}</span>
      </div>
      <Progress value={pct}>
        <ProgressTrack className="h-1.5" style={{ background: "var(--bg)" }}>
          <ProgressIndicator style={{ background: color }} />
        </ProgressTrack>
      </Progress>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Receipt items list
// ---------------------------------------------------------------------------

function ItemsTable({ items }: { items: ReceiptDetail["items"] }) {
  if (!items.length) return null;
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="card-header">
        <span className="card-title">Препараты</span>
        <span style={{
          fontSize: "11px", fontWeight: 600, color: "var(--text-muted)",
          background: "var(--bg)", padding: "2px 8px", borderRadius: "var(--r-pill)",
        }}>
          {items.length} поз.
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--bg)" }}>
              {["Название", "МНН", "Кол-во", "Цена", "Сумма", "Rx"].map((h, i) => (
                <th key={h} style={{
                  padding: "10px 14px",
                  fontSize: "10px", fontWeight: 700,
                  color: "var(--text-muted)",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  textAlign: i >= 2 ? "center" : "left",
                  whiteSpace: "nowrap",
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr
                key={it.id}
                style={{
                  borderTop: "1px solid var(--border-light)",
                  background: i % 2 === 0 ? "var(--surface)" : "var(--surface-subtle)",
                }}
              >
                <td style={{ padding: "11px 14px", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {it.drug_name}
                </td>
                <td style={{ padding: "11px 14px", fontSize: "11px", color: "var(--text-muted)" }}>
                  {it.drug_inn ?? "—"}
                </td>
                <td style={{ padding: "11px 14px", textAlign: "center", fontSize: "13px", color: "var(--text-primary)" }}>
                  {it.quantity ?? "—"}
                </td>
                <td style={{ padding: "11px 14px", textAlign: "right", fontSize: "13px", color: "var(--text-secondary)" }}>
                  {it.unit_price ? parseFloat(it.unit_price).toLocaleString("ru-RU", { minimumFractionDigits: 2 }) + " ₽" : "—"}
                </td>
                <td style={{ padding: "11px 14px", textAlign: "right", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                  {parseFloat(it.total_price).toLocaleString("ru-RU", { minimumFractionDigits: 2 })} ₽
                </td>
                <td style={{ padding: "11px 14px", textAlign: "center" }}>
                  {it.is_rx ? (
                    <span style={{
                      fontSize: "10px", fontWeight: 700,
                      padding: "2px 8px", borderRadius: "var(--r-pill)",
                      background: "var(--purple-bg)", color: "var(--purple-text)",
                    }}>
                      Rx
                    </span>
                  ) : (
                    <span style={{ color: "var(--text-disabled)" }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReviewCard
// ---------------------------------------------------------------------------

interface ReviewCardProps {
  item: ReceiptListItem;
  total: number;
  current: number;
  onApprove: () => void;
  onSkip: () => void;
}

function ReviewCard({ item, total, current, onApprove, onSkip }: ReviewCardProps) {
  const [detail, setDetail] = useState<ReceiptDetail | null>(null);
  const [date, setDate] = useState(item.purchase_date ?? "");
  const [pharmacy, setPharmacy] = useState(item.pharmacy_name ?? "");
  const [amount, setAmount] = useState(item.total_amount ?? "");
  const [saving, setSaving] = useState(false);
  const [imgExpanded, setImgExpanded] = useState(false);

  useEffect(() => {
    void api.get<ReceiptDetail>(`/api/v1/receipts/${item.id}`).then((d) => {
      setDetail(d);
      setDate(d.purchase_date ?? "");
      setPharmacy(d.pharmacy_name ?? "");
      setAmount(d.total_amount ?? "");
    });
  }, [item.id]);

  const isLowConf =
    item.ocr_confidence !== null &&
    item.ocr_confidence !== undefined &&
    item.ocr_confidence < 0.7;

  async function handleApprove() {
    setSaving(true);
    try {
      await api.patch(`/api/v1/receipts/${item.id}`, {
        purchase_date: date || null,
        pharmacy_name: pharmacy || null,
        total_amount: amount ? parseFloat(amount) : null,
      });
      onApprove();
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = (highlight: boolean): React.CSSProperties => ({
    width: "100%",
    borderRadius: "var(--r-sm)",
    border: `1px solid ${highlight ? "var(--yellow)" : "var(--border)"}`,
    background: highlight ? "var(--yellow-bg)" : "var(--surface)",
    padding: "9px 12px",
    fontSize: "13px",
    color: "var(--text-primary)",
    outline: "none",
    fontFamily: "Urbanist, sans-serif",
    transition: "border-color 0.15s",
    boxSizing: "border-box",
  });

  return (
    <>
      {/* Lightbox */}
      {imgExpanded && detail?.image_url && (
        <div
          onClick={() => setImgExpanded(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(10,10,20,0.85)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={detail.image_url} alt="Фото чека" style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: "var(--r-md)", boxShadow: "var(--shadow-lg)" }} />
          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setImgExpanded(false); }}
            className="absolute top-4 right-4 text-white border border-white/20 hover:bg-white/20">
            <XIcon />
          </Button>
        </div>
      )}

      {/* ── Header: badge + progress ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: "16px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Badge variant="secondary" className="h-auto px-2.5 py-0.5 text-[11px] font-semibold"
            style={{ background: "var(--yellow-bg)", color: "var(--yellow-text)" }}>
            Требует проверки
          </Badge>
          {isLowConf && item.ocr_confidence != null && (
            <Badge variant="secondary" className="h-auto px-2 text-[11px] font-bold gap-1"
              style={{ background: "var(--yellow-bg)", color: "var(--yellow-text)" }}>
              <AlertCircleIcon className="size-3" />
              OCR {Math.round(item.ocr_confidence * 100)}%
            </Badge>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ display: "flex", gap: "4px" }}>
            {Array.from({ length: Math.min(total, 7) }).map((_, i) => (
              <div key={i} style={{
                height: "6px", borderRadius: "999px",
                width: i === current - 1 ? "18px" : "6px",
                background: i < current ? "var(--accent)" : "var(--border)",
                transition: "all 250ms cubic-bezier(0.16,1,0.3,1)",
              }} />
            ))}
          </div>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", flexShrink: 0 }}>
            {current} / {total}
          </span>
        </div>
      </div>

      {/* ── 2-column grid (как на странице деталей чека) ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 380px) 1fr",
        gap: "20px",
        alignItems: "start",
      }}>

        {/* Левая колонка: фото + confidence + стратегия */}
        <div style={{ position: "sticky", top: 80, display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Изображение */}
          <div
            onClick={() => detail?.image_url && setImgExpanded(true)}
            style={{
              borderRadius: "var(--r-md)",
              border: "1px solid var(--border)",
              background: "var(--bg)",
              overflow: "hidden",
              minHeight: "200px",
              display: "flex", alignItems: "center", justifyContent: "center",
              position: "relative",
              cursor: detail?.image_url ? "zoom-in" : "default",
            }}
          >
            {detail?.image_url ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={detail.image_url}
                  alt="Фото чека"
                  style={{ width: "100%", height: "auto", objectFit: "contain", display: "block", maxHeight: "60vh" }}
                />
                <div style={{
                  position: "absolute", bottom: "8px", right: "8px",
                  display: "flex", alignItems: "center", gap: "4px",
                  background: "rgba(10,10,20,0.55)", backdropFilter: "blur(4px)",
                  borderRadius: "var(--r-sm)", padding: "4px 8px",
                  fontSize: "11px", fontWeight: 600, color: "#fff",
                }}>
                  <ZoomInIcon style={{ width: "11px", height: "11px" }} />
                  Увеличить
                </div>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", padding: "48px 24px", color: "var(--text-muted)", textAlign: "center" }}>
                {detail === null
                  ? <><LoaderCircleIcon style={{ width: "32px", height: "32px", opacity: 0.5 }} className="animate-spin" /><span style={{ fontSize: "13px" }}>Загрузка...</span></>
                  : <><ImageOffIcon style={{ width: "32px", height: "32px", opacity: 0.3 }} /><span style={{ fontSize: "13px" }}>Фото недоступно</span></>
                }
              </div>
            )}
          </div>
          <p style={{ fontSize: "11px", color: "var(--text-muted)", textAlign: "center", margin: 0 }}>
            🔍 Нажмите чтобы увеличить
          </p>

          {item.ocr_confidence != null && <ConfBar value={item.ocr_confidence} />}

          {detail?.merge_strategy && (
            <div style={{
              display: "flex", justifyContent: "space-between",
              borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
              background: "var(--bg)", padding: "6px 10px", fontSize: "11px",
            }}>
              <span style={{ color: "var(--text-muted)" }}>Стратегия OCR</span>
              <span style={{ fontWeight: 700, color: "var(--text-secondary)" }}>{detail.merge_strategy}</span>
            </div>
          )}
        </div>

        {/* Правая колонка: форма + таблица + кнопки */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* Карточка с данными (как OCREditor) */}
          <div className="card" style={{ padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                Данные чека
              </h2>
              {isLowConf && (
                <span style={{
                  display: "flex", alignItems: "center", gap: "5px",
                  fontSize: "11px", color: "var(--yellow-text)",
                  background: "var(--yellow-bg)",
                  padding: "3px 10px", borderRadius: "var(--r-pill)",
                  fontWeight: 600,
                }}>
                  ⚠ Низкая точность OCR ({Math.round((item.ocr_confidence ?? 0) * 100)}%)
                </span>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* Дата */}
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  Дата покупки
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  style={inputStyle(isLowConf)}
                  onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
                  onBlur={(e) => { e.target.style.borderColor = isLowConf ? "var(--yellow)" : "var(--border)"; }}
                />
              </div>

              {/* Аптека */}
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  Аптека
                </label>
                <input
                  type="text"
                  value={pharmacy}
                  onChange={(e) => setPharmacy(e.target.value)}
                  placeholder="Название аптеки"
                  style={inputStyle(isLowConf)}
                  onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
                  onBlur={(e) => { e.target.style.borderColor = isLowConf ? "var(--yellow)" : "var(--border)"; }}
                />
              </div>

              {/* Сумма */}
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  Сумма (₽)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  style={inputStyle(isLowConf)}
                  onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
                  onBlur={(e) => { e.target.style.borderColor = isLowConf ? "var(--yellow)" : "var(--border)"; }}
                />
              </div>
            </div>

            {/* Кнопки */}
            <div style={{ marginTop: "18px", display: "flex", gap: "10px" }}>
              <Button onClick={handleApprove} disabled={saving}
                className="flex-1 font-semibold h-9"
                style={{ background: "var(--accent)", color: "#fff" }}>
                {saving
                  ? <><LoaderCircleIcon className="animate-spin" />Сохранение...</>
                  : <><CheckIcon />Подтвердить</>}
              </Button>
              <Button variant="outline" onClick={onSkip} disabled={saving}
                className="shrink-0 h-9 font-medium"
                style={{ borderColor: "var(--border)" }}>
                Пропустить <ArrowRightIcon />
              </Button>
            </div>
          </div>

          {/* Таблица препаратов */}
          {detail && <ItemsTable items={detail.items} />}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Empty / Done states
// ---------------------------------------------------------------------------

function EmptyState({ icon, title, subtitle, onDashboard }: { icon: React.ReactNode; title: string; subtitle: string; onDashboard: () => void }) {
  return (
    <div className="card" style={{ padding: "64px 24px", textAlign: "center" }}>
      <div style={{ width: "56px", height: "56px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
        {icon}
      </div>
      <p style={{ fontSize: "16px", fontWeight: 800, color: "var(--text-primary)", margin: "0 0 6px" }}>{title}</p>
      <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "0 0 24px" }}>{subtitle}</p>
      <Button onClick={onDashboard} className="font-semibold" size="sm" style={{ background: "var(--accent)", color: "#fff" }}>
        На дашборд
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReviewPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { queue, currentIdx, loadQueue, approve, skip } = useReviewStore();

  const { data, isLoading } = useQuery<ReceiptListResponse>({
    queryKey: ["receipts-review"],
    queryFn: () => api.get<ReceiptListResponse>("/api/v1/receipts?status=REVIEW"),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (data) {
      const reviewItems = data.months.flatMap((m) =>
        m.receipts.filter((r) => r.ocr_status === "REVIEW"),
      );
      loadQueue(reviewItems);
    }
  }, [data, loadQueue]);

  const currentItem = queue[currentIdx] ?? null;
  const remaining = queue.length - currentIdx;

  function handleApprove() {
    void queryClient.invalidateQueries({ queryKey: ["receipts-review"] });
    void queryClient.invalidateQueries({ queryKey: ["receipts-list"] });
    approve();
    if (currentIdx + 1 >= queue.length) router.push("/dashboard");
  }

  function handleSkip() {
    skip();
    if (currentIdx + 1 >= queue.length) router.push("/dashboard");
  }

  return (
    <div style={{ maxWidth: "1100px" }}>
      {/* Заголовок */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em", margin: 0 }}>
            Очередь проверки
          </h1>
          {!isLoading && queue.length > 0 && (
            <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--text-muted)" }}>
              {remaining > 0
                ? `Осталось ${remaining} чек${remaining === 1 ? "" : remaining < 5 ? "а" : "ов"} для проверки`
                : "Все чеки просмотрены"}
            </p>
          )}
        </div>
        {!isLoading && queue.length > 0 && (
          <Badge variant="secondary" className="h-auto px-3 py-1 text-[12px] font-semibold shrink-0"
            style={{ background: "var(--yellow-bg)", color: "var(--yellow-text)" }}>
            {queue.length} на проверке
          </Badge>
        )}
      </div>

      {/* Скелетон загрузки */}
      {isLoading && (
        <div className="card" style={{ height: "420px", overflow: "hidden" }}>
          <div style={{ display: "flex", height: "100%" }}>
            <div style={{ width: "260px", flexShrink: 0, background: "var(--bg)", borderRight: "1px solid var(--border-light)", animation: "pulse 1.5s ease-in-out infinite" }} />
            <div style={{ flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              {[60, 40, 40].map((w, i) => (
                <div key={i}>
                  <div style={{ width: "80px", height: "10px", background: "var(--bg)", borderRadius: "4px", marginBottom: "8px", animation: "pulse 1.5s ease-in-out infinite" }} />
                  <div style={{ height: "36px", background: "var(--bg)", borderRadius: "var(--r-sm)", animation: "pulse 1.5s ease-in-out infinite", width: `${w}%` }} />
                </div>
              ))}
            </div>
          </div>
          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
        </div>
      )}

      {/* Пусто */}
      {!isLoading && queue.length === 0 && (
        <EmptyState
          icon={<CheckIcon style={{ width: "24px", height: "24px", color: "var(--green-text)", strokeWidth: 2.5 }} />}
          title="Всё проверено!"
          subtitle="Нет чеков, требующих ручной проверки"
          onDashboard={() => router.push("/dashboard")}
        />
      )}

      {/* Карточка проверки */}
      {!isLoading && currentItem && currentIdx < queue.length && (
        <ReviewCard
          item={currentItem}
          total={queue.length}
          current={currentIdx + 1}
          onApprove={handleApprove}
          onSkip={handleSkip}
        />
      )}

      {/* Все просмотрены */}
      {!isLoading && queue.length > 0 && currentIdx >= queue.length && (
        <EmptyState
          icon={<StarIcon style={{ width: "24px", height: "24px", color: "var(--accent)", strokeWidth: 2.5 }} />}
          title="Вы просмотрели все чеки"
          subtitle={`${queue.length} ${queue.length === 1 ? "чек проверен" : "чека проверено"} в этой сессии`}
          onDashboard={() => router.push("/dashboard")}
        />
      )}
    </div>
  );
}
