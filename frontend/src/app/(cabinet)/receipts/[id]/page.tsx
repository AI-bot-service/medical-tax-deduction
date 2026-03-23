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
  const [zoom, setZoom] = useState(false);
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
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        onClick={() => setZoom((v) => !v)}
        style={{
          borderRadius: "var(--r-md)",
          border: "1px solid var(--border)",
          background: "var(--bg)",
          overflow: "auto",
          cursor: zoom ? "zoom-out" : "zoom-in",
          maxHeight: zoom ? "70vh" : "55vh",
          transition: "max-height 0.3s ease",
          position: "relative",
        }}
        title={zoom ? "Нажмите чтобы уменьшить" : "Нажмите чтобы увеличить"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Фото чека"
          style={{
            display: "block",
            width: zoom ? "auto" : "100%",
            maxWidth: zoom ? "none" : "100%",
            height: zoom ? "auto" : "auto",
            maxHeight: zoom ? "none" : "100%",
            objectFit: zoom ? "none" : "contain",
          }}
        />
      </div>
      <p style={{ fontSize: "11px", color: "var(--text-muted)", textAlign: "center", margin: 0 }}>
        {zoom ? "🔍 Нажмите чтобы уменьшить" : "🔍 Нажмите чтобы увеличить"}
      </p>
    </div>
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
  background: highlight ? "var(--yellow-bg)" : "var(--surface)",
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
        {hasLowConf && (
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
            style={inputStyle(hasLowConf)}
            onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
            onBlur={(e) => { e.target.style.borderColor = hasLowConf ? "var(--yellow)" : "var(--border)"; }}
          />
        </Field>

        <Field label="Аптека">
          <input
            type="text"
            value={pharmacy}
            onChange={(e) => setPharmacy(e.target.value)}
            placeholder="Название аптеки"
            style={inputStyle(hasLowConf)}
            onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
            onBlur={(e) => { e.target.style.borderColor = hasLowConf ? "var(--yellow)" : "var(--border)"; }}
          />
        </Field>

        <Field label="Сумма (₽)">
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            style={inputStyle(hasLowConf)}
            onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
            onBlur={(e) => { e.target.style.borderColor = hasLowConf ? "var(--yellow)" : "var(--border)"; }}
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

interface ItemsTableProps {
  items: ReceiptItem[];
  receiptId: string;
  onLinked: () => void;
}
function ItemsTable({ items, receiptId, onLinked }: ItemsTableProps) {
  if (!items.length) {
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
          {items.length} поз.
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
            {items.map((item, i) => (
              <tr
                key={item.id}
                style={{
                  borderTop: "1px solid var(--border-light)",
                  background: i % 2 === 0 ? "var(--surface)" : "var(--surface-subtle)",
                }}
              >
                <td style={{ padding: "11px 14px", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.drug_name}
                </td>
                <td style={{ padding: "11px 14px", fontSize: "11px", color: "var(--text-muted)" }}>
                  {item.drug_inn ?? "—"}
                </td>
                <td style={{ padding: "11px 14px", textAlign: "center", fontSize: "13px", color: "var(--text-primary)" }}>
                  {item.quantity}
                </td>
                <td style={{ padding: "11px 14px", textAlign: "right", fontSize: "13px", color: "var(--text-secondary)" }}>
                  {formatRub(item.unit_price)}
                </td>
                <td style={{ padding: "11px 14px", textAlign: "right", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                  {formatRub(item.total_price)}
                </td>
                <td style={{ padding: "11px 14px", textAlign: "center" }}>
                  {item.is_rx ? (
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
                <td style={{ padding: "11px 14px", textAlign: "center" }}>
                  {item.is_rx ? (
                    <PrescriptionLinker item={item} receiptId={receiptId} onLinked={onLinked} />
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
