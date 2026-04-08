"use client";

/**
 * MockDuplicateComparison — статичный демо-блок для страницы дублей.
 * Показывает две карточки редактирования чека рядом (оригинал из БД слева,
 * моковые данные справа). Используется для прототипирования UI сравнения.
 */

import { useState } from "react";
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
  pharmacy_name: "Аптека 36.6 (ул.Ленина д.42)",   // OCR: сокращения иначе
  total_amount: "2847.50",
  ocr_confidence: 0.83,
  merge_strategy: null,
  needs_prescription: true,
  fiscal_fn: "9960440300551842",
  fiscal_fd: "127453",                               // тот же ФД — сигнал дубля
  duplicate_of_id: "a1b2c3d4-0001-0000-0000-000000000001",
  image_url: null,
  created_at: "2025-03-15T09:05:10Z",
  items: [
    {
      id: "item-0002-0001",
      drug_name: "Амоксиклав 875мг+125мг №14",      // OCR: без "таб."
      drug_inn: "амоксициллин+клавулановая к-та",
      quantity: 1,
      unit_price: "687.00",
      total_price: "687.00",
      is_rx: true,
      prescription_id: null,
    },
    {
      id: "item-0002-0002",
      drug_name: "Нурофен Экспресс 400мг №10",      // OCR: без "капс."
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
      drug_inn: null,                                // OCR: INN не распознан
      quantity: 1,
      unit_price: "540.00",
      total_price: "540.00",
      is_rx: false,
      prescription_id: null,
    },
    {
      id: "item-0002-0004",
      drug_name: "Аквамарис спрей 125мл",           // OCR: без "Норм"
      drug_inn: "вода морская",
      quantity: 1,
      unit_price: "330.00",
      total_price: "330.00",
      is_rx: false,
      prescription_id: null,
    },
    {
      id: "item-0002-0005",
      drug_name: "Вит.Д3 2000МЕ капли 30мл",        // OCR: сокращение
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
// Стили
// ---------------------------------------------------------------------------

const LABEL: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 4,
};

// ---------------------------------------------------------------------------
// Поле редактируемой карточки
// ---------------------------------------------------------------------------

function FieldRow({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  readOnly = false,
  highlight = false,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  type?: string;
  placeholder?: string;
  readOnly?: boolean;
  highlight?: boolean;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={LABEL}>{label}</div>
      {readOnly ? (
        <div style={{
          fontSize: 14,
          color: "var(--text-primary)",
          fontWeight: 500,
          padding: "6px 10px",
          background: highlight ? "rgba(34,197,94,0.06)" : "var(--surface-subtle)",
          border: `1px solid ${highlight ? "rgba(34,197,94,0.25)" : "var(--border)"}`,
          borderRadius: "var(--r-sm)",
          minHeight: 34,
          display: "flex",
          alignItems: "center",
        }}>
          {value || <span style={{ color: "var(--text-muted)" }}>—</span>}
        </div>
      ) : (
        <input
          type={type}
          value={value}
          onChange={e => onChange?.(e.target.value)}
          placeholder={placeholder}
          style={{
            width: "100%",
            padding: "6px 10px",
            fontSize: 14,
            color: "var(--text-primary)",
            background: highlight ? "rgba(245,158,11,0.06)" : "var(--bg)",
            border: `1px solid ${highlight ? "rgba(245,158,11,0.4)" : "var(--border-strong)"}`,
            borderRadius: "var(--r-sm)",
            outline: "none",
            boxSizing: "border-box",
            minHeight: 34,
          }}
          onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
          onBlur={e => (e.currentTarget.style.borderColor = highlight ? "rgba(245,158,11,0.4)" : "var(--border-strong)")}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Карточка препарата
// ---------------------------------------------------------------------------

function DrugItem({
  drug_name,
  drug_inn,
  quantity,
  unit_price,
  total_price,
  is_rx,
  readOnly,
  onChange,
}: {
  drug_name: string;
  drug_inn: string | null;
  quantity: number;
  unit_price: string;
  total_price: string;
  is_rx: boolean;
  readOnly: boolean;
  onChange?: (patch: { drug_name?: string; quantity?: string; unit_price?: string; is_rx?: boolean }) => void;
}) {
  return (
    <div style={{
      padding: "8px 10px",
      background: readOnly ? "rgba(34,197,94,0.04)" : "var(--bg)",
      border: `1px solid ${readOnly ? "rgba(34,197,94,0.15)" : "var(--border)"}`,
      borderRadius: "var(--r-sm)",
      marginBottom: 6,
    }}>
      {readOnly ? (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 2 }}>
            {drug_name}
            {is_rx && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--purple-text)", fontWeight: 700 }}>Rx</span>}
          </div>
          {drug_inn && <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{drug_inn}</div>}
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {quantity} × {formatRub(unit_price)} = {formatRub(total_price)}
          </div>
        </>
      ) : (
        <>
          <input
            type="text"
            value={drug_name}
            onChange={e => onChange?.({ drug_name: e.target.value })}
            placeholder="Название препарата"
            style={{
              width: "100%", padding: "3px 7px", fontSize: 13,
              fontWeight: 600, color: "var(--text-primary)",
              background: "var(--surface-subtle)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)", outline: "none",
              boxSizing: "border-box", marginBottom: 5,
            }}
            onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
            onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
          />
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="number"
              value={quantity}
              onChange={e => onChange?.({ quantity: e.target.value })}
              style={{
                width: 60, padding: "3px 7px", fontSize: 12,
                color: "var(--text-primary)", background: "var(--surface-subtle)",
                border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
                outline: "none", boxSizing: "border-box",
              }}
              onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
              onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
            />
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>×</span>
            <input
              type="number"
              value={unit_price}
              onChange={e => onChange?.({ unit_price: e.target.value })}
              placeholder="Цена"
              style={{
                flex: 1, padding: "3px 7px", fontSize: 12,
                color: "var(--text-primary)", background: "var(--surface-subtle)",
                border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
                outline: "none", boxSizing: "border-box",
              }}
              onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
              onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
            />
            <label style={{
              display: "flex", alignItems: "center", gap: 4,
              fontSize: 11, color: "var(--text-muted)", cursor: "pointer", whiteSpace: "nowrap",
            }}>
              <input
                type="checkbox"
                checked={is_rx}
                onChange={e => onChange?.({ is_rx: e.target.checked })}
                style={{ width: 13, height: 13 }}
              />
              Rx
            </label>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Одна карточка редактирования чека
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

function ReceiptEditCard({
  title,
  titleColor,
  dotColor,
  data,
  readOnly,
  state,
  onChange,
}: {
  title: string;
  titleColor: string;
  dotColor: string;
  data: ReceiptDetail;
  readOnly: boolean;
  state: CardState;
  onChange?: (s: CardState) => void;
}) {
  function setField(field: keyof Omit<CardState, "items">, value: string) {
    onChange?.({ ...state, [field]: value });
  }

  function updateItem(idx: number, patch: Partial<CardState["items"][number]>) {
    const items = state.items.map((it, i) => i === idx ? { ...it, ...patch } : it);
    onChange?.({ ...state, items });
  }

  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--r-lg)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Заголовок */}
      <div style={{
        padding: "12px 16px",
        borderBottom: "1px solid var(--border-light)",
        background: readOnly ? "rgba(34,197,94,0.04)" : "rgba(245,158,11,0.04)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, display: "inline-block", flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: titleColor, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {title}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
          {readOnly ? "только чтение" : "редактируется"}
        </span>
      </div>

      {/* Поля */}
      <div style={{ padding: "16px", flex: 1 }}>
        {/* Нет фото */}
        <div style={{
          width: "100%", height: 140,
          background: "var(--surface-subtle)",
          border: "1px dashed var(--border)",
          borderRadius: "var(--r-sm)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--text-muted)", fontSize: 12,
          marginBottom: 16,
        }}>
          Нет фото
        </div>

        <FieldRow
          label="Аптека"
          value={state.pharmacy_name}
          readOnly={readOnly}
          onChange={v => setField("pharmacy_name", v)}
          placeholder="Название аптеки"
          highlight={state.pharmacy_name !== MOCK_ORIGINAL.pharmacy_name && !readOnly}
        />
        <FieldRow
          label="Дата"
          value={readOnly ? formatDate(state.purchase_date) : state.purchase_date}
          readOnly={readOnly}
          onChange={v => setField("purchase_date", v)}
          type={readOnly ? "text" : "date"}
        />
        <FieldRow
          label="Сумма"
          value={readOnly ? formatRub(state.total_amount) : state.total_amount}
          readOnly={readOnly}
          onChange={v => setField("total_amount", v)}
          type={readOnly ? "text" : "number"}
          placeholder="0.00"
        />
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <FieldRow
              label="ФН"
              value={state.fiscal_fn}
              readOnly={readOnly}
              onChange={v => setField("fiscal_fn", v)}
              placeholder="Фискальный накопитель"
            />
          </div>
          <div style={{ flex: 1 }}>
            <FieldRow
              label="ФД"
              value={state.fiscal_fd}
              readOnly={readOnly}
              onChange={v => setField("fiscal_fd", v)}
              placeholder="Фискальный документ"
            />
          </div>
        </div>

        {/* Препараты */}
        <div style={LABEL}>Препараты</div>
        <div style={{ marginTop: 4 }}>
          {state.items.map((item, idx) => (
            <DrugItem
              key={item.id}
              drug_name={item.drug_name}
              drug_inn={item.drug_inn}
              quantity={item.quantity}
              unit_price={item.unit_price}
              total_price={item.total_price}
              is_rx={item.is_rx}
              readOnly={readOnly}
              onChange={patch => updateItem(idx, patch as Partial<CardState["items"][number]>)}
            />
          ))}
        </div>

        {/* OCR confidence */}
        {data.ocr_confidence != null && (
          <div style={{
            marginTop: 12,
            padding: "6px 10px",
            background: "var(--surface-subtle)",
            border: "1px solid var(--border-light)",
            borderRadius: "var(--r-sm)",
            fontSize: 11,
            color: "var(--text-muted)",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span>Точность OCR:</span>
            <span style={{
              fontWeight: 700,
              color: data.ocr_confidence > 0.9 ? "#16A34A" : data.ocr_confidence > 0.75 ? "#D97706" : "#DC2626",
            }}>
              {Math.round(data.ocr_confidence * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* Кнопки */}
      {!readOnly && (
        <div style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--border-light)",
          display: "flex", gap: 8, justifyContent: "flex-end",
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

  return (
    <div style={{ marginBottom: 32 }}>
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
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <ReceiptEditCard
          title="Оригинал в базе"
          titleColor="#16A34A"
          dotColor="#22C55E"
          data={MOCK_ORIGINAL}
          readOnly
          state={origState}
        />

        {/* Разделитель */}
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          paddingTop: 60, gap: 6, flexShrink: 0,
        }}>
          <div style={{ width: 1, height: 40, background: "var(--border)" }} />
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: "var(--surface-subtle)",
            border: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13,
          }}>↔</div>
          <div style={{ width: 1, height: 40, background: "var(--border)" }} />
        </div>

        <ReceiptEditCard
          title="Новый загруженный"
          titleColor="#D97706"
          dotColor="#F59E0B"
          data={MOCK_DUPLICATE}
          readOnly={false}
          state={dupState}
          onChange={setDupState}
        />
      </div>
    </div>
  );
}
