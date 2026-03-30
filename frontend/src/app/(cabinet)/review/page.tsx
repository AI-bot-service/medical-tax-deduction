"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckIcon, ArrowRightIcon, AlertCircleIcon,
  ZoomInIcon, XIcon, ImageOffIcon, LoaderCircleIcon, StarIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useReviewStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <div className="space-y-1.5">
      <Label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
        Позиции ({items.length})
      </Label>
      <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-sm)", overflow: "hidden" }}>
        {items.map((it, i) => (
          <div
            key={it.id}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: "8px", padding: "8px 12px", fontSize: "12px",
              background: i % 2 === 0 ? "var(--surface)" : "var(--surface-subtle)",
              borderTop: i > 0 ? "1px solid var(--border-light)" : "none",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {it.drug_name}
              </span>
              {it.drug_inn && <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{it.drug_inn}</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
              {it.is_rx && (
                <Badge variant="secondary" className="text-[10px] font-bold px-1.5 h-auto" style={{ background: "var(--purple-bg)", color: "var(--purple-text)" }}>
                  Рецепт
                </Badge>
              )}
              <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                {parseFloat(it.total_price).toLocaleString("ru-RU", { minimumFractionDigits: 2 })} ₽
              </span>
            </div>
          </div>
        ))}
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

  const inputCls = isLowConf
    ? "border-yellow-400 bg-yellow-50/50 focus-visible:border-[var(--accent)] focus-visible:ring-[var(--accent-light)]"
    : "focus-visible:border-[var(--accent)] focus-visible:ring-[var(--accent-light)]";

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

      {/* Card — HEITKAMP structure, не shadcn Card */}
      <div className="card reveal reveal-1" style={{ overflow: "hidden" }}>

        {/* ── Header ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 20px", borderBottom: "1px solid var(--border-light)",
          background: "var(--surface-subtle)",
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

        {/* ── Body: два столбца ── */}
        <div style={{ display: "flex", minHeight: "380px" }}>

          {/* Левая панель: изображение */}
          <div style={{
            width: "260px", flexShrink: 0,
            display: "flex", flexDirection: "column", gap: "12px",
            padding: "16px",
            borderRight: "1px solid var(--border-light)",
            background: "var(--surface-subtle)",
          }}>
            {/* Область изображения */}
            <div
              onClick={() => detail?.image_url && setImgExpanded(true)}
              style={{
                flex: 1, minHeight: "200px",
                borderRadius: "var(--r-sm)",
                border: "1px solid var(--border)",
                background: "var(--bg)",
                overflow: "hidden",
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
                    style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
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
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", padding: "24px", color: "var(--text-muted)", textAlign: "center" }}>
                  {detail === null
                    ? <><LoaderCircleIcon style={{ width: "28px", height: "28px", opacity: 0.5 }} className="animate-spin" /><span style={{ fontSize: "12px" }}>Загрузка...</span></>
                    : <><ImageOffIcon style={{ width: "28px", height: "28px", opacity: 0.3 }} /><span style={{ fontSize: "12px" }}>Фото недоступно</span></>
                  }
                </div>
              )}
            </div>

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

          {/* Правая панель: форма */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px", padding: "20px 24px", overflowY: "auto" }}>

            <div className="space-y-1.5">
              <Label htmlFor="rv-date" className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Дата покупки
              </Label>
              <Input id="rv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rv-pharmacy" className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Аптека
              </Label>
              <Input id="rv-pharmacy" type="text" value={pharmacy} onChange={(e) => setPharmacy(e.target.value)}
                placeholder="Название аптеки" className={inputCls} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rv-amount" className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Сумма, ₽
              </Label>
              <div style={{ position: "relative" }}>
                <Input id="rv-amount" type="number" step="0.01" value={amount}
                  onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
                  className={`pr-7 ${inputCls}`} />
                <span style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "13px", fontWeight: 700, color: "var(--text-muted)", pointerEvents: "none" }}>₽</span>
              </div>
            </div>

            {detail && <ItemsTable items={detail.items} />}

            <div style={{ flex: 1 }} />

            {isLowConf && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: "8px",
                borderRadius: "var(--r-sm)", border: "1px solid #F6D860",
                background: "var(--yellow-bg)", padding: "10px 12px",
                fontSize: "12px", color: "var(--yellow-text)",
              }}>
                <AlertCircleIcon style={{ width: "14px", height: "14px", flexShrink: 0, marginTop: "1px" }} />
                Низкая точность OCR — проверьте данные перед подтверждением
              </div>
            )}

            <div style={{ display: "flex", gap: "10px" }}>
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
    <div style={{ maxWidth: "860px" }}>
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
