"use client";

/**
 * Модальное окно проверки дубликата чека (F-05).
 *
 * Показывает две карточки рядом:
 *   - Левая: оригинальный чек из БД (только для чтения)
 *   - Правая: новый загруженный чек (редактируемый)
 *
 * Кнопки:
 *   - «Сохранить»: POST /receipts/{id}/resolve-duplicate → при 409 показывает предупреждение + «Закрыть»
 *   - «Отмена» / «Закрыть»: DELETE /receipts/{id} + закрытие модалки
 */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { ReceiptDetail } from "@/types/api";

// ---------------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------------

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatRub(amount: string | null | undefined): string {
  if (!amount) return "—";
  const n = parseFloat(amount);
  return n.toLocaleString("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Удаление чека: обёртка для DELETE с поддержкой 204 No Content
// ---------------------------------------------------------------------------

async function deleteReceipt(receiptId: string): Promise<void> {
  try {
    await api.delete(`/api/v1/receipts/${receiptId}`);
  } catch (e) {
    // 204 No Content вызывает ошибку парсинга JSON — это ожидаемо, игнорируем
    if (e instanceof ApiError) throw e;
    // SyntaxError / TypeError от пустого тела 204 → считаем удалением успешным
  }
}

// ---------------------------------------------------------------------------
// Карточка чека (используется для обоих вариантов)
// ---------------------------------------------------------------------------

interface FieldRowProps {
  label: string;
  value: React.ReactNode;
}

function FieldRow({ label, value }: FieldRowProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </span>
      <span style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>
        {value || "—"}
      </span>
    </div>
  );
}

interface InputFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}

function InputField({ label, value, onChange, type = "text", placeholder }: InputFieldProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "7px 10px",
          fontSize: 14,
          color: "var(--text-primary)",
          background: "var(--bg)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--r-sm)",
          outline: "none",
          transition: "border-color 0.15s",
          boxSizing: "border-box",
        }}
        onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
        onBlur={e => (e.currentTarget.style.borderColor = "var(--border-strong)")}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Список препаратов в карточке
// ---------------------------------------------------------------------------

function ItemsList({ receipt }: { receipt: ReceiptDetail }) {
  if (!receipt.items.length) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
        Препараты
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {receipt.items.map(item => (
          <div key={item.id} style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
            padding: "4px 8px",
            background: "var(--surface-subtle)",
            borderRadius: "var(--r-sm)",
            fontSize: 13,
          }}>
            <span style={{ color: "var(--text-primary)", fontWeight: 500, flex: 1, marginRight: 8 }}>
              {item.drug_name}
              {item.is_rx && (
                <span style={{ marginLeft: 4, fontSize: 10, color: "var(--purple-text)", fontWeight: 700 }}>Rx</span>
              )}
            </span>
            <span style={{ color: "var(--text-muted)", fontSize: 12, whiteSpace: "nowrap" }}>
              {item.quantity}×{parseFloat(item.unit_price).toLocaleString("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Изображение чека
// ---------------------------------------------------------------------------

function ReceiptImage({ imageUrl }: { imageUrl: string | null }) {
  if (!imageUrl) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt="Чек"
      style={{
        width: "100%",
        maxHeight: 180,
        objectFit: "contain",
        borderRadius: "var(--r-sm)",
        border: "1px solid var(--border)",
        background: "var(--bg)",
        marginBottom: 12,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Состояние редактирования правой карточки
// ---------------------------------------------------------------------------

interface EditState {
  purchase_date: string;
  pharmacy_name: string;
  total_amount: string;
  fiscal_fn: string;
  fiscal_fd: string;
}

function initEditState(receipt: ReceiptDetail): EditState {
  return {
    purchase_date: receipt.purchase_date ?? "",
    pharmacy_name: receipt.pharmacy_name ?? "",
    total_amount: receipt.total_amount ? parseFloat(receipt.total_amount).toFixed(2) : "",
    fiscal_fn: receipt.fiscal_fn ?? "",
    fiscal_fd: receipt.fiscal_fd ?? "",
  };
}

// ---------------------------------------------------------------------------
// Основной компонент
// ---------------------------------------------------------------------------

interface DuplicateReviewModalProps {
  /** ID нового (потенциального дубликата) чека */
  receiptId: string;
  /** Вызывается после успешного сохранения (дубликат разрешён) */
  onSaved: () => void;
  /** Вызывается после отмены / закрытия (чек удалён) */
  onCancelled: () => void;
}

export function DuplicateReviewModal({ receiptId, onSaved, onCancelled }: DuplicateReviewModalProps) {
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // Загружаем новый чек
  const { data: newReceipt, isLoading: loadingNew } = useQuery<ReceiptDetail>({
    queryKey: ["receipt-detail", receiptId],
    queryFn: () => api.get<ReceiptDetail>(`/api/v1/receipts/${receiptId}`),
  });

  // Инициализируем editState когда данные загружены
  useEffect(() => {
    if (newReceipt && !editState) {
      setEditState(initEditState(newReceipt));
    }
  }, [newReceipt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Загружаем оригинальный чек
  const { data: originalReceipt, isLoading: loadingOriginal } = useQuery<ReceiptDetail>({
    queryKey: ["receipt-duplicate-original", receiptId],
    queryFn: () => api.get<ReceiptDetail>(`/api/v1/receipts/${receiptId}/duplicate-original`),
    enabled: !!newReceipt?.duplicate_of_id,
  });

  // Объединённая функция удаления + закрытия (Отмена / Закрыть)
  async function handleDiscard() {
    setDiscarding(true);
    try {
      await deleteReceipt(receiptId);
    } catch {
      // игнорируем: даже при ошибке закрываем модалку
    }
    setDiscarding(false);
    onCancelled();
  }

  // Сохранить с проверкой дубликата
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
      });
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setDuplicateWarning(e.message);
      } else {
        setDuplicateWarning("Произошла ошибка при сохранении. Попробуйте ещё раз.");
      }
    } finally {
      setSaving(false);
    }
  }

  function setField(field: keyof EditState, value: string) {
    setEditState(prev => prev ? { ...prev, [field]: value } : prev);
  }

  const isLoading = loadingNew || loadingOriginal;

  return (
    // Backdrop
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 1000,
      background: "rgba(0,0,0,0.55)",
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      padding: "24px 16px",
      overflowY: "auto",
    }}>
      {/* Контейнер модалки */}
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        width: "100%",
        maxWidth: 960,
        boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        overflow: "hidden",
      }}>

        {/* ── Шапка ── */}
        <div style={{
          padding: "20px 24px",
          borderBottom: "1px solid var(--border-light)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}>
          <div style={{
            width: 36, height: 36,
            borderRadius: "50%",
            background: "rgba(245,158,11,0.12)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, flexShrink: 0,
          }}>
            ⚠️
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)" }}>
              Обнаружен возможный дубликат
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
              Сравните данные и исправьте при необходимости, затем сохраните или отмените загрузку.
            </div>
          </div>
        </div>

        {/* ── Предупреждение о дубликате при сохранении ── */}
        {duplicateWarning && (
          <div style={{
            margin: "0 24px",
            marginTop: 16,
            padding: "14px 16px",
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: "var(--r-md)",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}>
            <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>🚫</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--red-text)", marginBottom: 4 }}>
                Дубликат найден — сохранение отменено
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {duplicateWarning}
              </div>
            </div>
          </div>
        )}

        {/* ── Загрузка ── */}
        {isLoading && (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
            Загрузка данных чеков...
          </div>
        )}

        {/* ── Две карточки рядом ── */}
        {!isLoading && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 0,
            borderBottom: "1px solid var(--border-light)",
          }}>

            {/* ── Левая карточка: оригинал (только чтение) ── */}
            <div style={{
              padding: "20px 24px",
              borderRight: "1px solid var(--border-light)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                paddingBottom: 8,
                borderBottom: "1px solid var(--border-light)",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "#22C55E", display: "inline-block",
                }} />
                Существующий чек в базе (оригинал)
              </div>

              {originalReceipt ? (
                <>
                  <ReceiptImage imageUrl={originalReceipt.image_url} />
                  <FieldRow label="Аптека" value={originalReceipt.pharmacy_name} />
                  <FieldRow label="Дата покупки" value={formatDate(originalReceipt.purchase_date)} />
                  <FieldRow label="Сумма" value={formatRub(originalReceipt.total_amount)} />
                  <FieldRow label="ФН (фискальный номер)" value={originalReceipt.fiscal_fn} />
                  <FieldRow label="ФД (фискальный документ)" value={originalReceipt.fiscal_fd} />
                  <ItemsList receipt={originalReceipt} />
                </>
              ) : (
                <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                  Оригинальный чек не найден
                </div>
              )}
            </div>

            {/* ── Правая карточка: новый чек (редактируемый) ── */}
            <div style={{
              padding: "20px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                paddingBottom: 8,
                borderBottom: "1px solid var(--border-light)",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "#F59E0B", display: "inline-block",
                }} />
                Новый загруженный чек (редактируемый)
              </div>

              {newReceipt && editState ? (
                <>
                  <ReceiptImage imageUrl={newReceipt.image_url} />
                  <InputField
                    label="Аптека"
                    value={editState.pharmacy_name}
                    onChange={v => setField("pharmacy_name", v)}
                    placeholder="Название аптеки"
                  />
                  <InputField
                    label="Дата покупки"
                    value={editState.purchase_date}
                    onChange={v => setField("purchase_date", v)}
                    type="date"
                  />
                  <InputField
                    label="Сумма (₽)"
                    value={editState.total_amount}
                    onChange={v => setField("total_amount", v)}
                    type="number"
                    placeholder="0.00"
                  />
                  <InputField
                    label="ФН (фискальный номер)"
                    value={editState.fiscal_fn}
                    onChange={v => setField("fiscal_fn", v)}
                    placeholder="Номер ФН"
                  />
                  <InputField
                    label="ФД (фискальный документ)"
                    value={editState.fiscal_fd}
                    onChange={v => setField("fiscal_fd", v)}
                    placeholder="Номер ФД"
                  />
                  <ItemsList receipt={newReceipt} />
                </>
              ) : (
                <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                  Загрузка...
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Нижняя панель с кнопками ── */}
        <div style={{
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}>
          <button
            className="btn btn-secondary"
            onClick={handleDiscard}
            disabled={discarding || saving}
          >
            {discarding ? "Отмена..." : duplicateWarning ? "Закрыть" : "Отмена"}
          </button>

          {!duplicateWarning && (
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || discarding || isLoading}
            >
              {saving ? "Проверка..." : "Сохранить"}
            </button>
          )}

          {duplicateWarning && (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Нажмите «Закрыть» для удаления загруженного чека
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
