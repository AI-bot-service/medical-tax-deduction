"use client";

/**
 * Модальное окно проверки дубликата чека (F-05).
 *
 * Два столбца с общими строками — поля левой (оригинал) и правой (новый)
 * карточек гарантированно находятся на одном уровне.
 *
 * Кнопки:
 *   - «Сохранить»: POST /receipts/{id}/resolve-duplicate → при 409 показывает
 *     предупреждение + «Закрыть»
 *   - «Отмена» / «Закрыть»: DELETE /receipts/{id} + закрытие
 */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { ReceiptDetail, ReceiptItem } from "@/types/api";

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

async function deleteReceipt(receiptId: string): Promise<void> {
  try {
    await api.delete(`/api/v1/receipts/${receiptId}`);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    // SyntaxError от пустого тела 204 → OK
  }
}

// ---------------------------------------------------------------------------
// Лайтбокс для увеличения фото
// ---------------------------------------------------------------------------

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 2000,
        background: "rgba(0,0,0,0.88)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "zoom-out",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Чек (увеличенный)"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: "90vw", maxHeight: "90vh",
          objectFit: "contain",
          borderRadius: 8,
          boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
          cursor: "default",
        }}
      />
      <button
        onClick={onClose}
        style={{
          position: "fixed", top: 20, right: 24,
          background: "rgba(255,255,255,0.12)",
          border: "none", color: "#fff",
          width: 40, height: 40, borderRadius: "50%",
          fontSize: 22, cursor: "pointer", lineHeight: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        ×
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Кликабельное фото чека
// ---------------------------------------------------------------------------

function ReceiptPhoto({ imageUrl, onZoom }: { imageUrl: string | null; onZoom: (url: string) => void }) {
  if (!imageUrl) {
    return (
      <div style={{
        width: "100%", height: 260,
        background: "var(--surface-subtle)",
        border: "1px dashed var(--border)",
        borderRadius: "var(--r-sm)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--text-muted)", fontSize: 13,
      }}>
        Нет фото
      </div>
    );
  }
  return (
    <div
      onClick={() => onZoom(imageUrl)}
      style={{
        width: "100%", height: 260, position: "relative",
        borderRadius: "var(--r-sm)",
        border: "1px solid var(--border)",
        background: "var(--bg)",
        overflow: "hidden",
        cursor: "zoom-in",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt="Чек"
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
      <div style={{
        position: "absolute", bottom: 6, right: 6,
        background: "rgba(0,0,0,0.45)",
        color: "#fff", fontSize: 11, fontWeight: 600,
        padding: "3px 7px", borderRadius: 4,
        pointerEvents: "none",
      }}>
        🔍 Увеличить
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Состояние редактирования
// ---------------------------------------------------------------------------

interface EditState {
  purchase_date: string;
  pharmacy_name: string;
  total_amount: string;
  fiscal_fn: string;
  fiscal_fd: string;
}

interface EditItem {
  id: string;
  drug_name: string;
  quantity: string;
  unit_price: string;
  total_price: string;
  is_rx: boolean;
}

function initEditState(r: ReceiptDetail): EditState {
  return {
    purchase_date: r.purchase_date ?? "",
    pharmacy_name: r.pharmacy_name ?? "",
    total_amount: r.total_amount ? parseFloat(r.total_amount).toFixed(2) : "",
    fiscal_fn: r.fiscal_fn ?? "",
    fiscal_fd: r.fiscal_fd ?? "",
  };
}

function initEditItems(items: ReceiptItem[]): EditItem[] {
  return items.map(it => ({
    id: it.id,
    drug_name: it.drug_name,
    quantity: String(it.quantity),
    unit_price: parseFloat(it.unit_price).toFixed(2),
    total_price: parseFloat(it.total_price).toFixed(2),
    is_rx: it.is_rx,
  }));
}

// ---------------------------------------------------------------------------
// Общие примитивы — одинаковые для обеих колонок
// ---------------------------------------------------------------------------

const FIELD_LABEL_STYLE: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "var(--text-muted)",
  textTransform: "uppercase", letterSpacing: "0.05em",
  marginBottom: 4,
};

function ReadCell({ value }: { value: React.ReactNode }) {
  return (
    <div style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 500, minHeight: 32, display: "flex", alignItems: "center" }}>
      {value || <span style={{ color: "var(--text-muted)" }}>—</span>}
    </div>
  );
}

function EditCell({
  value, onChange, type = "text", placeholder,
}: {
  value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%", minHeight: 32, padding: "5px 9px",
        fontSize: 14, color: "var(--text-primary)",
        background: "var(--bg)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--r-sm)",
        outline: "none", transition: "border-color 0.15s",
        boxSizing: "border-box",
      }}
      onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
      onBlur={e => (e.currentTarget.style.borderColor = "var(--border-strong)")}
    />
  );
}

// ---------------------------------------------------------------------------
// Строка сравнения (label | left content | right content)
// ---------------------------------------------------------------------------

function CompRow({
  label, left, right, alignTop = false,
}: {
  label: string;
  left: React.ReactNode;
  right: React.ReactNode;
  alignTop?: boolean;
}) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "110px 1fr 1px 1fr",
      borderBottom: "1px solid var(--border-light)",
    }}>
      {/* Метка */}
      <div style={{
        padding: "10px 12px 10px 20px",
        display: "flex", alignItems: alignTop ? "flex-start" : "center",
        paddingTop: alignTop ? 12 : undefined,
        borderRight: "1px solid var(--border-light)",
        ...FIELD_LABEL_STYLE,
      }}>
        {label}
      </div>
      {/* Левое значение */}
      <div style={{ padding: "8px 16px", display: "flex", alignItems: alignTop ? "flex-start" : "center", background: "var(--surface-subtle)" }}>
        {left}
      </div>
      {/* Разделитель */}
      <div style={{ background: "var(--border-light)" }} />
      {/* Правое значение */}
      <div style={{ padding: "8px 16px", display: "flex", alignItems: alignTop ? "flex-start" : "center" }}>
        {right}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Редактируемый список препаратов
// ---------------------------------------------------------------------------

function ReadItems({ items }: { items: ReceiptItem[] }) {
  if (!items.length) return <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Нет данных</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
      {items.map(item => (
        <div key={item.id} style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          padding: "4px 8px",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-sm)",
          fontSize: 13,
        }}>
          <span style={{ color: "var(--text-primary)", fontWeight: 500, flex: 1, marginRight: 8 }}>
            {item.drug_name}
            {item.is_rx && <span style={{ marginLeft: 4, fontSize: 10, color: "var(--purple-text)", fontWeight: 700 }}>Rx</span>}
          </span>
          <span style={{ color: "var(--text-muted)", fontSize: 12, whiteSpace: "nowrap" }}>
            {item.quantity}×{formatRub(item.unit_price)}
          </span>
        </div>
      ))}
    </div>
  );
}

function EditItems({
  items, onChange,
}: {
  items: EditItem[];
  onChange: (items: EditItem[]) => void;
}) {
  if (!items.length) return <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Нет данных</span>;

  function updateItem(idx: number, patch: Partial<EditItem>) {
    const next = items.map((it, i) => i === idx ? { ...it, ...patch } : it);
    onChange(next);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
      {items.map((item, idx) => (
        <div key={item.id} style={{
          padding: "8px",
          background: "var(--surface-subtle)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-sm)",
          display: "flex", flexDirection: "column", gap: 5,
        }}>
          {/* Название */}
          <input
            type="text"
            value={item.drug_name}
            onChange={e => updateItem(idx, { drug_name: e.target.value })}
            placeholder="Название препарата"
            style={{
              width: "100%", padding: "4px 8px", fontSize: 13,
              color: "var(--text-primary)", fontWeight: 500,
              background: "var(--bg)", border: "1px solid var(--border-strong)",
              borderRadius: "var(--r-sm)", outline: "none", boxSizing: "border-box",
            }}
            onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
            onBlur={e => (e.currentTarget.style.borderColor = "var(--border-strong)")}
          />
          {/* Кол-во × цена */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="number"
              value={item.quantity}
              onChange={e => updateItem(idx, { quantity: e.target.value })}
              placeholder="Кол-во"
              style={{
                width: 70, padding: "4px 7px", fontSize: 12,
                color: "var(--text-primary)",
                background: "var(--bg)", border: "1px solid var(--border-strong)",
                borderRadius: "var(--r-sm)", outline: "none", boxSizing: "border-box",
              }}
              onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
              onBlur={e => (e.currentTarget.style.borderColor = "var(--border-strong)")}
            />
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>×</span>
            <input
              type="number"
              value={item.unit_price}
              onChange={e => updateItem(idx, { unit_price: e.target.value })}
              placeholder="Цена"
              style={{
                flex: 1, padding: "4px 7px", fontSize: 12,
                color: "var(--text-primary)",
                background: "var(--bg)", border: "1px solid var(--border-strong)",
                borderRadius: "var(--r-sm)", outline: "none", boxSizing: "border-box",
              }}
              onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
              onBlur={e => (e.currentTarget.style.borderColor = "var(--border-strong)")}
            />
            <label style={{
              display: "flex", alignItems: "center", gap: 4,
              fontSize: 11, color: "var(--text-muted)", cursor: "pointer", whiteSpace: "nowrap",
            }}>
              <input
                type="checkbox"
                checked={item.is_rx}
                onChange={e => updateItem(idx, { is_rx: e.target.checked })}
                style={{ width: 13, height: 13 }}
              />
              Rx
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Основной компонент
// ---------------------------------------------------------------------------

interface DuplicateReviewModalProps {
  receiptId: string;
  onSaved: () => void;
  onCancelled: () => void;
}

export function DuplicateReviewModal({ receiptId, onSaved, onCancelled }: DuplicateReviewModalProps) {
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [itemsInitialized, setItemsInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const { data: newReceipt, isLoading: loadingNew } = useQuery<ReceiptDetail>({
    queryKey: ["receipt-detail", receiptId],
    queryFn: () => api.get<ReceiptDetail>(`/api/v1/receipts/${receiptId}`),
  });

  useEffect(() => {
    if (newReceipt) {
      if (!editState) setEditState(initEditState(newReceipt));
      if (!itemsInitialized) {
        setEditItems(initEditItems(newReceipt.items));
        setItemsInitialized(true);
      }
    }
  }, [newReceipt]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: originalReceipt, isLoading: loadingOriginal } = useQuery<ReceiptDetail>({
    queryKey: ["receipt-duplicate-original", receiptId],
    queryFn: () => api.get<ReceiptDetail>(`/api/v1/receipts/${receiptId}/duplicate-original`),
    enabled: !!newReceipt?.duplicate_of_id,
  });

  async function handleDiscard() {
    setDiscarding(true);
    try { await deleteReceipt(receiptId); } catch { /* ignore */ }
    setDiscarding(false);
    onCancelled();
  }

  async function handleSave() {
    if (!editState) return;
    setSaving(true);
    setDuplicateWarning(null);
    try {
      await api.post(`/api/v1/receipts/${receiptId}/resolve-duplicate`, {
        purchase_date: editState.purchase_date || null,
        pharmacy_name: editState.pharmacy_name || null,
        total_amount: editState.total_amount ? parseFloat(editState.total_amount) : null,
        fiscal_fn: editState.fiscal_fn || null,
        fiscal_fd: editState.fiscal_fd || null,
        items: editItems.map(it => ({
          id: it.id,
          drug_name: it.drug_name || undefined,
          quantity: it.quantity ? parseFloat(it.quantity) : undefined,
          unit_price: it.unit_price ? parseFloat(it.unit_price) : undefined,
          total_price: it.total_price ? parseFloat(it.total_price) : undefined,
          is_rx: it.is_rx,
        })),
      });
      onSaved();
    } catch (e) {
      setDuplicateWarning(
        e instanceof ApiError && e.status === 409
          ? e.message
          : "Произошла ошибка при сохранении. Попробуйте ещё раз.",
      );
    } finally {
      setSaving(false);
    }
  }

  function setField(field: keyof EditState, value: string) {
    setEditState(prev => prev ? { ...prev, [field]: value } : prev);
  }

  const isLoading = loadingNew || (!!newReceipt?.duplicate_of_id && loadingOriginal);
  const orig = originalReceipt;
  const hasOrig = !!orig;

  // Заголовки колонок — одинаковая высота гарантируется через CompRow
  const leftHeader = (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "#16A34A", textTransform: "uppercase", letterSpacing: "0.06em" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E", display: "inline-block", flexShrink: 0 }} />
      Оригинал в базе
    </div>
  );
  const rightHeader = (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "#D97706", textTransform: "uppercase", letterSpacing: "0.06em" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#F59E0B", display: "inline-block", flexShrink: 0 }} />
      Новый загруженный
    </div>
  );

  return (
    <>
      {zoomedImage && <ImageLightbox src={zoomedImage} onClose={() => setZoomedImage(null)} />}

      <div style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "20px 16px", overflowY: "auto",
      }}>
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          width: "100%", maxWidth: 1020,
          boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
          overflow: "hidden",
        }}>

          {/* ── Шапка ── */}
          <div style={{
            padding: "18px 20px",
            borderBottom: "1px solid var(--border-light)",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%",
              background: "rgba(245,158,11,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 17, flexShrink: 0,
            }}>⚠️</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>
                Обнаружен возможный дубликат
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 1 }}>
                Сравните данные и исправьте при необходимости, затем сохраните или отмените загрузку.
              </div>
            </div>
          </div>

          {/* ── Предупреждение при сохранении ── */}
          {duplicateWarning && (
            <div style={{
              margin: "14px 20px 0",
              padding: "12px 14px",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.28)",
              borderRadius: "var(--r-md)",
              display: "flex", alignItems: "flex-start", gap: 10,
            }}>
              <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>🚫</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--red-text)", marginBottom: 3 }}>
                  Дубликат найден — сохранение отменено
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{duplicateWarning}</div>
              </div>
            </div>
          )}

          {/* ── Загрузка ── */}
          {isLoading && (
            <div style={{ padding: "48px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
              Загрузка данных чеков...
            </div>
          )}

          {/* ── Таблица сравнения ── */}
          {!isLoading && editState && (
            <div style={{ borderBottom: "1px solid var(--border-light)" }}>

              {/* Заголовки колонок */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "110px 1fr 1px 1fr",
                background: "var(--surface-subtle)",
                borderBottom: "1px solid var(--border-light)",
              }}>
                <div style={{ borderRight: "1px solid var(--border-light)" }} />
                <div style={{ padding: "10px 16px", background: "rgba(34,197,94,0.05)" }}>{leftHeader}</div>
                <div style={{ background: "var(--border-light)" }} />
                <div style={{ padding: "10px 16px", background: "rgba(245,158,11,0.05)" }}>{rightHeader}</div>
              </div>

              {/* Фото */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "110px 1fr 1px 1fr",
                borderBottom: "1px solid var(--border-light)",
              }}>
                <div style={{
                  padding: "10px 12px 10px 20px",
                  display: "flex", alignItems: "center",
                  borderRight: "1px solid var(--border-light)",
                  ...FIELD_LABEL_STYLE,
                }}>
                  Фото
                </div>
                <div style={{ padding: "12px 16px", background: "var(--surface-subtle)" }}>
                  <ReceiptPhoto
                    imageUrl={hasOrig ? orig!.image_url : null}
                    onZoom={setZoomedImage}
                  />
                </div>
                <div style={{ background: "var(--border-light)" }} />
                <div style={{ padding: "12px 16px" }}>
                  <ReceiptPhoto
                    imageUrl={newReceipt?.image_url ?? null}
                    onZoom={setZoomedImage}
                  />
                </div>
              </div>

              {/* Аптека */}
              <CompRow
                label="Аптека"
                left={<ReadCell value={orig?.pharmacy_name} />}
                right={
                  <EditCell
                    value={editState.pharmacy_name}
                    onChange={v => setField("pharmacy_name", v)}
                    placeholder="Название аптеки"
                  />
                }
              />

              {/* Дата */}
              <CompRow
                label="Дата"
                left={<ReadCell value={formatDate(orig?.purchase_date)} />}
                right={
                  <EditCell
                    value={editState.purchase_date}
                    onChange={v => setField("purchase_date", v)}
                    type="date"
                  />
                }
              />

              {/* Сумма */}
              <CompRow
                label="Сумма"
                left={<ReadCell value={formatRub(orig?.total_amount)} />}
                right={
                  <EditCell
                    value={editState.total_amount}
                    onChange={v => setField("total_amount", v)}
                    type="number"
                    placeholder="0.00"
                  />
                }
              />

              {/* ФН */}
              <CompRow
                label="ФН"
                left={<ReadCell value={orig?.fiscal_fn} />}
                right={
                  <EditCell
                    value={editState.fiscal_fn}
                    onChange={v => setField("fiscal_fn", v)}
                    placeholder="Номер фискального накопителя"
                  />
                }
              />

              {/* ФД */}
              <CompRow
                label="ФД"
                left={<ReadCell value={orig?.fiscal_fd} />}
                right={
                  <EditCell
                    value={editState.fiscal_fd}
                    onChange={v => setField("fiscal_fd", v)}
                    placeholder="Номер фискального документа"
                  />
                }
              />

              {/* Препараты */}
              <CompRow
                label="Препараты"
                alignTop
                left={<ReadItems items={orig?.items ?? []} />}
                right={<EditItems items={editItems} onChange={setEditItems} />}
              />
            </div>
          )}

          {/* ── Кнопки ── */}
          <div style={{
            padding: "14px 20px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          }}>
            <button
              className="btn btn-secondary"
              onClick={handleDiscard}
              disabled={discarding || saving}
            >
              {discarding ? "Удаление..." : duplicateWarning ? "Закрыть" : "Отмена"}
            </button>

            {duplicateWarning ? (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Нажмите «Закрыть» для удаления загруженного чека
              </div>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving || discarding || isLoading}
              >
                {saving ? "Проверка..." : "Сохранить"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
