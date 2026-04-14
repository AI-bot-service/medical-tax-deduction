"use client";

import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

function formatRub(v: string | null | undefined): string {
  if (!v) return "—";
  return parseFloat(v).toLocaleString("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  });
}

interface OCREditorProps {
  receipt: ReceiptDetail;
  onSaved: () => void;
}

interface ReceiptDetail {
  id: string;
  purchase_date: string | null;
  pharmacy_name: string | null;
  fiscal_fn: string | null;
  fiscal_fd: string | null;
  ocr_confidence: number | null;
  // ... other fields
}

function OCREditor({ receipt, onSaved }: OCREditorProps) {
  const LOW_CONFIDENCE = 0.7;
  const hasLowConf =
    receipt.ocr_confidence !== null &&
    receipt.ocr_confidence !== undefined &&
    receipt.ocr_confidence < LOW_CONFIDENCE;

  const [date, setDate] = useState(receipt.purchase_date ?? "");
  const [pharmacy, setPharmacy] = useState(receipt.pharmacy_name ?? "");
  const [fn, setFn] = useState(receipt.fiscal_fn ?? "");
  const [fd, setFd] = useState(receipt.fiscal_fd ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [userEdited, setUserEdited] = useState(false);

  const showUncertain = hasLowConf && !saved && !userEdited;

  // Sync if receipt data changes (e.g. after invalidate)
  useEffect(() => {
    setDate(receipt.purchase_date ?? "");
    setPharmacy(receipt.pharmacy_name ?? "");
    setFn(receipt.fiscal_fn ?? "");
    setFd(receipt.fiscal_fd ?? "");
  }, [receipt.purchase_date, receipt.pharmacy_name, receipt.fiscal_fn, receipt.fiscal_fd]);

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

  async function saveFields(fields: { purchase_date?: string | null; pharmacy_name?: string | null; fiscal_fn?: string | null; fiscal_fd?: string | null }) {
    setSaving(true);
    try {
      await api.patch(`/api/v1/receipts/${receipt.id}`, fields);
      setUserEdited(true);
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function handleDateBlur() {
    if ((date || null) === (receipt.purchase_date ?? null)) return;
    await saveFields({ purchase_date: date || null });
  }

  async function handlePharmacyBlur() {
    if ((pharmacy || null) === (receipt.pharmacy_name ?? null)) return;
    await saveFields({ pharmacy_name: pharmacy || null });
  }

  async function handleFnBlur() {
    if ((fn || null) === (receipt.fiscal_fn ?? null)) return;
    await saveFields({ fiscal_fn: fn || null });
  }

  async function handleFdBlur() {
    if ((fd || null) === (receipt.fiscal_fd ?? null)) return;
    await saveFields({ fiscal_fd: fd || null });
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
          {saving && (
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Сохранение…</span>
          )}
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
            onBlur={(e) => {
              e.currentTarget.style.borderColor = showUncertain ? "var(--yellow)" : "var(--border)";
              void handleDateBlur();
            }}
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
            onBlur={(e) => {
              e.currentTarget.style.borderColor = showUncertain ? "var(--yellow)" : "var(--border)";
              void handlePharmacyBlur();
            }}
          />
        </div>
        <div>
          <label style={fieldLabelStyle}>ФН</label>
          <input
            type="text"
            value={fn}
            onChange={(e) => setFn(e.target.value)}
            placeholder="Номер ФН"
            style={fieldInputStyle}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = showUncertain ? "var(--yellow)" : "var(--border)";
              void handleFnBlur();
            }}
          />
        </div>
        <div>
          <label style={fieldLabelStyle}>ФД</label>
          <input
            type="text"
            value={fd}
            onChange={(e) => setFd(e.target.value)}
            placeholder="Номер ФД"
            style={fieldInputStyle}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = showUncertain ? "var(--yellow)" : "var(--border)";
              void handleFdBlur();
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default OCREditor;