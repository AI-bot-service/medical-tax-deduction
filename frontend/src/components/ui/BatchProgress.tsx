"use client";

import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBatchStore } from "@/lib/store";
import { useBatchSSE } from "@/hooks/useBatchSSE";
import { api } from "@/lib/api";
import {
  CheckCircle2, AlertCircle, LoaderCircle,
  ZoomIn, ImageOff, X, Check, ArrowRight, ArrowLeft,
} from "lucide-react";
import type { ReceiptListResponse, ReceiptListItem, ReceiptDetail, Prescription, PrescriptionListResponse } from "@/types/api";

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

/* ─────────── Receipt SVG ─────────── */
function ReceiptIllustration() {
  return (
    <svg viewBox="0 0 96 136" fill="none" style={{ width: 96, height: 136 }}>
      <rect x="3" y="3" width="90" height="130" rx="6" fill="white" stroke="#e5e7eb" strokeWidth="1.5"/>
      <line x1="13" y1="20" x2="83" y2="20" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round"/>
      <line x1="13" y1="31" x2="68" y2="31" stroke="#e5e7eb" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="13" y1="42" x2="74" y2="42" stroke="#e5e7eb" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="13" y1="53" x2="58" y2="53" stroke="#e5e7eb" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="13" y1="64" x2="78" y2="64" stroke="#e5e7eb" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="13" y1="75" x2="54" y2="75" stroke="#e5e7eb" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="13" y1="84" x2="83" y2="84" stroke="#d1d5db" strokeWidth="1" strokeDasharray="4 2"/>
      {/* QR */}
      <rect x="27" y="92" width="42" height="34" rx="2" fill="#f3f4f6" stroke="#e5e7eb"/>
      <rect x="31" y="96" width="9" height="9" rx="1" fill="#9ca3af"/>
      <rect x="32" y="97" width="7" height="7" rx="0.5" fill="#f3f4f6"/>
      <rect x="33.5" y="98.5" width="4" height="4" rx="0.5" fill="#9ca3af"/>
      <rect x="57" y="96" width="9" height="9" rx="1" fill="#9ca3af"/>
      <rect x="58" y="97" width="7" height="7" rx="0.5" fill="#f3f4f6"/>
      <rect x="59.5" y="98.5" width="4" height="4" rx="0.5" fill="#9ca3af"/>
      <rect x="31" y="117" width="9" height="9" rx="1" fill="#9ca3af"/>
      <rect x="32" y="118" width="7" height="7" rx="0.5" fill="#f3f4f6"/>
      <rect x="33.5" y="119.5" width="4" height="4" rx="0.5" fill="#9ca3af"/>
      <rect x="43" y="96" width="3" height="3" rx="0.5" fill="#9ca3af"/>
      <rect x="48" y="102" width="3" height="3" rx="0.5" fill="#9ca3af"/>
      <rect x="43" y="107" width="5" height="3" rx="0.5" fill="#9ca3af"/>
      <rect x="51" y="96" width="3" height="5" rx="0.5" fill="#9ca3af"/>
      <rect x="55" y="103" width="3" height="3" rx="0.5" fill="#9ca3af"/>
    </svg>
  );
}

/* ─────────── Фаза: сканирование ─────────── */
function ScanningCard({ processed, total }: { processed: number; total: number }) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--r-lg)",
      padding: "48px 32px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "24px",
      boxShadow: "var(--shadow-md)",
      overflow: "hidden",
      position: "relative",
    }}>
      {/* Фоновый блик */}
      <div style={{
        position: "absolute", top: "-60px", left: "50%", transform: "translateX(-50%)",
        width: "280px", height: "280px", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(123,111,212,0.09) 0%, transparent 70%)",
        pointerEvents: "none",
      }}/>

      {/* Чек + луч сканера */}
      <div style={{ position: "relative", width: 96, height: 136 }}>
        {/* Тень под чеком */}
        <div style={{
          position: "absolute", bottom: -10, left: "10%", right: "10%",
          height: 18, borderRadius: "50%",
          background: "rgba(123,111,212,0.18)",
          filter: "blur(8px)",
          animation: "bpShadow 2s ease-in-out infinite",
        }}/>

        <ReceiptIllustration />

        {/* Луч сканера */}
        <div style={{
          position: "absolute", left: 3, right: 3, height: 2,
          background: "linear-gradient(90deg, transparent, var(--accent-mid), var(--accent), var(--accent-mid), transparent)",
          borderRadius: 1,
          animation: "bpBeam 2s ease-in-out infinite",
          boxShadow: "0 0 10px 3px rgba(123,111,212,0.5)",
        }}/>
        {/* Полупрозрачный след луча */}
        <div style={{
          position: "absolute", left: 3, right: 3, height: 28,
          background: "linear-gradient(180deg, transparent, rgba(123,111,212,0.1), transparent)",
          animation: "bpBeam 2s ease-in-out infinite",
          marginTop: -13,
          pointerEvents: "none",
        }}/>

        {/* Угловые метки сканера */}
        {[
          { top: 0, left: 0, borderTop: "2px solid var(--accent)", borderLeft: "2px solid var(--accent)" },
          { top: 0, right: 0, borderTop: "2px solid var(--accent)", borderRight: "2px solid var(--accent)" },
          { bottom: 0, left: 0, borderBottom: "2px solid var(--accent)", borderLeft: "2px solid var(--accent)" },
          { bottom: 0, right: 0, borderBottom: "2px solid var(--accent)", borderRight: "2px solid var(--accent)" },
        ].map((s, i) => (
          <div key={i} style={{ position: "absolute", width: 12, height: 12, borderRadius: 1, opacity: 0.75, ...s }}/>
        ))}
      </div>

      {/* Текст */}
      <div style={{ textAlign: "center", zIndex: 1 }}>
        <p style={{ margin: "0 0 5px", fontSize: 16, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
          Распознавание фото
        </p>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
          {processed > 0
            ? `Обработано ${processed} из ${total}`
            : `Анализируем ${total} ${plural(total, "файл", "файла", "файлов")}`}
        </p>
      </div>

      {/* Точки */}
      <div style={{ display: "flex", gap: 8, zIndex: 1 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "var(--accent)",
            animation: `bpDot 1.4s ease-in-out ${i * 0.18}s infinite`,
          }}/>
        ))}
      </div>

      <style>{`
        @keyframes bpBeam {
          0%   { top: 3px;   opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { top: 119px; opacity: 0; }
        }
        @keyframes bpDot {
          0%,100% { transform: scale(0.65); opacity: 0.3; }
          50%     { transform: scale(1.2);  opacity: 1;   }
        }
        @keyframes bpShadow {
          0%,100% { opacity: 0.5; transform: scaleX(0.85); }
          50%     { opacity: 1;   transform: scaleX(1.05); }
        }
        @keyframes bpFadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes bpPopIn {
          0%  { transform: scale(0); opacity: 0; }
          70% { transform: scale(1.15); }
          100%{ transform: scale(1);   opacity: 1; }
        }
        @keyframes bpSlideIn {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
      `}</style>
    </div>
  );
}

/* ─────────── Фаза: всё готово ─────────── */
function DoneCard({ doneCount, failedCount }: { doneCount: number; failedCount: number }) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--r-lg)",
      padding: "48px 32px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "14px",
      boxShadow: "var(--shadow-md)",
      animation: "bpFadeUp 0.4s ease-out",
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: "50%",
        background: "var(--green-bg)",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "bpPopIn 0.5s cubic-bezier(0.16,1,0.3,1)",
      }}>
        <CheckCircle2 style={{ width: 26, height: 26, color: "var(--green-text)" }}/>
      </div>
      <div style={{ textAlign: "center" }}>
        <p style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
          Распознавание завершено
        </p>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
          {doneCount > 0 && `${doneCount} ${plural(doneCount, "чек добавлен", "чека добавлено", "чеков добавлено")}`}
          {doneCount > 0 && failedCount > 0 && " · "}
          {failedCount > 0 && `${failedCount} не распознано`}
        </p>
      </div>
      <style>{`
        @keyframes bpPopIn { 0%{transform:scale(0);opacity:0} 70%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1} }
        @keyframes bpFadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}

/* ─────────── Инлайн-проверка чека ─────────── */
type Draft = { date: string; pharmacy: string; amount: string; itemEdits: Record<string, string> };

// Черновик редактирования рецепта
type DrugDraft = { id: string; drug_name: string; dosage: string };
type PrescriptionDraft = {
  issue_date: string;
  validity_days: 60 | 365;
  doctor_name: string;
  clinic_name: string;
  drugs: DrugDraft[];
};

// Элемент единой очереди проверки
type QueueItem =
  | { kind: "receipt"; id: string; item: ReceiptListItem }
  | { kind: "prescription"; id: string; items: Prescription[] }; // items = препараты одного рецепта (один s3_key)

function InlineReviewCard({
  item, current, total, savedCount, savedStatuses, isSaved,
  onSave, onNext, onPrev, onCancel,
  draft, cachedDetail, onDraftChange, onDetailFetched,
}: {
  item: ReceiptListItem; current: number; total: number;
  savedCount: number; savedStatuses: boolean[]; isSaved: boolean;
  onSave: () => void; onNext: () => void; onPrev: () => void; onCancel: () => void;
  draft?: Draft;
  cachedDetail?: ReceiptDetail;
  onDraftChange: (d: Draft) => void;
  onDetailFetched: (d: ReceiptDetail) => void;
}) {
  const [detail, setDetail] = useState<ReceiptDetail | null>(cachedDetail ?? null);
  const [date, setDate] = useState(draft?.date ?? item.purchase_date ?? "");
  const [pharmacy, setPharmacy] = useState(draft?.pharmacy ?? item.pharmacy_name ?? "");
  const [amount, setAmount] = useState(draft?.amount ?? item.total_amount ?? "");
  const [saving, setSaving] = useState(false);
  const [imgExpanded, setImgExpanded] = useState(false);
  // Редактирование названий позиций: id → новое название
  const [itemEdits, setItemEdits] = useState<Record<string, string>>(draft?.itemEdits ?? {});
  const queryClient = useQueryClient();

  // Сохраняем черновик в родительском компоненте при каждом изменении полей
  const onDraftChangeRef = useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;
  useEffect(() => {
    onDraftChangeRef.current({ date, pharmacy, amount, itemEdits });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, pharmacy, amount, itemEdits]);

  useEffect(() => {
    // Если детали уже закешированы — используем их, не делаем запрос
    if (cachedDetail) {
      setDetail(cachedDetail);
      return;
    }
    setDetail(null);
    void api.get<ReceiptDetail>(`/api/v1/receipts/${item.id}`).then((d) => {
      setDetail(d);
      onDetailFetched(d);
      // Устанавливаем поля из ответа только если черновика ещё нет
      if (!draft) {
        setDate(d.purchase_date ?? item.purchase_date ?? "");
        setPharmacy(d.pharmacy_name ?? item.pharmacy_name ?? "");
        setAmount(d.total_amount ?? item.total_amount ?? "");
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const editedItems = Object.entries(itemEdits).map(([id, drug_name]) => ({ id, drug_name }));
      await api.patch(`/api/v1/receipts/${item.id}`, {
        purchase_date: date || null,
        pharmacy_name: pharmacy || null,
        total_amount: amount ? parseFloat(amount) : null,
        items: editedItems.length > 0 ? editedItems : undefined,
      });
      void queryClient.invalidateQueries({ queryKey: ["receipts-list"] });
      void queryClient.invalidateQueries({ queryKey: ["receipts-review"] });
      onSave();
    } finally {
      setSaving(false);
    }
  }

  const conf = item.ocr_confidence ?? null;
  const confColor = conf == null ? "var(--text-muted)"
    : conf >= 0.7 ? "var(--green-text)"
    : conf >= 0.4 ? "var(--yellow-text)"
    : "var(--red-text)";
  const confBg = conf == null ? "var(--bg)"
    : conf >= 0.7 ? "var(--green)"
    : conf >= 0.4 ? "var(--yellow)"
    : "var(--red)";

  const fieldStyle: React.CSSProperties = {
    height: 40, padding: "0 12px",
    borderRadius: "var(--r-sm)",
    border: "1.5px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text-primary)",
    fontSize: 14,
    fontFamily: "inherit",
    fontWeight: 500,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    transition: "border-color 0.15s",
  };
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--text-secondary)",
    marginBottom: 6,
  };

  return (
    <>
      {/* Lightbox */}
      {imgExpanded && detail?.image_url && (
        <div onClick={() => setImgExpanded(false)} style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(10,10,20,0.88)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "zoom-out",
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={detail.image_url} alt="Фото чека"
            style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: "var(--r-md)", boxShadow: "var(--shadow-lg)" }}/>
          <button onClick={(e) => { e.stopPropagation(); setImgExpanded(false); }} style={{
            position: "absolute", top: 16, right: 16,
            width: 36, height: 36, borderRadius: "50%",
            background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)",
            color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            backdropFilter: "blur(4px)",
          }}>
            <X style={{ width: 16, height: 16 }}/>
          </button>
        </div>
      )}

      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-md)",
        overflow: "hidden",
        animation: "bpSlideIn 0.4s cubic-bezier(0.16,1,0.3,1)",
      }}>
        {/* Шапка */}
        <div style={{
          padding: "11px 20px",
          borderBottom: "1px solid var(--border-light)",
          background: "var(--surface-subtle)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "3px 10px", borderRadius: "var(--r-pill)",
              fontSize: 11, fontWeight: 700,
              background: isSaved ? "var(--green)" : "var(--yellow-bg)",
              color: isSaved ? "var(--green-text)" : "var(--yellow-text)",
            }}>
              {isSaved
                ? <><CheckCircle2 style={{ width: 11, height: 11 }}/>Сохранён</>
                : <><AlertCircle style={{ width: 11, height: 11 }}/>Проверьте данные</>}
            </span>
          </div>

          {/* Прогресс-точки */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", gap: 4 }}>
              {Array.from({ length: Math.min(total, 7) }).map((_, i) => (
                <div key={i} style={{
                  height: 5, borderRadius: 3,
                  width: i === current - 1 ? 16 : 5,
                  background: savedStatuses[i] ? "var(--green)" : i === current - 1 ? "var(--accent)" : "var(--border)",
                  transition: "all 250ms var(--ease-spring)",
                }}/>
              ))}
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
              Сохранено: {savedCount} / {total}
            </span>
          </div>
        </div>

        {/* Тело: фото + поля */}
        <div style={{ display: "flex" }}>

          {/* Левая панель: фото */}
          <div style={{
            width: 240, flexShrink: 0,
            borderRight: "1px solid var(--border-light)",
            background: "var(--surface-subtle)",
            display: "flex", flexDirection: "column",
            padding: 16, gap: 12,
          }}>
            <div
              onClick={() => detail?.image_url && setImgExpanded(true)}
              style={{
                flex: 1, minHeight: 200,
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
                  <img src={detail.image_url} alt="Фото чека"
                    style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}/>
                  <div style={{
                    position: "absolute", bottom: 8, right: 8,
                    display: "flex", alignItems: "center", gap: 4,
                    background: "rgba(10,10,20,0.55)", backdropFilter: "blur(4px)",
                    borderRadius: "var(--r-sm)", padding: "4px 8px",
                    fontSize: 11, fontWeight: 600, color: "#fff",
                  }}>
                    <ZoomIn style={{ width: 11, height: 11 }}/>
                    Увеличить
                  </div>
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "var(--text-muted)" }}>
                  {detail === null
                    ? <LoaderCircle style={{ width: 24, height: 24 }} className="animate-spin"/>
                    : <ImageOff style={{ width: 24, height: 24, opacity: 0.35 }}/>}
                </div>
              )}
            </div>

            {/* Точность */}
            {conf !== null && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                    Точность ИИ
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: confColor }}>
                    {Math.round(conf * 100)}%
                  </span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: "var(--bg)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 2,
                    width: `${Math.round(conf * 100)}%`,
                    background: confBg,
                    transition: "width 0.6s var(--ease-spring)",
                  }}/>
                </div>
              </div>
            )}
          </div>

          {/* Правая панель: поля */}
          <div style={{ flex: 1, padding: "24px", display: "flex", flexDirection: "column", gap: 18 }}>

            <div>
              <label style={labelStyle}>Дата покупки</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                style={{ ...fieldStyle, width: 180 }}
                onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border)")}/>
            </div>

            <div>
              <label style={labelStyle}>Аптека</label>
              <input type="text" value={pharmacy} onChange={(e) => setPharmacy(e.target.value)}
                placeholder="Название аптеки"
                style={{ ...fieldStyle, maxWidth: 360 }}
                onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border)")}/>
            </div>

            <div>
              <label style={labelStyle}>Сумма, ₽</label>
              <div style={{ position: "relative", width: 160 }}>
                <input type="number" step="0.01" value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  style={{ ...fieldStyle, paddingRight: 32, width: "100%" }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--border)")}/>
                <span style={{
                  position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                  fontSize: 13, fontWeight: 700, color: "var(--text-muted)", pointerEvents: "none",
                }}>₽</span>
              </div>
            </div>

            {/* Позиции чека */}
            {detail && detail.items.length > 0 && (
              <div>
                <label style={labelStyle}>Позиции ({detail.items.length})</label>
                <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-sm)", overflow: "hidden" }}>
                  {detail.items.map((it, i) => {
                    const currentName = itemEdits[it.id] ?? it.drug_name;
                    const qty = it.quantity;
                    const unitP = parseFloat(it.unit_price);
                    const totalP = parseFloat(it.total_price);
                    const showBreakdown = qty !== 1 && unitP > 0;
                    return (
                      <div key={it.id} style={{
                        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                        gap: 12, padding: "9px 12px", fontSize: 12,
                        background: i % 2 === 0 ? "var(--surface)" : "var(--surface-subtle)",
                        borderTop: i > 0 ? "1px solid var(--border-light)" : "none",
                      }}>
                        {/* Левая часть: название (редактируемое) + МНН */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <input
                            value={currentName}
                            onChange={(e) => setItemEdits((prev) => ({ ...prev, [it.id]: e.target.value }))}
                            style={{
                              display: "block",
                              width: "100%",
                              fontWeight: 600,
                              fontSize: 12,
                              color: "var(--text-primary)",
                              background: "transparent",
                              border: "none",
                              borderBottom: itemEdits[it.id] !== undefined
                                ? "1.5px solid var(--accent)"
                                : "1.5px solid transparent",
                              outline: "none",
                              padding: "0 0 1px",
                              fontFamily: "inherit",
                              cursor: "text",
                              transition: "border-color 0.15s",
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderBottomColor = "var(--accent)";
                            }}
                            onBlur={(e) => {
                              if (itemEdits[it.id] === undefined) {
                                e.currentTarget.style.borderBottomColor = "transparent";
                              }
                            }}
                          />
                          {it.drug_inn && (
                            <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, display: "block" }}>
                              МНН: {it.drug_inn}
                            </span>
                          )}
                        </div>

                        {/* Правая часть: кол-во × цена + итого + бейдж */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {it.is_rx && (
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: "2px 6px",
                                borderRadius: "var(--r-pill)",
                                background: "var(--purple-bg)", color: "var(--purple-text)",
                              }}>Рецепт</span>
                            )}
                            <span style={{ fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                              {totalP.toLocaleString("ru-RU", { minimumFractionDigits: 2 })} ₽
                            </span>
                          </div>
                          {showBreakdown && (
                            <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                              {qty % 1 === 0 ? qty : qty} шт. × {unitP.toLocaleString("ru-RU", { minimumFractionDigits: 2 })} ₽
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ flex: 1 }}/>

            {/* Кнопки */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {/* Сохранить */}
              <button
                onClick={() => { void handleSave(); }}
                disabled={saving}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  height: 40, padding: "0 22px",
                  borderRadius: "var(--r-sm)",
                  background: saving ? "var(--accent-mid)" : "var(--accent)",
                  color: "#fff", border: "none",
                  cursor: saving ? "not-allowed" : "pointer",
                  fontSize: 14, fontWeight: 600, fontFamily: "inherit",
                  transition: "background 0.15s",
                  boxShadow: "var(--shadow-accent)",
                }}
                onMouseEnter={(e) => { if (!saving) e.currentTarget.style.background = "var(--accent-dark)"; }}
                onMouseLeave={(e) => { if (!saving) e.currentTarget.style.background = "var(--accent)"; }}
              >
                {saving
                  ? <><LoaderCircle style={{ width: 16, height: 16 }} className="animate-spin"/>Сохранение...</>
                  : <><Check style={{ width: 16, height: 16 }}/>Сохранить чек</>}
              </button>

              {/* Отменить */}
              <button
                onClick={onCancel}
                disabled={saving}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  height: 40, padding: "0 16px",
                  borderRadius: "var(--r-sm)",
                  background: "var(--surface)",
                  color: "var(--text-secondary)",
                  border: "1.5px solid var(--border)",
                  cursor: saving ? "not-allowed" : "pointer",
                  fontSize: 14, fontWeight: 500, fontFamily: "inherit",
                  transition: "border-color 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => { if (!saving) { e.currentTarget.style.borderColor = "var(--red-text)"; e.currentTarget.style.color = "var(--red-text)"; } }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
              >
                <X style={{ width: 14, height: 14 }}/>Отменить
              </button>

              {/* Навигация: Предыдущий / Следующий */}
              <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                <button
                  onClick={onPrev}
                  disabled={saving || current === 1}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    height: 40, padding: "0 14px",
                    borderRadius: "var(--r-sm)",
                    background: "var(--surface)",
                    color: current === 1 ? "var(--text-disabled)" : "var(--text-secondary)",
                    border: `1.5px solid ${current === 1 ? "var(--border-light)" : "var(--border)"}`,
                    cursor: (saving || current === 1) ? "not-allowed" : "pointer",
                    fontSize: 14, fontWeight: 500, fontFamily: "inherit",
                    opacity: current === 1 ? 0.5 : 1,
                    transition: "border-color 0.15s, color 0.15s",
                  }}
                  onMouseEnter={(e) => { if (current !== 1 && !saving) { const t = e.currentTarget; t.style.borderColor = "var(--accent)"; t.style.color = "var(--accent)"; } }}
                  onMouseLeave={(e) => { const t = e.currentTarget; t.style.borderColor = current === 1 ? "var(--border-light)" : "var(--border)"; t.style.color = current === 1 ? "var(--text-disabled)" : "var(--text-secondary)"; }}
                >
                  <ArrowLeft style={{ width: 15, height: 15 }}/> Предыдущий
                </button>
                <button
                  onClick={onNext}
                  disabled={saving || current === total}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    height: 40, padding: "0 14px",
                    borderRadius: "var(--r-sm)",
                    background: "var(--surface)",
                    color: current === total ? "var(--text-disabled)" : "var(--text-secondary)",
                    border: `1.5px solid ${current === total ? "var(--border-light)" : "var(--border)"}`,
                    cursor: (saving || current === total) ? "not-allowed" : "pointer",
                    fontSize: 14, fontWeight: 500, fontFamily: "inherit",
                    opacity: current === total ? 0.5 : 1,
                    transition: "border-color 0.15s, color 0.15s",
                  }}
                  onMouseEnter={(e) => { if (current !== total && !saving) { const t = e.currentTarget; t.style.borderColor = "var(--accent)"; t.style.color = "var(--accent)"; } }}
                  onMouseLeave={(e) => { const t = e.currentTarget; t.style.borderColor = current === total ? "var(--border-light)" : "var(--border)"; t.style.color = current === total ? "var(--text-disabled)" : "var(--text-secondary)"; }}
                >
                  Следующий <ArrowRight style={{ width: 15, height: 15 }}/>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bpSlideIn {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
      `}</style>
    </>
  );
}

/* ─────────── Карточка проверки рецепта ─────────── */
function InlinePrescriptionReviewCard({
  items, current, total, savedCount, savedStatuses, isSaved,
  onSave, onNext, onPrev, onCancel,
  draft, onDraftChange,
}: {
  items: Prescription[]; current: number; total: number;
  savedCount: number; savedStatuses: boolean[]; isSaved: boolean;
  onSave: () => void; onNext: () => void; onPrev: () => void; onCancel: () => void;
  draft?: PrescriptionDraft;
  onDraftChange: (d: PrescriptionDraft) => void;
}) {
  const first = items[0];
  const queryClient = useQueryClient();

  const diffDays = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
  const guessValidity = (): 60 | 365 => {
    if (!first?.expires_at || !first?.issue_date) return 60;
    const d = diffDays(first.issue_date, first.expires_at);
    return d >= 300 ? 365 : 60;
  };

  const [issueDate, setIssueDate] = useState(draft?.issue_date ?? first?.issue_date ?? "");
  const [validityDays, setValidityDays] = useState<60 | 365>(draft?.validity_days ?? guessValidity());
  const [doctorName, setDoctorName] = useState(draft?.doctor_name ?? first?.doctor_name ?? "");
  const [clinicName, setClinicName] = useState(draft?.clinic_name ?? first?.clinic_name ?? "");
  const [drugs, setDrugs] = useState<DrugDraft[]>(
    draft?.drugs ?? items.map((p) => ({ id: p.id, drug_name: p.drug_name, dosage: p.dosage ?? "" }))
  );
  const [saving, setSaving] = useState(false);
  const [imgExpanded, setImgExpanded] = useState(false);
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  // Presigned URL для фото рецепта (берём из S3 через batch_id)
  useEffect(() => {
    if (first?.s3_key) {
      void api.get<{ image_url: string | null }>(`/api/v1/prescriptions/${first.id}/image`)
        .then((d) => setImgUrl(d.image_url))
        .catch(() => null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first?.id]);

  // Синхронизируем черновик вверх
  const onDraftChangeRef = useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;
  useEffect(() => {
    onDraftChangeRef.current({ issue_date: issueDate, validity_days: validityDays, doctor_name: doctorName, clinic_name: clinicName, drugs });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueDate, validityDays, doctorName, clinicName, drugs]);

  function addDrug() {
    setDrugs((prev) => [...prev, { id: `new-${Date.now()}`, drug_name: "", dosage: "" }]);
  }

  function removeDrug(idx: number) {
    setDrugs((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateDrug(idx: number, field: "drug_name" | "dosage", val: string) {
    setDrugs((prev) => prev.map((d, i) => i === idx ? { ...d, [field]: val } : d));
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Обновляем каждый существующий рецепт (по id из items)
      const existingIds = new Set(items.map((p) => p.id));

      // Патчим существующие
      await Promise.all(
        drugs
          .filter((d) => existingIds.has(d.id))
          .map((d) =>
            api.patch(`/api/v1/prescriptions/${d.id}`, {
              issue_date: issueDate || null,
              validity_days: validityDays,
              doctor_name: doctorName || null,
              clinic_name: clinicName || null,
              drug_name: d.drug_name || null,
              dosage: d.dosage || null,
            })
          )
      );

      // Создаём новые (добавленные вручную)
      await Promise.all(
        drugs
          .filter((d) => !existingIds.has(d.id) && d.drug_name.trim())
          .map((d) =>
            api.post("/api/v1/prescriptions", {
              doc_type: first?.doc_type ?? "recipe_107",
              doctor_name: doctorName || "Не указан",
              clinic_name: clinicName || null,
              issue_date: issueDate,
              validity_days: validityDays,
              drug_name: d.drug_name,
              dosage: d.dosage || null,
            })
          )
      );

      void queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
      onSave();
    } finally {
      setSaving(false);
    }
  }

  const fieldStyle: React.CSSProperties = {
    height: 40, padding: "0 12px",
    borderRadius: "var(--r-sm)",
    border: "1.5px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text-primary)",
    fontSize: 14, fontFamily: "inherit", fontWeight: 500,
    outline: "none", width: "100%", boxSizing: "border-box",
    transition: "border-color 0.15s",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 11, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.06em",
    color: "var(--text-secondary)", marginBottom: 6,
  };

  return (
    <>
      {imgExpanded && imgUrl && (
        <div onClick={() => setImgExpanded(false)} style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(10,10,20,0.88)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out",
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgUrl} alt="Фото рецепта" style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: "var(--r-md)", boxShadow: "var(--shadow-lg)" }}/>
          <button onClick={(e) => { e.stopPropagation(); setImgExpanded(false); }} style={{
            position: "absolute", top: 16, right: 16, width: 36, height: 36, borderRadius: "50%",
            background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)",
            color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <X style={{ width: 16, height: 16 }}/>
          </button>
        </div>
      )}

      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-md)",
        overflow: "hidden", animation: "bpSlideIn 0.4s cubic-bezier(0.16,1,0.3,1)",
      }}>
        {/* Шапка */}
        <div style={{
          padding: "11px 20px", background: "var(--surface-subtle)",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Статус-точки */}
            <div style={{ display: "flex", gap: 4 }}>
              {savedStatuses.map((saved, i) => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: saved ? "var(--green-text)" : i === current - 1 ? "var(--accent)" : "var(--border)",
                  transition: "background 0.2s",
                }}/>
              ))}
            </div>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {savedCount} из {total} сохранено
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "3px 10px",
              borderRadius: "var(--r-pill)",
              background: "var(--purple-bg)", color: "var(--purple-text)",
            }}>Рецепт</span>
            {isSaved && (
              <span style={{ fontSize: 11, color: "var(--green-text)", fontWeight: 600 }}>✓ Сохранён</span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 0 }}>
          {/* Фото рецепта */}
          <div style={{ width: 160, flexShrink: 0, borderRight: "1px solid var(--border)", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{
              width: "100%", aspectRatio: "3/4",
              background: "var(--surface-subtle)", borderRadius: "var(--r-sm)",
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden", position: "relative", cursor: imgUrl ? "zoom-in" : "default",
            }} onClick={() => imgUrl && setImgExpanded(true)}>
              {imgUrl
                ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgUrl} alt="Рецепт" style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
                )
                : (
                  <div style={{ textAlign: "center", padding: 8 }}>
                    <div style={{ fontSize: 28, marginBottom: 4 }}>📋</div>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Нет фото</span>
                  </div>
                )
              }
              {imgUrl && (
                <div style={{
                  position: "absolute", bottom: 6, right: 6,
                  background: "rgba(0,0,0,0.5)", borderRadius: "var(--r-sm)",
                  padding: "3px 7px", fontSize: 11, color: "#fff",
                }}>
                  <ZoomIn style={{ width: 12, height: 12 }}/>
                </div>
              )}
            </div>
            <span style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
              {first?.doc_type?.replace("recipe_", "Форма ").replace("doc_", "Форма ") ?? "Рецепт"}
            </span>
          </div>

          {/* Поля */}
          <div style={{ flex: 1, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Дата и срок */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Дата выписки</label>
                <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)}
                  style={fieldStyle}
                  onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--border)")}/>
              </div>
              <div>
                <label style={labelStyle}>Срок действия</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {([60, 365] as const).map((v) => (
                    <button key={v}
                      onClick={() => setValidityDays(v)}
                      style={{
                        flex: 1, height: 40, borderRadius: "var(--r-sm)",
                        border: `1.5px solid ${validityDays === v ? "var(--accent)" : "var(--border)"}`,
                        background: validityDays === v ? "var(--accent-bg)" : "var(--surface)",
                        color: validityDays === v ? "var(--accent)" : "var(--text-secondary)",
                        fontFamily: "inherit", fontWeight: 600, fontSize: 13,
                        cursor: "pointer", transition: "all 0.15s",
                      }}>
                      {v === 60 ? "60 дней" : "1 год"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Врач и клиника */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Врач</label>
                <input value={doctorName} onChange={(e) => setDoctorName(e.target.value)}
                  placeholder="Фамилия И.О." style={fieldStyle}
                  onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--border)")}/>
              </div>
              <div>
                <label style={labelStyle}>Мед. организация</label>
                <input value={clinicName} onChange={(e) => setClinicName(e.target.value)}
                  placeholder="Название клиники" style={fieldStyle}
                  onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--border)")}/>
              </div>
            </div>

            {/* Препараты */}
            <div>
              <label style={labelStyle}>Препараты ({drugs.length})</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {drugs.map((d, i) => (
                  <div key={d.id} style={{
                    display: "grid", gridTemplateColumns: "1fr 1fr auto",
                    gap: 6, alignItems: "center",
                    padding: "8px 10px",
                    background: "var(--surface-subtle)",
                    borderRadius: "var(--r-sm)",
                    border: "1px solid var(--border-light)",
                  }}>
                    <input
                      value={d.drug_name}
                      onChange={(e) => updateDrug(i, "drug_name", e.target.value)}
                      placeholder="Наименование препарата"
                      style={{ ...fieldStyle, height: 34, fontSize: 13 }}
                      onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                      onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                    />
                    <input
                      value={d.dosage}
                      onChange={(e) => updateDrug(i, "dosage", e.target.value)}
                      placeholder="Дозировка / назначение"
                      style={{ ...fieldStyle, height: 34, fontSize: 13 }}
                      onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                      onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                    />
                    <button onClick={() => removeDrug(i)} disabled={drugs.length === 1}
                      style={{
                        width: 32, height: 34, border: "none", cursor: drugs.length === 1 ? "not-allowed" : "pointer",
                        background: "transparent", color: drugs.length === 1 ? "var(--text-disabled)" : "var(--red-text)",
                        borderRadius: "var(--r-sm)", display: "flex", alignItems: "center", justifyContent: "center",
                        opacity: drugs.length === 1 ? 0.4 : 1,
                      }}>
                      <X style={{ width: 14, height: 14 }}/>
                    </button>
                  </div>
                ))}
                <button onClick={addDrug} style={{
                  height: 34, border: "1.5px dashed var(--border)", background: "transparent",
                  borderRadius: "var(--r-sm)", cursor: "pointer", fontSize: 13,
                  color: "var(--accent)", fontFamily: "inherit", fontWeight: 600,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}>
                  + Добавить препарат
                </button>
              </div>
            </div>

            <div style={{ flex: 1 }}/>

            {/* Кнопки */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button onClick={() => { void handleSave(); }} disabled={saving} style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                height: 40, padding: "0 22px", borderRadius: "var(--r-sm)",
                background: saving ? "var(--accent-mid)" : "var(--accent)",
                color: "#fff", border: "none",
                cursor: saving ? "not-allowed" : "pointer",
                fontSize: 14, fontWeight: 600, fontFamily: "inherit",
                boxShadow: "var(--shadow-accent)",
              }}>
                {saving
                  ? <><LoaderCircle style={{ width: 16, height: 16 }} className="animate-spin"/>Сохранение...</>
                  : <><Check style={{ width: 16, height: 16 }}/>Сохранить рецепт</>}
              </button>
              <button onClick={onCancel} disabled={saving} style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                height: 40, padding: "0 16px", borderRadius: "var(--r-sm)",
                background: "var(--surface)", color: "var(--text-secondary)",
                border: "1.5px solid var(--border)",
                cursor: saving ? "not-allowed" : "pointer",
                fontSize: 14, fontWeight: 500, fontFamily: "inherit",
              }}>
                <X style={{ width: 14, height: 14 }}/>Отменить
              </button>
              <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                <button onClick={onPrev} disabled={saving || current === 1} style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  height: 40, padding: "0 14px", borderRadius: "var(--r-sm)",
                  background: "var(--surface)", border: `1.5px solid ${current === 1 ? "var(--border-light)" : "var(--border)"}`,
                  color: current === 1 ? "var(--text-disabled)" : "var(--text-secondary)",
                  cursor: (saving || current === 1) ? "not-allowed" : "pointer",
                  fontSize: 14, fontWeight: 500, fontFamily: "inherit", opacity: current === 1 ? 0.5 : 1,
                }}>
                  <ArrowLeft style={{ width: 15, height: 15 }}/> Предыдущий
                </button>
                <button onClick={onNext} disabled={saving || current === total} style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  height: 40, padding: "0 14px", borderRadius: "var(--r-sm)",
                  background: "var(--surface)", border: `1.5px solid ${current === total ? "var(--border-light)" : "var(--border)"}`,
                  color: current === total ? "var(--text-disabled)" : "var(--text-secondary)",
                  cursor: (saving || current === total) ? "not-allowed" : "pointer",
                  fontSize: 14, fontWeight: 500, fontFamily: "inherit", opacity: current === total ? 0.5 : 1,
                }}>
                  Следующий <ArrowRight style={{ width: 15, height: 15 }}/>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes bpSlideIn {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}

/* ─────────── Главный компонент ─────────── */
type Phase = "processing" | "reviewing" | "done";

export function BatchProgress() {
  const activeBatch  = useBatchStore((s) => s.activeBatch);
  const totalFiles   = useBatchStore((s) => s.totalFiles);
  const doneCount    = useBatchStore((s) => s.doneCount);
  const reviewCount  = useBatchStore((s) => s.reviewCount);
  const failedCount  = useBatchStore((s) => s.failedCount);
  const completed    = useBatchStore((s) => s.completed);
  const clearBatch   = useBatchStore((s) => s.clearBatch);

  const queryClient = useQueryClient();

  const [phase, setPhase]             = useState<Phase>("processing");
  const [queue, setQueue]             = useState<QueueItem[]>([]);
  const [reviewIdx, setReviewIdx]     = useState(0);
  const [savedIds, setSavedIds]       = useState<Set<string>>(new Set());
  const [draftMap, setDraftMap]       = useState<Record<string, Draft>>({});
  const [detailMap, setDetailMap]     = useState<Record<string, ReceiptDetail>>({});
  const [rxDraftMap, setRxDraftMap]   = useState<Record<string, PrescriptionDraft>>({});

  useBatchSSE(activeBatch);

  /* Когда завершилось — загружаем чеки И рецепты на проверку */
  useEffect(() => {
    if (!completed) return;

    const timer = setTimeout(async () => {
      try {
        const [receiptsData, rxData] = await Promise.all([
          api.get<ReceiptListResponse>(`/api/v1/receipts?batch_id=${activeBatch}`),
          api.get<PrescriptionListResponse>(`/api/v1/prescriptions?batch_id=${activeBatch}`),
        ]);

        const receipts = receiptsData.months.flatMap((m) => m.receipts);

        // Группируем рецепты по s3_key (один бланк = несколько препаратов)
        const rxGroups = new Map<string, Prescription[]>();
        for (const p of rxData.items) {
          const key = p.s3_key ?? p.id; // fallback: каждый отдельно
          if (!rxGroups.has(key)) rxGroups.set(key, []);
          rxGroups.get(key)!.push(p);
        }

        // Строим единую очередь: сначала чеки, потом рецепты
        const newQueue: QueueItem[] = [
          ...receipts.map((item): QueueItem => ({ kind: "receipt", id: item.id, item })),
          ...[...rxGroups.entries()].map(([key, items]): QueueItem => ({ kind: "prescription", id: key, items })),
        ];

        setQueue(newQueue);
        setSavedIds(new Set());
        setDraftMap({});
        setDetailMap({});
        setRxDraftMap({});
        setReviewIdx(0);
        setPhase(newQueue.length > 0 ? "reviewing" : "done");
        if (newQueue.length === 0) setTimeout(() => clearBatch(), 2500);
      } catch {
        setPhase("done");
        setTimeout(() => clearBatch(), 2500);
      }
    }, 500);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed]);

  if (!activeBatch) return null;

  const processed = doneCount + reviewCount + failedCount;

  /* ── Сканирование — анимация только в верхнем пайплайне ── */
  if (phase === "processing") {
    return null;
  }

  /* ── Всё готово, нечего проверять ── */
  if (phase === "done") {
    return <DoneCard doneCount={doneCount} failedCount={failedCount}/>;
  }

  /* ── Проверка ── */
  const currentQueueItem = queue[reviewIdx];
  if (!currentQueueItem) {
    clearBatch();
    return null;
  }

  function handleSave() {
    const id = currentQueueItem.id;
    const newSaved = new Set(savedIds);
    newSaved.add(id);
    setSavedIds(newSaved);
    void queryClient.invalidateQueries({ queryKey: ["receipts-list"] });
    void queryClient.invalidateQueries({ queryKey: ["prescriptions"] });

    if (newSaved.size >= queue.length) {
      setPhase("done");
      setTimeout(() => clearBatch(), 2500);
      return;
    }

    for (let i = 1; i <= queue.length; i++) {
      const candidate = (reviewIdx + i) % queue.length;
      if (!newSaved.has(queue[candidate].id)) {
        setReviewIdx(candidate);
        break;
      }
    }
  }

  function handleNext() {
    if (reviewIdx + 1 < queue.length) setReviewIdx(reviewIdx + 1);
  }

  function handlePrev() {
    if (reviewIdx - 1 >= 0) setReviewIdx(reviewIdx - 1);
  }

  function handleCancel() {
    clearBatch();
  }

  const savedStatuses = queue.map((qi) => savedIds.has(qi.id));

  return (
    <div>
      {currentQueueItem.kind === "receipt" ? (
        <InlineReviewCard
          key={currentQueueItem.id}
          item={currentQueueItem.item}
          current={reviewIdx + 1}
          total={queue.length}
          savedCount={savedIds.size}
          savedStatuses={savedStatuses}
          isSaved={savedIds.has(currentQueueItem.id)}
          onSave={handleSave}
          onNext={handleNext}
          onPrev={handlePrev}
          onCancel={handleCancel}
          draft={draftMap[currentQueueItem.id]}
          cachedDetail={detailMap[currentQueueItem.id]}
          onDraftChange={(d) => setDraftMap((prev) => ({ ...prev, [currentQueueItem.id]: d }))}
          onDetailFetched={(d) => setDetailMap((prev) => ({ ...prev, [currentQueueItem.id]: d }))}
        />
      ) : (
        <InlinePrescriptionReviewCard
          key={currentQueueItem.id}
          items={currentQueueItem.items}
          current={reviewIdx + 1}
          total={queue.length}
          savedCount={savedIds.size}
          savedStatuses={savedStatuses}
          isSaved={savedIds.has(currentQueueItem.id)}
          onSave={handleSave}
          onNext={handleNext}
          onPrev={handlePrev}
          onCancel={handleCancel}
          draft={rxDraftMap[currentQueueItem.id]}
          onDraftChange={(d) => setRxDraftMap((prev) => ({ ...prev, [currentQueueItem.id]: d }))}
        />
      )}
    </div>
  );
}
