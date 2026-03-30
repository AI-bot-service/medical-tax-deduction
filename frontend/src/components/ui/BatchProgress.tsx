"use client";

import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBatchStore } from "@/lib/store";
import { useBatchSSE } from "@/hooks/useBatchSSE";
import { api } from "@/lib/api";
import {
  CheckCircle2, AlertCircle, LoaderCircle,
  ZoomIn, ImageOff, X, Check, ArrowRight, ArrowLeft,
} from "lucide-react";
import type { ReceiptListResponse, ReceiptListItem, ReceiptDetail } from "@/types/api";

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
          ИИ распознаёт чеки
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
function InlineReviewCard({
  item, current, total,
  onSave, onNext, onPrev,
}: {
  item: ReceiptListItem; current: number; total: number;
  onSave: () => void; onNext: () => void; onPrev: () => void;
}) {
  const [detail, setDetail] = useState<ReceiptDetail | null>(null);
  const [date, setDate] = useState(item.purchase_date ?? "");
  const [pharmacy, setPharmacy] = useState(item.pharmacy_name ?? "");
  const [amount, setAmount] = useState(item.total_amount ?? "");
  const [saving, setSaving] = useState(false);
  const [imgExpanded, setImgExpanded] = useState(false);
  // Редактирование названий позиций: id → новое название
  const [itemEdits, setItemEdits] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  useEffect(() => {
    setDate(item.purchase_date ?? "");
    setPharmacy(item.pharmacy_name ?? "");
    setAmount(item.total_amount ?? "");
    setItemEdits({});
    setDetail(null);
    void api.get<ReceiptDetail>(`/api/v1/receipts/${item.id}`).then((d) => {
      setDetail(d);
      setDate(d.purchase_date ?? item.purchase_date ?? "");
      setPharmacy(d.pharmacy_name ?? item.pharmacy_name ?? "");
      setAmount(d.total_amount ?? item.total_amount ?? "");
    });
  }, [item.id, item.purchase_date, item.pharmacy_name, item.total_amount]);

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
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 10px", borderRadius: "var(--r-pill)",
            fontSize: 11, fontWeight: 700,
            background: "var(--yellow-bg)", color: "var(--yellow-text)",
          }}>
            <AlertCircle style={{ width: 11, height: 11 }}/>
            Проверьте данные
          </span>

          {/* Прогресс-точки */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", gap: 4 }}>
              {Array.from({ length: Math.min(total, 7) }).map((_, i) => (
                <div key={i} style={{
                  height: 5, borderRadius: 3,
                  width: i === current - 1 ? 16 : 5,
                  background: i < current - 1 ? "var(--green)" : i === current - 1 ? "var(--accent)" : "var(--border)",
                  transition: "all 250ms var(--ease-spring)",
                }}/>
              ))}
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
              {current} / {total}
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
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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

  const [phase, setPhase]           = useState<Phase>("processing");
  const [reviewItems, setReviewItems] = useState<ReceiptListItem[]>([]);
  const [reviewIdx, setReviewIdx]   = useState(0);

  useBatchSSE(activeBatch);

  /* Когда завершилось — всегда показываем проверку данных */
  useEffect(() => {
    if (!completed) return;

    // Небольшая задержка, чтобы БД успела записать данные
    const timer = setTimeout(() => {
      void api.get<ReceiptListResponse>("/api/v1/receipts")
        .then((data) => {
          // Берём самые свежие записи — ровно столько, сколько загрузили
          const all = data.months.flatMap((m) => m.receipts);
          const items = all.slice(0, totalFiles);
          setReviewItems(items);
          setReviewIdx(0);
          setPhase(items.length > 0 ? "reviewing" : "done");
          if (items.length === 0) setTimeout(() => clearBatch(), 2500);
        })
        .catch(() => {
          setPhase("done");
          setTimeout(() => clearBatch(), 2500);
        });
    }, 500);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed]);

  if (!activeBatch) return null;

  const processed = doneCount + reviewCount + failedCount;

  /* ── Сканирование ── */
  if (phase === "processing") {
    return <ScanningCard processed={processed} total={totalFiles}/>;
  }

  /* ── Всё готово, нечего проверять ── */
  if (phase === "done") {
    return <DoneCard doneCount={doneCount} failedCount={failedCount}/>;
  }

  /* ── Проверка ── */
  const currentItem = reviewItems[reviewIdx];
  if (!currentItem) {
    clearBatch();
    return null;
  }

  function handleSave() {
    void queryClient.invalidateQueries({ queryKey: ["receipts-list"] });
    const nextIdx = reviewIdx + 1;
    if (nextIdx >= reviewItems.length) {
      // Авто-подтверждаем все чеки, которые были пропущены (не сохранены явно)
      reviewItems
        .filter((_, idx) => idx !== reviewIdx)
        .forEach((skipped) => {
          void api.patch(`/api/v1/receipts/${skipped.id}`, {});
        });
      setPhase("done");
      setTimeout(() => clearBatch(), 2500);
    } else {
      setReviewIdx(nextIdx);
    }
  }

  function handleNext() {
    const nextIdx = reviewIdx + 1;
    if (nextIdx >= reviewItems.length) {
      clearBatch();
    } else {
      setReviewIdx(nextIdx);
    }
  }

  function handlePrev() {
    const prevIdx = reviewIdx - 1;
    if (prevIdx >= 0) {
      setReviewIdx(prevIdx);
    }
  }

  return (
    <div>
      <InlineReviewCard
        key={currentItem.id}
        item={currentItem}
        current={reviewIdx + 1}
        total={reviewItems.length}
        onSave={handleSave}
        onNext={handleNext}
        onPrev={handlePrev}
      />
    </div>
  );
}
