"use client";

/**
 * MockDuplicateComparison — статичный демо-блок для страницы дублей.
 * Показывает две карточки редактирования чека рядом (оригинал из БД слева,
 * моковые данные справа). Используется для прототипирования UI сравнения.
 */

import { useRef, useState } from "react";
import type { ReceiptDetail } from "@/types/api";

// ---------------------------------------------------------------------------
// Моковые данные — "оригинал из БД"
// ---------------------------------------------------------------------------

const MOCK_ORIGINAL: ReceiptDetail = {
  id: "a1b2c3d4-0001-0000-0000-000000000001",
  ocr_status: "DONE",
  purchase_date: "2025-03-14",
  pharmacy_name: "Аптека 36.6 (ул. Ленина, 42)",
  total_amount: "2847.50",
  ocr_confidence: 0.97,
  merge_strategy: null,
  needs_prescription: true,
  fiscal_fn: "9960440300551842",
  fiscal_fd: "127453",
  duplicate_of_id: null,
  image_url: null,
  created_at: "2025-03-14T10:22:31Z",
  items: [
    {
      id: "item-0001-0001",
      drug_name: "Амоксиклав 875мг+125мг таб. №14",
      drug_inn: "амоксициллин+клавулановая кислота",
      quantity: 1,
      unit_price: "687.00",
      total_price: "687.00",
      is_rx: true,
      prescription_id: null,
    },
    {
      id: "item-0001-0002",
      drug_name: "Нурофен Экспресс 400мг капс. №10",
      drug_inn: "ибупрофен",
      quantity: 2,
      unit_price: "310.25",
      total_price: "620.50",
      is_rx: false,
      prescription_id: null,
    },
    {
      id: "item-0001-0003",
      drug_name: "Линекс Форте капс. №14",
      drug_inn: "лакто- и бифидобактерии",
      quantity: 1,
      unit_price: "540.00",
      total_price: "540.00",
      is_rx: false,
      prescription_id: null,
    },
    {
      id: "item-0001-0004",
      drug_name: "Аквамарис Норм спрей 125мл",
      drug_inn: "вода морская",
      quantity: 1,
      unit_price: "330.00",
      total_price: "330.00",
      is_rx: false,
      prescription_id: null,
    },
    {
      id: "item-0001-0005",
      drug_name: "Витамин Д3 2000МЕ капли 30мл",
      drug_inn: "колекальциферол",
      quantity: 1,
      unit_price: "670.00",
      total_price: "670.00",
      is_rx: false,
      prescription_id: null,
    },
  ],
};

// ---------------------------------------------------------------------------
// Моковые данные — "новый загруженный" (slight OCR-отличия)
// ---------------------------------------------------------------------------

const MOCK_DUPLICATE: ReceiptDetail = {
  id: "a1b2c3d4-0002-0000-0000-000000000002",
  ocr_status: "DUPLICATE_REVIEW",
  purchase_date: "2025-03-14",
  pharmacy_name: "Аптека 36.6 (ул.Ленина д.42)",
  total_amount: "2847.50",
  ocr_confidence: 0.83,
  merge_strategy: null,
  needs_prescription: true,
  fiscal_fn: "9960440300551842",
  fiscal_fd: "127453",
  duplicate_of_id: "a1b2c3d4-0001-0000-0000-000000000001",
  image_url: null,
  created_at: "2025-03-15T09:05:10Z",
  items: [
    {
      id: "item-0002-0001",
      drug_name: "Амоксиклав 875мг+125мг №14",
      drug_inn: "амоксициллин+клавулановая к-та",
      quantity: 1,
      unit_price: "687.00",
      total_price: "687.00",
      is_rx: true,
      prescription_id: null,
    },
    {
      id: "item-0002-0002",
      drug_name: "Нурофен Экспресс 400мг №10",
      drug_inn: "ибупрофен",
      quantity: 2,
      unit_price: "310.25",
      total_price: "620.50",
      is_rx: false,
      prescription_id: null,
    },
    {
      id: "item-0002-0003",
      drug_name: "Линекс Форте №14",
      drug_inn: null,
      quantity: 1,
      unit_price: "540.00",
      total_price: "540.00",
      is_rx: false,
      prescription_id: null,
    },
    {
      id: "item-0002-0004",
      drug_name: "Аквамарис спрей 125мл",
      drug_inn: "вода морская",
      quantity: 1,
      unit_price: "330.00",
      total_price: "330.00",
      is_rx: false,
      prescription_id: null,
    },
    {
      id: "item-0002-0005",
      drug_name: "Вит.Д3 2000МЕ капли 30мл",
      drug_inn: "колекальциферол",
      quantity: 1,
      unit_price: "670.00",
      total_price: "670.00",
      is_rx: false,
      prescription_id: null,
    },
  ],
};

// ---------------------------------------------------------------------------
// Утилиты
// ---------------------------------------------------------------------------

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatRub(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const n = typeof amount === "number" ? amount : parseFloat(amount as string);
  if (isNaN(n)) return "—";
  return n.toLocaleString("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Состояние карточки
// ---------------------------------------------------------------------------

interface CardState {
  purchase_date: string;
  pharmacy_name: string;
  total_amount: string;
  fiscal_fn: string;
  fiscal_fd: string;
  items: Array<{
    id: string;
    drug_name: string;
    drug_inn: string | null;
    quantity: number;
    unit_price: string;
    total_price: string;
    is_rx: boolean;
  }>;
}

function initCard(r: ReceiptDetail): CardState {
  return {
    purchase_date: r.purchase_date ?? "",
    pharmacy_name: r.pharmacy_name ?? "",
    total_amount: r.total_amount ? parseFloat(r.total_amount).toFixed(2) : "",
    fiscal_fn: r.fiscal_fn ?? "",
    fiscal_fd: r.fiscal_fd ?? "",
    items: r.items.map(it => ({
      id: it.id,
      drug_name: it.drug_name,
      drug_inn: it.drug_inn,
      quantity: it.quantity,
      unit_price: parseFloat(it.unit_price).toFixed(2),
      total_price: parseFloat(it.total_price).toFixed(2),
      is_rx: it.is_rx,
    })),
  };
}

// ---------------------------------------------------------------------------
// Lightbox / зум фото
// ---------------------------------------------------------------------------

function ImageModal({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "clamp(320px, 46vw, 680px)",
        height: "100vh",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        boxShadow: "4px 0 24px rgba(0,0,0,0.18)",
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
          🧾 Фото чека
        </span>
        <button
          onClick={onClose}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: "var(--r-sm)",
            border: "1px solid var(--border)",
            background: "var(--bg)",
            cursor: "pointer",
            fontSize: "16px",
            color: "var(--text-secondary)",
            fontFamily: "Urbanist, sans-serif",
            lineHeight: 1,
            flexShrink: 0,
          }}
          title="Закрыть"
        >
          ✕
        </button>
      </div>

      {/* Image scroll area */}
      <div style={{
        flex: 1,
        overflow: "auto",
        padding: "12px",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Фото чека"
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--border)",
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Иконка корзины
// ---------------------------------------------------------------------------

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 3.5h10M5.5 3.5V2.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1M5 3.5l.5 8M7 3.5v8M9 3.5l-.5 8M3.5 3.5l.5 8.5a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5l.5-8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Карточка чека
// ---------------------------------------------------------------------------

function ReceiptEditCard({
  title,
  accentColor,
  accentBg,
  dotColor,
  data,
  readOnly,
  state,
  onChange,
  onZoom,
}: {
  title: string;
  accentColor: string;
  accentBg: string;
  dotColor: string;
  data: ReceiptDetail;
  readOnly: boolean;
  state: CardState;
  onChange?: (s: CardState) => void;
  onZoom?: (src: string) => void;
}) {
  const INPUT: React.CSSProperties = {
    width: "100%",
    padding: "7px 10px",
    fontSize: 13,
    color: "var(--text-primary)",
    background: "var(--bg)",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--r-sm)",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "Urbanist, sans-serif",
  };

  const READ: React.CSSProperties = {
    padding: "7px 10px",
    fontSize: 13,
    color: "var(--text-primary)",
    background: "var(--surface-subtle)",
    border: "1px solid var(--border-light)",
    borderRadius: "var(--r-sm)",
    minHeight: 34,
    display: "flex",
    alignItems: "center",
  };

  const LABEL: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    marginBottom: 5,
    display: "block",
  };

  function setField(field: keyof Omit<CardState, "items">, value: string) {
    onChange?.({ ...state, [field]: value });
  }

  function updateItem(idx: number, patch: Partial<CardState["items"][number]>) {
    const items = state.items.map((it, i) => i === idx ? { ...it, ...patch } : it);
    onChange?.({ ...state, items });
  }

  const deletingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  function addItem() {
    const newItem = {
      id: `new-${Date.now()}`,
      drug_name: "Новое лекарство",
      drug_inn: null,
      quantity: 1,
      unit_price: "0.00",
      total_price: "0.00",
      is_rx: false,
    };
    onChange?.({ ...state, items: [...state.items, newItem] });
  }

  function deleteItem(id: string) {
    if (deletingIds.has(id)) return;
    setDeletingIds(prev => new Set(prev).add(id));
    deletingTimers.current[id] = setTimeout(() => {
      onChange?.({ ...state, items: state.items.filter(it => it.id !== id) });
      setDeletingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
      delete deletingTimers.current[id];
    }, 300);
  }

  const total = state.items.reduce((acc, it) => acc + it.quantity * parseFloat(it.unit_price || "0"), 0);

  // grid columns: название + МНН + цена + (корзина если редактируемый)
  const gridCols = readOnly ? "1fr 80px 72px" : "1fr 80px 72px 30px";

  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      background: "var(--surface)",
      border: `1.5px solid ${readOnly ? "rgba(34,197,94,0.25)" : "rgba(245,158,11,0.3)"}`,
      borderRadius: "var(--r-lg)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    }}>

      {/* ── Шапка ── */}
      <div style={{
        padding: "10px 14px",
        background: accentBg,
        borderBottom: `1px solid ${readOnly ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)"}`,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <span style={{
          width: 8, height: 8,
          borderRadius: "50%",
          background: dotColor,
          display: "inline-block",
          flexShrink: 0,
          boxShadow: `0 0 0 2px ${accentBg}, 0 0 0 3px ${dotColor}40`,
        }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: accentColor, textTransform: "uppercase", letterSpacing: "0.07em" }}>
          {title}
        </span>
        {data.ocr_confidence != null && (
          <span style={{
            marginLeft: "auto",
            fontSize: 11, fontWeight: 700,
            color: data.ocr_confidence > 0.9 ? "#16A34A" : data.ocr_confidence > 0.75 ? "#D97706" : "#DC2626",
            background: data.ocr_confidence > 0.9 ? "rgba(34,197,94,0.1)" : data.ocr_confidence > 0.75 ? "rgba(245,158,11,0.1)" : "rgba(220,38,38,0.1)",
            padding: "2px 8px",
            borderRadius: "var(--r-pill)",
          }}>
            OCR {Math.round(data.ocr_confidence * 100)}%
          </span>
        )}
      </div>

      {/* ── Фото ── */}
      <div
        style={{
          height: 160,
          background: "var(--bg)",
          borderBottom: "1px solid var(--border-light)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          cursor: data.image_url ? "zoom-in" : "default",
        }}
        onClick={() => { if (data.image_url && onZoom) onZoom(data.image_url); }}
        title={data.image_url ? "Нажмите чтобы открыть" : undefined}
      >
        {data.image_url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.image_url}
              alt="Фото чека"
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
            <div
              style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(0,0,0,0)",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(0,0,0,0.18)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(0,0,0,0)"; }}
            >
              <span style={{
                fontSize: "12px", fontWeight: 700,
                color: "#fff",
                background: "rgba(0,0,0,0.45)",
                padding: "4px 12px",
                borderRadius: "var(--r-pill)",
                pointerEvents: "none",
              }}>
                🔍 Открыть
              </span>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: "var(--text-muted)" }}>
            <span style={{ fontSize: 28 }}>🧾</span>
            <span style={{ fontSize: 12 }}>Нет фото</span>
          </div>
        )}
      </div>

      {/* ── Данные чека ── */}
      <div style={{ padding: "14px 14px 0" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 10 }}>
          Данные чека
        </div>

        {/* 2-column grid: дата + аптека */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 12px", marginBottom: 10 }}>
          <div>
            <label style={LABEL}>Дата покупки</label>
            {readOnly ? (
              <div style={READ}>{formatDate(state.purchase_date) || <span style={{ color: "var(--text-muted)" }}>—</span>}</div>
            ) : (
              <input
                type="date"
                value={state.purchase_date}
                onChange={e => setField("purchase_date", e.target.value)}
                style={INPUT}
                onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                onBlur={e => (e.currentTarget.style.borderColor = "var(--border-strong)")}
              />
            )}
          </div>
          <div>
            <label style={LABEL}>Аптека</label>
            {readOnly ? (
              <div style={READ}>{state.pharmacy_name || <span style={{ color: "var(--text-muted)" }}>—</span>}</div>
            ) : (
              <input
                type="text"
                value={state.pharmacy_name}
                onChange={e => setField("pharmacy_name", e.target.value)}
                placeholder="Название аптеки"
                style={{
                  ...INPUT,
                  borderColor: state.pharmacy_name !== MOCK_ORIGINAL.pharmacy_name ? "rgba(245,158,11,0.5)" : "var(--border-strong)",
                }}
                onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                onBlur={e => (e.currentTarget.style.borderColor = state.pharmacy_name !== MOCK_ORIGINAL.pharmacy_name ? "rgba(245,158,11,0.5)" : "var(--border-strong)")}
              />
            )}
          </div>
          <div>
            <label style={LABEL}>ФН</label>
            {readOnly ? (
              <div style={READ}>{state.fiscal_fn || <span style={{ color: "var(--text-muted)" }}>—</span>}</div>
            ) : (
              <input
                type="text"
                value={state.fiscal_fn}
                onChange={e => setField("fiscal_fn", e.target.value)}
                placeholder="Фискальный накопитель"
                style={INPUT}
                onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                onBlur={e => (e.currentTarget.style.borderColor = "var(--border-strong)")}
              />
            )}
          </div>
          <div>
            <label style={LABEL}>ФД</label>
            {readOnly ? (
              <div style={READ}>{state.fiscal_fd || <span style={{ color: "var(--text-muted)" }}>—</span>}</div>
            ) : (
              <input
                type="text"
                value={state.fiscal_fd}
                onChange={e => setField("fiscal_fd", e.target.value)}
                placeholder="Фискальный документ"
                style={INPUT}
                onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                onBlur={e => (e.currentTarget.style.borderColor = "var(--border-strong)")}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Лекарства ── */}
      <div style={{ padding: "0 14px", flex: 1 }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
          paddingTop: 2,
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
            Лекарства
          </span>
          {!readOnly ? (
            <button
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--accent)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                fontFamily: "Urbanist, sans-serif",
              }}
              onClick={addItem}
            >
              + Добавить
            </button>
          ) : (
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{state.items.length} поз.</span>
          )}
        </div>

        {/* Заголовок таблицы */}
        <div style={{
          display: "grid",
          gridTemplateColumns: gridCols,
          padding: "5px 8px",
          background: "var(--bg)",
          borderRadius: "var(--r-sm) var(--r-sm) 0 0",
          borderBottom: "1px solid var(--border-light)",
        }}>
          {["Название", "МНН", "Цена/ед.", ...(readOnly ? [] : [""])].map((h, i) => (
            <span key={i} style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {h}
            </span>
          ))}
        </div>

        {/* Строки */}
        <div style={{
          border: "1px solid var(--border-light)",
          borderTop: "none",
          borderRadius: "0 0 var(--r-sm) var(--r-sm)",
          overflow: "hidden",
        }}>
          {state.items.map((item, idx) => {
            const isDeleting = deletingIds.has(item.id);
            return (
            <div
              key={item.id}
              style={{
                display: "grid",
                gridTemplateColumns: gridCols,
                padding: "7px 8px",
                borderTop: idx > 0 ? "1px solid var(--border-light)" : "none",
                background: isDeleting ? "var(--red-bg)" : "var(--surface)",
                opacity: isDeleting ? 0.5 : 1,
                transition: "background 0.2s, opacity 0.2s",
                alignItems: "center",
              }}
            >
              {/* Название */}
              <div style={{ paddingRight: 6, overflow: "hidden" }}>
                {readOnly ? (
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.drug_name}
                    {item.is_rx && <span style={{ marginLeft: 5, fontSize: 10, color: "var(--purple-text)", fontWeight: 700 }}>Rx</span>}
                  </span>
                ) : (
                  <input
                    type="text"
                    value={item.drug_name}
                    onChange={e => updateItem(idx, { drug_name: e.target.value })}
                    style={{
                      width: "100%",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      background: "transparent",
                      border: "1px solid transparent",
                      borderRadius: "var(--r-sm)",
                      padding: "2px 4px",
                      outline: "none",
                      fontFamily: "Urbanist, sans-serif",
                      boxSizing: "border-box",
                    }}
                    onFocus={e => { e.currentTarget.style.background = "var(--bg)"; e.currentTarget.style.borderColor = "var(--accent)"; }}
                    onBlur={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}
                  />
                )}
              </div>

              {/* МНН */}
              <span style={{ fontSize: 11, color: item.drug_inn ? "var(--accent)" : "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.drug_inn ?? "—"}
              </span>

              {/* Цена */}
              {readOnly ? (
                <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, textAlign: "right" }}>
                  {formatRub(item.unit_price)}
                </span>
              ) : (
                <input
                  type="number"
                  value={item.unit_price}
                  onChange={e => updateItem(idx, { unit_price: e.target.value })}
                  style={{
                    width: "100%",
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    fontWeight: 600,
                    background: "transparent",
                    border: "1px solid transparent",
                    borderRadius: "var(--r-sm)",
                    padding: "2px 4px",
                    outline: "none",
                    fontFamily: "Urbanist, sans-serif",
                    textAlign: "right",
                    boxSizing: "border-box",
                  }}
                  onFocus={e => { e.currentTarget.style.background = "var(--bg)"; e.currentTarget.style.borderColor = "var(--accent)"; }}
                  onBlur={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}
                />
              )}

              {/* Корзина — только для редактируемой карточки */}
              {!readOnly && (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <button
                    onClick={() => deleteItem(item.id)}
                    disabled={isDeleting}
                    title="Удалить позицию"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 26,
                      height: 26,
                      borderRadius: "var(--r-sm)",
                      border: "1px solid transparent",
                      background: "transparent",
                      cursor: isDeleting ? "not-allowed" : "pointer",
                      color: "var(--text-muted)",
                      padding: 0,
                      transition: "color 0.15s, background 0.15s, border-color 0.15s",
                      opacity: isDeleting ? 0.4 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (!isDeleting) {
                        (e.currentTarget as HTMLButtonElement).style.color = "var(--red-text)";
                        (e.currentTarget as HTMLButtonElement).style.background = "var(--red-bg)";
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--red-text)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
                      (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "transparent";
                    }}
                  >
                    <TrashIcon />
                  </button>
                </div>
              )}
            </div>
            );
          })}
        </div>

        {/* Итого */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 8px",
          marginTop: 2,
        }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Итого
          </span>
          <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            {formatRub(String(total.toFixed(2)))}
          </span>
        </div>
      </div>

      {/* ── Кнопки (только для редактируемой карточки) ── */}
      {!readOnly && (
        <div style={{
          padding: "12px 14px",
          borderTop: "1px solid var(--border-light)",
          display: "flex",
          gap: 8,
          justifyContent: "flex-end",
          background: "var(--surface-subtle)",
        }}>
          <button
            className="btn btn-secondary"
            style={{ fontSize: 13 }}
            onClick={() => onChange?.(initCard(MOCK_DUPLICATE))}
          >
            Сбросить
          </button>
          <button
            className="btn btn-primary"
            style={{ fontSize: 13 }}
            onClick={() => alert("Сохранение пока не реализовано — это мок")}
          >
            Сохранить
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Основной компонент
// ---------------------------------------------------------------------------

export function MockDuplicateComparison() {
  const [origState] = useState<CardState>(() => initCard(MOCK_ORIGINAL));
  const [dupState, setDupState] = useState<CardState>(() => initCard(MOCK_DUPLICATE));
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  return (
    <div style={{ marginBottom: 32 }}>
      {/* Зум фото */}
      {zoomedImage && <ImageModal src={zoomedImage} onClose={() => setZoomedImage(null)} />}

      {/* Баннер-пояснение */}
      <div style={{
        padding: "10px 14px",
        background: "rgba(99,102,241,0.08)",
        border: "1px solid rgba(99,102,241,0.22)",
        borderRadius: "var(--r-md)",
        marginBottom: 16,
        fontSize: 12,
        color: "var(--text-secondary)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 14 }}>🧪</span>
        <span>
          <strong>Мок для разработки.</strong> Левая карточка — оригинал из БД (только чтение).
          Правая — новый загруженный чек с OCR-расхождениями (редактируется).
          Данные статичные, API не вызывается.
        </span>
      </div>

      {/* Две карточки рядом */}
      <div style={{ display: "flex", gap: 0, alignItems: "flex-start" }}>
        <ReceiptEditCard
          title="Оригинал в базе"
          accentColor="#16A34A"
          accentBg="rgba(34,197,94,0.06)"
          dotColor="#22C55E"
          data={MOCK_ORIGINAL}
          readOnly
          state={origState}
          onZoom={setZoomedImage}
        />

        {/* Разделитель — вертикальная линия на всю высоту */}
        <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)", flexShrink: 0 }} />

        <ReceiptEditCard
          title="Новый загруженный"
          accentColor="#D97706"
          accentBg="rgba(245,158,11,0.07)"
          dotColor="#F59E0B"
          data={MOCK_DUPLICATE}
          readOnly={false}
          state={dupState}
          onChange={setDupState}
          onZoom={setZoomedImage}
        />
      </div>
    </div>
  );
}
