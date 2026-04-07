"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  ReceiptDetail,
  ReceiptItem,
} from "@/types/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRub(v: string | null | undefined): string {
  if (!v) return "—";
  return parseFloat(v).toLocaleString("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  });
}

// ---------------------------------------------------------------------------
// PresignedImage — auto-refresh every 14 min
// ---------------------------------------------------------------------------

interface PresignedImageProps {
  receiptId: string;
}
function PresignedImage({ receiptId }: PresignedImageProps) {
  const REFRESH_MS = 14 * 60 * 1000;
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchUrl() {
    try {
      const detail = await api.get<ReceiptDetail>(`/api/v1/receipts/${receiptId}`);
      setImageUrl(detail.image_url ?? null);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void fetchUrl();
    timerRef.current = setInterval(() => void fetchUrl(), REFRESH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptId]);

  if (!imageUrl) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 200,
        borderRadius: "var(--r-md)",
        background: "var(--bg)",
        color: "var(--text-muted)",
        gap: 8,
        border: "1px solid var(--border)",
      }}>
        <span style={{ fontSize: 32 }}>🧾</span>
        <span style={{ fontSize: "13px" }}>Фото недоступно</span>
      </div>
    );
  }

  return (
    <>
      {/* Thumbnail */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          onClick={() => setModalOpen(true)}
          style={{
            borderRadius: "var(--r-md)",
            border: "1px solid var(--border)",
            background: "var(--bg)",
            overflow: "hidden",
            cursor: "zoom-in",
            maxHeight: "55vh",
            position: "relative",
          }}
          title="Нажмите чтобы открыть"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Фото чека"
            style={{ display: "block", width: "100%", objectFit: "contain" }}
          />
          <div style={{
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
        </div>
        <p style={{ fontSize: "11px", color: "var(--text-muted)", textAlign: "center", margin: 0 }}>
          Нажмите на фото чтобы увеличить
        </p>
      </div>

      {/* Modal — fixed on the left */}
      {modalOpen && (
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
              onClick={() => setModalOpen(false)}
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
              src={imageUrl}
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
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// OCREditor
// ---------------------------------------------------------------------------

interface OCREditorProps {
  receipt: ReceiptDetail;
  onSaved: () => void;
}
function OCREditor({ receipt, onSaved }: OCREditorProps) {
  const LOW_CONFIDENCE = 0.7;
  const hasLowConf =
    receipt.ocr_confidence !== null &&
    receipt.ocr_confidence !== undefined &&
    receipt.ocr_confidence < LOW_CONFIDENCE;

  const [date, setDate] = useState(receipt.purchase_date ?? "");
  const [pharmacy, setPharmacy] = useState(receipt.pharmacy_name ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const showUncertain = hasLowConf && !saved;

  const fieldInputStyle: React.CSSProperties = {
    width: "100%",
    borderRadius: "var(--r-sm)",
    border: `1px solid ${showUncertain ? "var(--yellow)" : "var(--border)"}`,
    background: "var(--surface)",
    padding: "7px 10px",
    fontSize: "13px",
    color: "var(--text-primary)",
    outline: "none",
    fontFamily: "Urbanist, sans-serif",
    boxSizing: "border-box",
  };

  const fieldLabelStyle: React.CSSProperties = {
    fontSize: "10px",
    fontWeight: 700,
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: 4,
    display: "block",
  };

  async function handleSave() {
    setSaving(true);
    try {
      await api.patch(`/api/v1/receipts/${receipt.id}`, {
        purchase_date: date || null,
        pharmacy_name: pharmacy || null,
      });
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // error handling omitted for brevity
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ padding: "16px 18px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>Данные чека</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {showUncertain && (
            <span style={{
              fontSize: "11px", color: "var(--yellow-text)",
              background: "var(--yellow-bg)",
              padding: "3px 10px", borderRadius: "var(--r-pill)",
              fontWeight: 600,
            }}>
              ⚠ {Math.round((receipt.ocr_confidence ?? 0) * 100)}%
            </span>
          )}
          {saved && (
            <span style={{ fontSize: "12px", color: "var(--green-text)", fontWeight: 600 }}>✓ Сохранено</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary btn-sm"
            style={saving ? { opacity: 0.55, cursor: "not-allowed" } : {}}
          >
            {saving ? "..." : "Сохранить"}
          </button>
        </div>
      </div>

      {/* Fields — 2 column grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={fieldLabelStyle}>Дата покупки</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={fieldInputStyle}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = showUncertain ? "var(--yellow)" : "var(--border)"; }}
          />
        </div>
        <div>
          <label style={fieldLabelStyle}>Аптека</label>
          <input
            type="text"
            value={pharmacy}
            onChange={(e) => setPharmacy(e.target.value)}
            placeholder="Аптека"
            style={fieldInputStyle}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = showUncertain ? "var(--yellow)" : "var(--border)"; }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ItemsTable
// ---------------------------------------------------------------------------

interface EditableRow extends ReceiptItem {
  _name: string;
  _qty: string;
  _price: string;
}

interface ItemsTableProps {
  items: ReceiptItem[];
  receiptId: string;
  onLinked: () => void;
}
function ItemsTable({ items, receiptId, onLinked }: ItemsTableProps) {
  const [rows, setRows] = useState<EditableRow[]>(() =>
    items.map((item) => ({
      ...item,
      _name: item.drug_name,
      _qty: String(item.quantity),
      _price: item.unit_price ?? "0",
    })),
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [focusedCell, setFocusedCell] = useState<string | null>(null); // "itemId-field"

  useEffect(() => {
    setRows(
      items.map((item) => ({
        ...item,
        _name: item.drug_name,
        _qty: String(item.quantity),
        _price: item.unit_price ?? "0",
      })),
    );
  }, [items]);

  async function patchItem(itemId: string, patch: Record<string, unknown>) {
    setSaving(itemId);
    try {
      const updated = await api.patch<{ items: ReceiptItem[] }>(
        `/api/v1/receipts/${receiptId}`,
        { items: [{ id: itemId, ...patch }] },
      );
      setRows(
        updated.items.map((item) => ({
          ...item,
          _name: item.drug_name,
          _qty: String(item.quantity),
          _price: item.unit_price ?? "0",
        })),
      );
      onLinked();
    } catch {
      // ignore
    } finally {
      setSaving(null);
    }
  }

  async function handleNameBlur(row: EditableRow) {
    if (row._name.trim() === row.drug_name) return;
    await patchItem(row.id, { drug_name: row._name.trim() });
  }

  async function handleQtyBlur(row: EditableRow) {
    const qty = parseFloat(row._qty);
    if (isNaN(qty) || qty === row.quantity) return;
    const price = parseFloat(row._price) || parseFloat(row.unit_price ?? "0");
    const total = (qty * price).toFixed(2);
    await patchItem(row.id, { quantity: qty, total_price: total });
  }

  async function handlePriceBlur(row: EditableRow) {
    const price = parseFloat(row._price);
    if (isNaN(price) || row._price === row.unit_price) return;
    const qty = parseFloat(row._qty) || row.quantity;
    const total = (qty * price).toFixed(2);
    await patchItem(row.id, { unit_price: row._price, total_price: total });
  }

  function updateRow(id: string, field: "_name" | "_qty" | "_price", value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  const total = rows.reduce((acc, row) => {
    const qty = parseFloat(row._qty) || row.quantity;
    const price = parseFloat(row._price) || parseFloat(row.unit_price ?? "0");
    return acc + qty * price;
  }, 0);

  if (!rows.length) {
    return (
      <div className="card" style={{ padding: "16px 20px", textAlign: "center" }}>
        <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>Позиции не найдены</span>
      </div>
    );
  }

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--border-light)" }}>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>Лекарства</span>
        <button
          style={{
            fontSize: "12px", fontWeight: 600,
            color: "var(--accent)", background: "none",
            border: "none", cursor: "pointer", padding: 0,
            fontFamily: "Urbanist, sans-serif",
          }}
          onClick={() => {/* TODO: add item */}}
        >
          + Добавить
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--bg)" }}>
              {["Название", "МНН", "Кол-во", "Цена"].map((h, i) => (
                <th key={h} style={{
                  padding: "6px 10px",
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
            {rows.map((row) => {
              const isSaving = saving === row.id;
              return (
                <tr
                  key={row.id}
                  style={{
                    borderTop: "1px solid var(--border-light)",
                    background: isSaving ? "var(--yellow-bg)" : undefined,
                    transition: "background 0.2s",
                  }}
                >
                  {/* Название — editable */}
                  <td style={{ padding: "4px 6px", maxWidth: 180 }}>
                    <input
                      value={row._name}
                      onChange={(e) => updateRow(row.id, "_name", e.target.value)}
                      onFocus={() => setFocusedCell(`${row.id}-name`)}
                      onBlur={() => {
                        setFocusedCell(null);
                        void handleNameBlur(row);
                      }}
                      style={{
                        width: "100%",
                        background: focusedCell === `${row.id}-name` ? "var(--surface)" : "transparent",
                        border: `1px solid ${focusedCell === `${row.id}-name` ? "var(--accent)" : "transparent"}`,
                        borderRadius: "var(--r-sm)",
                        padding: "3px 6px",
                        fontSize: "12px",
                        fontFamily: "Urbanist, sans-serif",
                        color: "var(--text-primary)",
                        outline: "none",
                        fontWeight: 600,
                        boxSizing: "border-box",
                      }}
                      disabled={isSaving}
                      title="Нажмите чтобы редактировать"
                    />
                  </td>

                  {/* МНН — read-only */}
                  <td style={{ padding: "4px 10px", fontSize: "12px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {isSaving ? <span style={{ opacity: 0.5 }}>…</span> : (row.drug_inn ?? "—")}
                  </td>

                  {/* Кол-во — editable */}
                  <td style={{ padding: "4px 6px", textAlign: "center", width: 60 }}>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={row._qty}
                      onChange={(e) => updateRow(row.id, "_qty", e.target.value)}
                      onFocus={() => setFocusedCell(`${row.id}-qty`)}
                      onBlur={() => {
                        setFocusedCell(null);
                        void handleQtyBlur(row);
                      }}
                      style={{
                        width: 52,
                        background: focusedCell === `${row.id}-qty` ? "var(--surface)" : "transparent",
                        border: `1px solid ${focusedCell === `${row.id}-qty` ? "var(--accent)" : "transparent"}`,
                        borderRadius: "var(--r-sm)",
                        padding: "3px 6px",
                        fontSize: "12px",
                        fontFamily: "Urbanist, sans-serif",
                        color: "var(--text-primary)",
                        outline: "none",
                        textAlign: "center",
                        boxSizing: "border-box",
                      }}
                      disabled={isSaving}
                    />
                  </td>

                  {/* Цена — editable */}
                  <td style={{ padding: "4px 6px", textAlign: "right", width: 80 }}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row._price}
                      onChange={(e) => updateRow(row.id, "_price", e.target.value)}
                      onFocus={() => setFocusedCell(`${row.id}-price`)}
                      onBlur={() => {
                        setFocusedCell(null);
                        void handlePriceBlur(row);
                      }}
                      style={{
                        width: 72,
                        background: focusedCell === `${row.id}-price` ? "var(--surface)" : "transparent",
                        border: `1px solid ${focusedCell === `${row.id}-price` ? "var(--accent)" : "transparent"}`,
                        borderRadius: "var(--r-sm)",
                        padding: "3px 6px",
                        fontSize: "12px",
                        fontFamily: "Urbanist, sans-serif",
                        color: "var(--text-secondary)",
                        outline: "none",
                        textAlign: "right",
                        boxSizing: "border-box",
                      }}
                      disabled={isSaving}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Итого */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 16, padding: "10px 18px", borderTop: "1px solid var(--border-light)" }}>
        <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Итого</span>
        <span style={{ fontSize: "15px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
          {formatRub(String(total))}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  DONE:    { label: "Готов",     bg: "var(--green-bg)",  color: "var(--green-text)" },
  REVIEW:  { label: "Проверка",  bg: "var(--yellow-bg)", color: "var(--yellow-text)" },
  PENDING: { label: "Обработка", bg: "var(--purple-bg)", color: "var(--purple-text)" },
  FAILED:  { label: "Ошибка",    bg: "var(--red-bg)",    color: "var(--red-text)" },
};

export default function ReceiptDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const queryClient = useQueryClient();

  const { data: receipt, isLoading, isError } = useQuery<ReceiptDetail>({
    queryKey: ["receipt", id],
    queryFn: () => api.get<ReceiptDetail>(`/api/v1/receipts/${id}`),
    staleTime: 30_000,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["receipt", id] });
    void queryClient.invalidateQueries({ queryKey: ["receipts-list"] });
  }

  const statusCfg = receipt ? (STATUS_CONFIG[receipt.ocr_status] ?? STATUS_CONFIG.PENDING) : null;

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px 48px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => router.push("/receipts")}
          className="btn btn-secondary btn-sm"
        >
          ← Назад
        </button>
        <h1 style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em", margin: 0 }}>
          Чек
        </h1>
        {statusCfg && (
          <span style={{
            fontSize: "11px", fontWeight: 700,
            padding: "3px 12px", borderRadius: "var(--r-pill)",
            background: statusCfg.bg, color: statusCfg.color,
          }}>
            {statusCfg.label}
          </span>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{
              height: i === 0 ? 400 : 120,
              borderRadius: "var(--r-md)",
              background: "var(--bg)",
              animation: "pulse 1.5s ease-in-out infinite",
            }} />
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <div style={{
          padding: "20px 24px",
          borderRadius: "var(--r-md)",
          background: "var(--red-bg)",
          color: "var(--red-text)",
          fontSize: "13px", fontWeight: 500,
        }}>
          ⚠ Не удалось загрузить чек.
        </div>
      )}

      {/* 2-column layout */}
      {receipt && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 420px) 1fr",
          gap: 20,
          alignItems: "start",
        }}>
          {/* Left: Photo */}
          <div style={{ position: "sticky", top: 80 }}>
            <PresignedImage receiptId={id} />
          </div>

          {/* Right: Editor + Table */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <OCREditor receipt={receipt} onSaved={invalidate} />
            <ItemsTable items={receipt.items} receiptId={id} onLinked={invalidate} />
          </div>
        </div>
      )}
    </main>
  );
}
