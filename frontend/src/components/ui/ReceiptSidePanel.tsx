"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

function formatRub(amount: string | null | undefined): string {
  if (!amount) return "—";
  const n = parseFloat(amount);
  return n.toLocaleString("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
}

interface EditableItem {
  id: string;
  drug_name: string;
  drug_inn: string | null;
  quantity: number;
  unit_price: string | null;
  total_price: string | null;
  is_rx: boolean;
  prescription_id: string | null;
  _name: string;
  _qty: string;
  _price: string;
}

export function ReceiptSidePanel({
  receiptId,
  onNavigate,
}: {
  receiptId: string;
  onNavigate: () => void;
}) {
  const qc = useQueryClient();
  const [editDate, setEditDate] = useState("");
  const [editPharmacy, setEditPharmacy] = useState("");
  const [synced, setSynced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [editableItems, setEditableItems] = useState<EditableItem[]>([]);
  const [itemsSynced, setItemsSynced] = useState(false);
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const [focusedCell, setFocusedCell] = useState<string | null>(null);

  const { data, isLoading } = useQuery<import("@/types/api").ReceiptDetail>({
    queryKey: ["receipt-detail", receiptId],
    queryFn: () => api.get<import("@/types/api").ReceiptDetail>(`/api/v1/receipts/${receiptId}`),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (data && !synced) {
      setEditDate(data.purchase_date ?? "");
      setEditPharmacy(data.pharmacy_name ?? "");
      setSynced(true);
    }
  }, [data, synced]);

  useEffect(() => {
    if (data && !itemsSynced) {
      setEditableItems(
        data.items.map(item => ({
          id: item.id,
          drug_name: item.drug_name,
          drug_inn: item.drug_inn ?? null,
          quantity: item.quantity,
          unit_price: item.unit_price ?? null,
          total_price: item.total_price ?? null,
          is_rx: item.is_rx,
          prescription_id: item.prescription_id ?? null,
          _name: item.drug_name,
          _qty: String(item.quantity),
          _price: item.unit_price ?? "0",
        }))
      );
      setItemsSynced(true);
    }
  }, [data, itemsSynced]);

  useEffect(() => {
    setSynced(false);
    setItemsSynced(false);
    setEditDate("");
    setEditPharmacy("");
    setSaved(false);
    setEditableItems([]);
  }, [receiptId]);

  function updateItem(id: string, field: "_name" | "_qty" | "_price", value: string) {
    setEditableItems(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  }

  async function patchItem(itemId: string, patch: Record<string, unknown>) {
    setSavingItem(itemId);
    try {
      const updated = await api.patch<{ items: import("@/types/api").ReceiptItem[] }>(
        `/api/v1/receipts/${receiptId}`,
        { items: [{ id: itemId, ...patch }] },
      );
      setEditableItems(
        updated.items.map(item => ({
          id: item.id,
          drug_name: item.drug_name,
          drug_inn: item.drug_inn ?? null,
          quantity: item.quantity,
          unit_price: item.unit_price ?? null,
          total_price: item.total_price ?? null,
          is_rx: item.is_rx,
          prescription_id: item.prescription_id ?? null,
          _name: item.drug_name,
          _qty: String(item.quantity),
          _price: item.unit_price ?? "0",
        }))
      );
      void qc.invalidateQueries({ queryKey: ["receipt-detail", receiptId] });
      void qc.invalidateQueries({ queryKey: ["receipts-list"] });
    } catch {
      // ignore
    } finally {
      setSavingItem(null);
    }
  }

  async function handleItemNameBlur(row: EditableItem) {
    if (row._name.trim() === row.drug_name) return;
    await patchItem(row.id, { drug_name: row._name.trim() });
  }

  async function handleItemQtyBlur(row: EditableItem) {
    const qty = parseFloat(row._qty);
    if (isNaN(qty) || qty === row.quantity) return;
    const price = parseFloat(row._price) || parseFloat(row.unit_price ?? "0");
    await patchItem(row.id, { quantity: qty, total_price: (qty * price).toFixed(2) });
  }

  async function handleItemPriceBlur(row: EditableItem) {
    const price = parseFloat(row._price);
    if (isNaN(price) || row._price === row.unit_price) return;
    const qty = parseFloat(row._qty) || row.quantity;
    await patchItem(row.id, { unit_price: row._price, total_price: (qty * price).toFixed(2) });
  }

  const hasLowConf = !!data && data.ocr_confidence != null && data.ocr_confidence < 0.7;
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
    if (!data) return;
    setSaving(true);
    try {
      await api.patch(`/api/v1/receipts/${data.id}`, {
        purchase_date: editDate || null,
        pharmacy_name: editPharmacy || null,
      });
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ["receipt-detail", receiptId] });
      void qc.invalidateQueries({ queryKey: ["receipts-list"] });
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Image zoom modal — fixed on the left */}
      {imageModalOpen && data?.image_url && (
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
              onClick={() => setImageModalOpen(false)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 32, height: 32,
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
          <div style={{
            flex: 1, overflow: "auto", padding: "12px",
            display: "flex", alignItems: "flex-start", justifyContent: "center",
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.image_url}
              alt="Фото чека"
              style={{
                display: "block", width: "100%", height: "auto",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--border)",
              }}
            />
          </div>
        </div>
      )}

    <div style={{ flex: 1, display: "flex", gap: 12, minWidth: 0, overflow: "hidden" }}>

      {/* Photo column */}
      {!isLoading && data?.image_url && (
        <div
          style={{
            width: 160, flexShrink: 0,
            borderRadius: "var(--r-md)",
            overflow: "hidden",
            border: "1px solid var(--border)",
            background: "var(--bg)",
            cursor: "zoom-in",
            position: "relative",
          }}
          onClick={() => setImageModalOpen(true)}
          title="Нажмите чтобы увеличить"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.image_url}
            alt="Фото чека"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            background: "rgba(0,0,0,0.45)",
            color: "#fff",
            fontSize: "10px", fontWeight: 700,
            textAlign: "center",
            padding: "4px 0",
          }}>
            🔍 Увеличить
          </div>
        </div>
      )}

      {/* Data card */}
      <div style={{
        flex: 1, minWidth: 0,
        background: "var(--surface)",
        borderRadius: "var(--r-md)",
        border: "2px solid var(--border-strong)",
        padding: "16px 18px",
        display: "flex", flexDirection: "column", gap: 14,
        overflow: "hidden",
      }}>
        {isLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[80, 60, 100, 60].map((w, i) => (
              <div key={i} style={{ height: 14, borderRadius: 4, background: "var(--bg)", width: `${w}%` }} />
            ))}
          </div>
        )}

        {data && (
          <>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>Данные чека</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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

            {/* Editable fields */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={fieldLabelStyle}>Дата покупки</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={e => setEditDate(e.target.value)}
                  style={fieldInputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = showUncertain ? "var(--yellow)" : "var(--border)"; }}
                />
              </div>
              <div>
                <label style={fieldLabelStyle}>Аптека</label>
                <input
                  type="text"
                  value={editPharmacy}
                  onChange={e => setEditPharmacy(e.target.value)}
                  placeholder="Аптека"
                  style={fieldInputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = showUncertain ? "var(--yellow)" : "var(--border)"; }}
                />
              </div>
            </div>

            {/* Items section */}
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>Лекарства</span>
                <button
                  onClick={onNavigate}
                  style={{
                    fontSize: "12px", fontWeight: 600,
                    color: "var(--accent)", background: "none",
                    border: "none", cursor: "pointer", padding: 0,
                    fontFamily: "Urbanist, sans-serif",
                  }}
                >
                  + Добавить
                </button>
              </div>

              {editableItems.length > 0 ? (
                <>
                  <div style={{ overflowX: "auto", flex: 1 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "var(--bg)" }}>
                          {["Название", "МНН", "Кол-во", "Цена"].map((h, i) => (
                            <th key={h} style={{
                              padding: "6px 10px",
                              fontSize: "10px", fontWeight: 700,
                              color: "var(--text-muted)",
                              letterSpacing: "0.05em", textTransform: "uppercase",
                              textAlign: i >= 2 ? "center" : "left",
                              whiteSpace: "nowrap",
                            }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {editableItems.map(item => {
                          const isSaving = savingItem === item.id;
                          return (
                            <tr key={item.id} style={{ borderTop: "1px solid var(--border-light)", background: isSaving ? "var(--yellow-bg)" : undefined, transition: "background 0.2s" }}>
                              <td style={{ padding: "4px 6px", maxWidth: 160 }}>
                                <input
                                  value={item._name}
                                  onChange={e => updateItem(item.id, "_name", e.target.value)}
                                  onFocus={() => setFocusedCell(`${item.id}-name`)}
                                  onBlur={() => { setFocusedCell(null); void handleItemNameBlur(item); }}
                                  disabled={isSaving}
                                  style={{
                                    width: "100%",
                                    background: focusedCell === `${item.id}-name` ? "var(--surface)" : "transparent",
                                    border: `1px solid ${focusedCell === `${item.id}-name` ? "var(--accent)" : "transparent"}`,
                                    borderRadius: "var(--r-sm)",
                                    padding: "3px 6px",
                                    fontSize: "12px",
                                    fontFamily: "Urbanist, sans-serif",
                                    color: "var(--text-primary)",
                                    outline: "none",
                                    fontWeight: 600,
                                    boxSizing: "border-box" as const,
                                  }}
                                  title="Нажмите для редактирования"
                                />
                              </td>
                              <td style={{ padding: "4px 10px", fontSize: "12px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                                {isSaving ? <span style={{ opacity: 0.5 }}>…</span> : (item.drug_inn ?? "—")}
                              </td>
                              <td style={{ padding: "4px 6px", textAlign: "center", width: 60 }}>
                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={item._qty}
                                  onChange={e => updateItem(item.id, "_qty", e.target.value)}
                                  onFocus={() => setFocusedCell(`${item.id}-qty`)}
                                  onBlur={() => { setFocusedCell(null); void handleItemQtyBlur(item); }}
                                  disabled={isSaving}
                                  style={{
                                    width: 52,
                                    background: focusedCell === `${item.id}-qty` ? "var(--surface)" : "transparent",
                                    border: `1px solid ${focusedCell === `${item.id}-qty` ? "var(--accent)" : "transparent"}`,
                                    borderRadius: "var(--r-sm)",
                                    padding: "3px 6px",
                                    fontSize: "12px",
                                    fontFamily: "Urbanist, sans-serif",
                                    color: "var(--text-primary)",
                                    outline: "none",
                                    textAlign: "center" as const,
                                    boxSizing: "border-box" as const,
                                  }}
                                />
                              </td>
                              <td style={{ padding: "4px 6px", textAlign: "right", width: 80 }}>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={item._price}
                                  onChange={e => updateItem(item.id, "_price", e.target.value)}
                                  onFocus={() => setFocusedCell(`${item.id}-price`)}
                                  onBlur={() => { setFocusedCell(null); void handleItemPriceBlur(item); }}
                                  disabled={isSaving}
                                  style={{
                                    width: 72,
                                    background: focusedCell === `${item.id}-price` ? "var(--surface)" : "transparent",
                                    border: `1px solid ${focusedCell === `${item.id}-price` ? "var(--accent)" : "transparent"}`,
                                    borderRadius: "var(--r-sm)",
                                    padding: "3px 6px",
                                    fontSize: "12px",
                                    fontFamily: "Urbanist, sans-serif",
                                    color: "var(--text-secondary)",
                                    outline: "none",
                                    textAlign: "right" as const,
                                    boxSizing: "border-box" as const,
                                  }}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 16, paddingTop: 8, borderTop: "1px solid var(--border-light)" }}>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Итого</span>
                    <span style={{ fontSize: "15px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                      {formatRub(data.total_amount)}
                    </span>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: "13px", color: "var(--text-muted)", fontStyle: "italic", padding: "8px 0" }}>
                  нет данных о препаратах
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
    </>
  );
}
