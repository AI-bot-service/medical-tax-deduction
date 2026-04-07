"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  ReceiptDetail,
  ReceiptItem,
  Prescription,
  PrescriptionListResponse,
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

const DOC_TYPE_LABELS: Record<string, string> = {
  recipe_107: "107-1/у",
  recipe_egisz: "ЕГИСЗ",
  doc_025: "025/у",
  doc_003: "003/у",
  doc_043: "043/у",
  doc_111: "111/у",
  doc_025_1: "025-1/у",
};

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
// Field — unified input field styled with HEITKAMP tokens
// ---------------------------------------------------------------------------

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{
        fontSize: "11px",
        fontWeight: 600,
        color: "var(--text-secondary)",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle = (highlight: boolean): React.CSSProperties => ({
  width: "100%",
  borderRadius: "var(--r-sm)",
  border: `1px solid ${highlight ? "var(--yellow)" : "var(--border)"}`,
  background: "var(--surface)",
  padding: "9px 12px",
  fontSize: "13px",
  color: "var(--text-primary)",
  outline: "none",
  fontFamily: "Urbanist, sans-serif",
  transition: "border-color 0.15s",
  boxSizing: "border-box",
});

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
  const [amount, setAmount] = useState(receipt.total_amount ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Жёлтая рамка только пока данные не подтверждены сохранением
  const showUncertain = hasLowConf && !saved;

  async function handleSave() {
    setSaving(true);
    try {
      await api.patch(`/api/v1/receipts/${receipt.id}`, {
        purchase_date: date || null,
        pharmacy_name: pharmacy || null,
        total_amount: amount ? parseFloat(amount) : null,
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
    <div className="card" style={{ padding: "20px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Данные чека
        </h2>
        {showUncertain && (
          <span style={{
            display: "flex", alignItems: "center", gap: 5,
            fontSize: "11px", color: "var(--yellow-text)",
            background: "var(--yellow-bg)",
            padding: "3px 10px", borderRadius: "var(--r-pill)",
            fontWeight: 600,
          }}>
            ⚠ Низкая точность OCR ({Math.round((receipt.ocr_confidence ?? 0) * 100)}%)
          </span>
        )}
      </div>

      {/* Fields */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Дата покупки">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={inputStyle(showUncertain)}
            onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
            onBlur={(e) => { e.target.style.borderColor = showUncertain ? "var(--yellow)" : "var(--border)"; }}
          />
        </Field>

        <Field label="Аптека">
          <input
            type="text"
            value={pharmacy}
            onChange={(e) => setPharmacy(e.target.value)}
            placeholder="Название аптеки"
            style={inputStyle(showUncertain)}
            onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
            onBlur={(e) => { e.target.style.borderColor = showUncertain ? "var(--yellow)" : "var(--border)"; }}
          />
        </Field>

        <Field label="Сумма (₽)">
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            style={inputStyle(showUncertain)}
            onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
            onBlur={(e) => { e.target.style.borderColor = showUncertain ? "var(--yellow)" : "var(--border)"; }}
          />
        </Field>
      </div>

      {/* Actions */}
      <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary btn-sm"
          style={saving ? { opacity: 0.55, cursor: "not-allowed" } : {}}
        >
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
        {saved && (
          <span style={{ fontSize: "12px", color: "var(--green-text)", fontWeight: 600 }}>
            ✓ Сохранено
          </span>
        )}
      </div>

      {/* OCR confidence bar */}
      {receipt.ocr_confidence != null && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border-light)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Точность распознавания</span>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}>
              {Math.round(receipt.ocr_confidence * 100)}%
            </span>
          </div>
          <div className="progress-wrap">
            <div
              className="progress-fill"
              style={{ width: `${Math.round(receipt.ocr_confidence * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PrescriptionLinker
// ---------------------------------------------------------------------------

interface PrescriptionLinkerProps {
  item: ReceiptItem;
  receiptId: string;
  onLinked: () => void;
}
function PrescriptionLinker({ item, receiptId, onLinked }: PrescriptionLinkerProps) {
  const [open, setOpen] = useState(false);
  const [linking, setLinking] = useState(false);

  const { data } = useQuery<PrescriptionListResponse>({
    queryKey: ["prescriptions-search", item.drug_inn],
    queryFn: () =>
      api.get<PrescriptionListResponse>(
        `/api/v1/prescriptions?drug_inn=${encodeURIComponent(item.drug_inn ?? "")}&status=active`,
      ),
    enabled: open && !!item.drug_inn,
    staleTime: 30_000,
  });

  async function handleLink(prescriptionId: string) {
    setLinking(true);
    try {
      await api.post(`/api/v1/prescriptions/link`, {
        prescription_id: prescriptionId,
        receipt_item_id: item.id,
      });
      onLinked();
      setOpen(false);
    } catch {
      // ignore
    } finally {
      setLinking(false);
    }
  }

  if (item.prescription_id) {
    return <span style={{ fontSize: "11px", color: "var(--green-text)", fontWeight: 600 }}>✓ Рецепт</span>;
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          fontSize: "11px",
          color: "var(--accent)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          fontFamily: "Urbanist, sans-serif",
          fontWeight: 600,
        }}
      >
        Привязать рецепт
      </button>
      {open && (
        <div style={{
          position: "absolute",
          zIndex: 10,
          marginTop: 4,
          right: 0,
          width: 280,
          borderRadius: "var(--r-md)",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-lg)",
          padding: 12,
        }}>
          <p style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 8px" }}>
            Рецепты для: {item.drug_inn ?? item.drug_name}
          </p>
          {!data && <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>Загрузка...</p>}
          {data?.items.length === 0 && (
            <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>Рецепты не найдены</p>
          )}
          {data?.items.map((p: Prescription) => (
            <div
              key={p.id}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 0",
                borderBottom: "1px solid var(--border-light)",
              }}
            >
              <div>
                <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                  {p.drug_name}
                </p>
                <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "2px 0 0" }}>
                  {DOC_TYPE_LABELS[p.doc_type] ?? p.doc_type} ·{" "}
                  {new Date(p.issue_date).toLocaleDateString("ru-RU")}
                </p>
                {p.risk_level !== "STANDARD" && (
                  <span style={{ fontSize: "11px", color: "var(--yellow-text)" }}>⚠ {p.risk_level}</span>
                )}
              </div>
              <button
                onClick={() => handleLink(p.id)}
                disabled={linking}
                className="btn btn-primary btn-sm"
                style={linking ? { opacity: 0.5 } : {}}
              >
                Привязать
              </button>
            </div>
          ))}
          <button
            onClick={() => setOpen(false)}
            style={{
              marginTop: 8, width: "100%",
              fontSize: "11px", color: "var(--text-muted)",
              background: "none", border: "none",
              cursor: "pointer", fontFamily: "Urbanist, sans-serif",
            }}
          >
            Закрыть
          </button>
        </div>
      )}
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

const cellInputStyle = (focused: boolean): React.CSSProperties => ({
  width: "100%",
  background: focused ? "var(--surface)" : "transparent",
  border: `1px solid ${focused ? "var(--accent)" : "transparent"}`,
  borderRadius: "var(--r-sm)",
  padding: "4px 6px",
  fontSize: "13px",
  fontFamily: "Urbanist, sans-serif",
  color: "var(--text-primary)",
  outline: "none",
  transition: "border-color 0.15s, background 0.15s",
  boxSizing: "border-box",
});

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
      <div className="card-header">
        <span className="card-title">Препараты</span>
        <span style={{
          fontSize: "11px", fontWeight: 600, color: "var(--text-muted)",
          background: "var(--bg)", padding: "2px 8px", borderRadius: "var(--r-pill)",
        }}>
          {rows.length} поз.
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--bg)" }}>
              {["Название", "МНН", "Кол-во", "Цена", "Сумма", "Rx", "Рецепт"].map((h, i) => (
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
            {rows.map((row, i) => {
              const isSaving = saving === row.id;
              const rowBg = i % 2 === 0 ? "var(--surface)" : "var(--surface-subtle)";
              return (
                <tr
                  key={row.id}
                  style={{
                    borderTop: "1px solid var(--border-light)",
                    background: isSaving ? "var(--yellow-bg)" : rowBg,
                    transition: "background 0.2s",
                  }}
                >
                  {/* Название — editable */}
                  <td style={{ padding: "8px 10px", maxWidth: 180 }}>
                    <input
                      value={row._name}
                      onChange={(e) => updateRow(row.id, "_name", e.target.value)}
                      onFocus={() => setFocusedCell(`${row.id}-name`)}
                      onBlur={() => {
                        setFocusedCell(null);
                        void handleNameBlur(row);
                      }}
                      style={{
                        ...cellInputStyle(focusedCell === `${row.id}-name`),
                        fontWeight: 600,
                      }}
                      disabled={isSaving}
                      title="Нажмите чтобы редактировать"
                    />
                  </td>

                  {/* МНН — read-only, auto-filled after name save */}
                  <td style={{ padding: "8px 14px", fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {isSaving && focusedCell === null ? (
                      <span style={{ opacity: 0.5 }}>…</span>
                    ) : (
                      row.drug_inn ?? "—"
                    )}
                  </td>

                  {/* Кол-во — editable */}
                  <td style={{ padding: "8px 10px", textAlign: "center", width: 72 }}>
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
                        ...cellInputStyle(focusedCell === `${row.id}-qty`),
                        textAlign: "center",
                        width: 64,
                      }}
                      disabled={isSaving}
                    />
                  </td>

                  {/* Цена — editable */}
                  <td style={{ padding: "8px 10px", textAlign: "right", width: 96 }}>
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
                        ...cellInputStyle(focusedCell === `${row.id}-price`),
                        textAlign: "right",
                        width: 88,
                      }}
                      disabled={isSaving}
                    />
                  </td>

                  {/* Сумма — calculated, read-only */}
                  <td style={{ padding: "8px 14px", textAlign: "right", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                    {formatRub(
                      String(
                        (parseFloat(row._qty) || row.quantity) *
                        (parseFloat(row._price) || parseFloat(row.unit_price ?? "0"))
                      )
                    )}
                  </td>

                  {/* Rx */}
                  <td style={{ padding: "8px 14px", textAlign: "center" }}>
                    {row.is_rx ? (
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

                  {/* Рецепт */}
                  <td style={{ padding: "8px 14px", textAlign: "center" }}>
                    {row.is_rx ? (
                      <PrescriptionLinker item={row} receiptId={receiptId} onLinked={onLinked} />
                    ) : (
                      <span style={{ color: "var(--text-disabled)" }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid var(--border)", background: "var(--bg)" }}>
              <td colSpan={4} style={{
                padding: "10px 14px",
                fontSize: "12px", fontWeight: 700,
                color: "var(--text-secondary)",
                textAlign: "right",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}>
                Итого
              </td>
              <td style={{
                padding: "10px 14px",
                textAlign: "right",
                fontSize: "14px", fontWeight: 800,
                color: "var(--accent)",
                whiteSpace: "nowrap",
              }}>
                {formatRub(String(total))}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
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
