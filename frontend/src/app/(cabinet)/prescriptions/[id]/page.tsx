"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { ReceiptPhotoPanel } from "@/components/ui/ReceiptPhotoPanel";
import type { PrescriptionDetail, PrescriptionItemDetail, DocType, RiskLevel } from "@/types/api";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOC_TYPE_LABELS: Record<DocType, string> = {
  recipe_107:   "107-1/у",
  recipe_egisz: "ЕГИСЗ",
  doc_025:      "025/у",
  doc_003:      "003/у",
  doc_043:      "043/у",
  doc_111:      "111/у",
  doc_025_1:    "025-1/у",
};

const RISK_CONFIG: Record<RiskLevel, { label: string; bg: string; color: string }> = {
  STANDARD: { label: "Стандартный", bg: "var(--green-bg)",  color: "var(--green-text)" },
  DISPUTED: { label: "Спорный",     bg: "var(--yellow-bg)", color: "var(--yellow-text)" },
  HIGH:     { label: "Высокий риск",bg: "var(--red-bg)",    color: "var(--red-text)" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calcValidityDays(issue: string, expires: string): 60 | 365 {
  const diff = Math.round((new Date(expires).getTime() - new Date(issue).getTime()) / 86400000);
  return diff > 61 ? 365 : 60;
}

function computeExpires(issue: string, days: number): string {
  if (!issue) return "—";
  const d = new Date(issue);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ---------------------------------------------------------------------------
// PresignedImage — auto-refresh every 14 min
// ---------------------------------------------------------------------------

interface PresignedImageProps {
  prescriptionId: string;
}

function PresignedImage({ prescriptionId }: PresignedImageProps) {
  const REFRESH_MS = 14 * 60 * 1000;
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchUrl() {
    try {
      const res = await api.get<{ image_url: string | null }>(`/api/v1/prescriptions/${prescriptionId}/image`);
      setImageUrl(res.image_url ?? null);
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
  }, [prescriptionId]);

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
        <span style={{ fontSize: 32 }}>📋</span>
        <span style={{ fontSize: "13px" }}>Фото не прикреплено</span>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          onClick={() => setModalOpen(true)}
          style={{
            borderRadius: "var(--r-md)",
            border: "1px solid var(--border)",
            background: "var(--bg)",
            overflow: "hidden",
            cursor: "zoom-in",
            height: 480,
            position: "relative",
          }}
          title="Нажмите чтобы открыть"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Фото рецепта"
            style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }}
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
        </div>
        <p style={{ fontSize: "11px", color: "var(--text-muted)", textAlign: "center", margin: 0 }}>
          Нажмите на фото чтобы увеличить
        </p>
      </div>

      {modalOpen && (
        <ReceiptPhotoPanel src={imageUrl} onClose={() => setModalOpen(false)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// PrescriptionEditor
// ---------------------------------------------------------------------------

interface PrescriptionEditorProps {
  prescription: PrescriptionDetail;
  onSaved: () => void;
  onDeleted: () => void;
}

function PrescriptionEditor({ prescription, onSaved, onDeleted }: PrescriptionEditorProps) {
  const [doctorName,    setDoctorName]    = useState(prescription.doctor_name);
  const [clinicName,    setClinicName]    = useState(prescription.clinic_name ?? "");
  const [issueDate,     setIssueDate]     = useState(prescription.issue_date);
  const [validityDays,  setValidityDays]  = useState<60 | 365>(
    calcValidityDays(prescription.issue_date, prescription.expires_at),
  );
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [errors,   setErrors]   = useState<{ doctorName?: boolean; issueDate?: boolean }>({});

  // Sync when prescription reloads
  useEffect(() => {
    setDoctorName(prescription.doctor_name);
    setClinicName(prescription.clinic_name ?? "");
    setIssueDate(prescription.issue_date);
    setValidityDays(calcValidityDays(prescription.issue_date, prescription.expires_at));
  }, [prescription.doctor_name, prescription.clinic_name, prescription.issue_date, prescription.expires_at]);

  const fieldLabelStyle: React.CSSProperties = {
    fontSize: "10px",
    fontWeight: 700,
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: 4,
    display: "block",
  };

  function fieldInputStyle(hasError: boolean): React.CSSProperties {
    return {
      width: "100%",
      borderRadius: "var(--r-sm)",
      border: `1px solid ${hasError ? "var(--red-text, #EF4444)" : "var(--border)"}`,
      background: "var(--surface)",
      padding: "7px 10px",
      fontSize: "13px",
      color: "var(--text-primary)",
      outline: "none",
      fontFamily: "Urbanist, sans-serif",
      boxSizing: "border-box",
    };
  }

  async function handleSave() {
    const newErrors: { doctorName?: boolean; issueDate?: boolean } = {};
    if (!doctorName.trim()) newErrors.doctorName = true;
    if (!issueDate)         newErrors.issueDate  = true;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      await api.patch(`/api/v1/prescriptions/${prescription.id}`, {
        doctor_name:   doctorName.trim(),
        clinic_name:   clinicName.trim() || null,
        issue_date:    issueDate,
        validity_days: validityDays,
      });
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Удалить этот рецепт? Это действие нельзя отменить.")) return;
    setDeleting(true);
    try {
      await api.delete(`/api/v1/prescriptions/${prescription.id}`);
      onDeleted();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        alert(e.message);
      }
    } finally {
      setDeleting(false);
    }
  }

  const docLabel  = DOC_TYPE_LABELS[prescription.doc_type] ?? prescription.doc_type;
  const riskCfg   = RISK_CONFIG[prescription.risk_level];

  return (
    <div className="card" style={{ padding: "16px 18px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>Данные рецепта</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* doc_type badge */}
          <span style={{
            fontSize: "11px", fontWeight: 700,
            padding: "3px 10px", borderRadius: "var(--r-pill)",
            background: "var(--accent-light)", color: "var(--accent)",
          }}>
            {docLabel}
          </span>
          {/* risk badge */}
          <span style={{
            fontSize: "11px", fontWeight: 700,
            padding: "3px 10px", borderRadius: "var(--r-pill)",
            background: riskCfg.bg, color: riskCfg.color,
          }}>
            {riskCfg.label}
          </span>
          {saved && (
            <span style={{ fontSize: "12px", color: "var(--green-text)", fontWeight: 600 }}>✓ Сохранено</span>
          )}
          <button
            onClick={() => { void handleDelete(); }}
            disabled={deleting || saving}
            className="btn btn-sm"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: deleting ? "var(--text-muted)" : "var(--red-text, #EF4444)",
              cursor: deleting || saving ? "not-allowed" : "pointer",
              opacity: deleting ? 0.5 : 1,
            }}
          >
            {deleting ? "…" : "Удалить"}
          </button>
          <button
            onClick={() => { void handleSave(); }}
            disabled={saving || deleting}
            className="btn btn-primary btn-sm"
            style={saving || deleting ? { opacity: 0.55, cursor: "not-allowed" } : {}}
          >
            {saving ? "…" : "Сохранить"}
          </button>
        </div>
      </div>

      {/* Fields — 2-column grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={{ ...fieldLabelStyle, color: errors.issueDate ? "var(--red-text, #EF4444)" : "var(--text-secondary)" }}>
            Дата выдачи{errors.issueDate && " — обязательное поле"}
          </label>
          <input
            type="date"
            value={issueDate}
            onChange={(e) => { setIssueDate(e.target.value); if (errors.issueDate) setErrors(prev => ({ ...prev, issueDate: false })); }}
            style={fieldInputStyle(!!errors.issueDate)}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = errors.issueDate ? "var(--red-text, #EF4444)" : "var(--border)"; }}
          />
        </div>

        <div>
          <label style={fieldLabelStyle}>Срок действия</label>
          <select
            value={String(validityDays)}
            onChange={(e) => setValidityDays(Number(e.target.value) as 60 | 365)}
            style={{
              ...fieldInputStyle(false),
              cursor: "pointer",
              appearance: "none",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
          >
            <option value="60">60 дней</option>
            <option value="365">365 дней</option>
          </select>
        </div>

        <div>
          <label style={{ ...fieldLabelStyle, color: errors.doctorName ? "var(--red-text, #EF4444)" : "var(--text-secondary)" }}>
            Врач{errors.doctorName && " — обязательное поле"}
          </label>
          <input
            type="text"
            value={doctorName}
            onChange={(e) => { setDoctorName(e.target.value); if (errors.doctorName) setErrors(prev => ({ ...prev, doctorName: false })); }}
            placeholder="ФИО врача"
            style={fieldInputStyle(!!errors.doctorName)}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = errors.doctorName ? "var(--red-text, #EF4444)" : "var(--border)"; }}
          />
        </div>

        <div>
          <label style={fieldLabelStyle}>Клиника</label>
          <input
            type="text"
            value={clinicName}
            onChange={(e) => setClinicName(e.target.value)}
            placeholder="Название клиники"
            style={fieldInputStyle(false)}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
          />
        </div>
      </div>

      {/* Computed expires */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
        <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Действует до:
        </span>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
          {computeExpires(issueDate, validityDays)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PrescriptionItemsTable
// ---------------------------------------------------------------------------

interface EditableRow extends PrescriptionItemDetail {
  _name:   string;
  _dosage: string;
}

interface PrescriptionItemsTableProps {
  items:          PrescriptionItemDetail[];
  prescriptionId: string;
  onChanged:      () => void;
}

function PrescriptionItemsTable({ items, prescriptionId, onChanged }: PrescriptionItemsTableProps) {
  const [rows,        setRows]        = useState<EditableRow[]>(() =>
    items.map((item) => ({ ...item, _name: item.drug_name, _dosage: item.dosage ?? "" })),
  );
  const [saving,      setSaving]      = useState<string | null>(null);
  const [deleting,    setDeleting]    = useState<string | null>(null);
  const [adding,      setAdding]      = useState(false);
  const [focusedCell, setFocusedCell] = useState<string | null>(null);
  const focusedCellRef                = useRef<string | null>(null);

  function setFocused(val: string | null) {
    focusedCellRef.current = val;
    setFocusedCell(val);
  }

  useEffect(() => {
    setRows((prevRows) =>
      items.map((item) => {
        const prev      = prevRows.find((r) => r.id === item.id);
        const isEditing = focusedCellRef.current?.startsWith(`${item.id}-`);
        return {
          ...item,
          _name:   isEditing && prev ? prev._name   : item.drug_name,
          _dosage: isEditing && prev ? prev._dosage : (item.dosage ?? ""),
        };
      }),
    );
  }, [items]);

  async function addItem() {
    setAdding(true);
    try {
      const newItem = await api.post<PrescriptionItemDetail>(
        `/api/v1/prescriptions/${prescriptionId}/items`,
        { drug_name: "Новый препарат" },
      );
      setRows((prev) => [...prev, { ...newItem, _name: newItem.drug_name, _dosage: newItem.dosage ?? "" }]);
      onChanged();
    } catch {
      // ignore
    } finally {
      setAdding(false);
    }
  }

  async function patchItem(itemId: string, patch: Record<string, unknown>) {
    setSaving(itemId);
    try {
      const updated = await api.patch<PrescriptionItemDetail>(
        `/api/v1/prescriptions/${prescriptionId}/items/${itemId}`,
        patch,
      );
      setRows((prevRows) =>
        prevRows.map((r) => {
          if (r.id !== itemId) return r;
          const isEditing = focusedCellRef.current?.startsWith(`${itemId}-`);
          return {
            ...updated,
            _name:   isEditing ? r._name   : updated.drug_name,
            _dosage: isEditing ? r._dosage : (updated.dosage ?? ""),
          };
        }),
      );
    } catch {
      // ignore
    } finally {
      setSaving(null);
    }
  }

  async function deleteItem(itemId: string) {
    if (rows.length <= 1) return; // cannot delete last item
    setDeleting(itemId);
    try {
      await api.delete(`/api/v1/prescriptions/${prescriptionId}/items/${itemId}`);
      setRows((prev) => prev.filter((r) => r.id !== itemId));
      onChanged();
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  }

  async function handleNameBlur(row: EditableRow) {
    if (row._name.trim() === row.drug_name) return;
    await patchItem(row.id, { drug_name: row._name.trim() || row.drug_name });
  }

  async function handleDosageBlur(row: EditableRow) {
    const newVal = row._dosage.trim() || null;
    if (newVal === row.dosage) return;
    await patchItem(row.id, { dosage: newVal });
  }

  function updateRow(id: string, field: "_name" | "_dosage", value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 18px", borderBottom: "1px solid var(--border-light)",
      }}>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>Препараты</span>
        <button
          style={{
            fontSize: "12px", fontWeight: 600,
            color: adding ? "var(--text-muted)" : "var(--accent)",
            background: "none", border: "none",
            cursor: adding ? "not-allowed" : "pointer",
            padding: 0, fontFamily: "Urbanist, sans-serif",
          }}
          onClick={() => { void addItem(); }}
          disabled={adding}
        >
          {adding ? "…" : "+ Добавить"}
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col />
            <col style={{ width: 140 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 36 }} />
          </colgroup>
          <thead>
            <tr style={{ background: "var(--bg)" }}>
              {(["Название", "МНН", "Дозировка", ""] as const).map((h, i) => (
                <th key={i} style={{
                  padding: "10px 16px",
                  fontSize: "11px", fontWeight: 600,
                  color: "var(--text-secondary)",
                  letterSpacing: "0.04em", textTransform: "uppercase",
                  textAlign: "left", whiteSpace: "nowrap",
                  background: "var(--bg)",
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isSaving   = saving   === row.id;
              const isDeleting = deleting === row.id;
              const canDelete  = rows.length > 1;

              return (
                <tr
                  key={row.id}
                  style={{
                    borderTop: "1px solid var(--border-light)",
                    background: isSaving ? "var(--yellow-bg)" : isDeleting ? "var(--red-bg)" : undefined,
                    transition: "background 0.2s",
                    opacity: isDeleting ? 0.5 : 1,
                  }}
                >
                  {/* Название — editable */}
                  <td style={{ padding: "8px 16px" }}>
                    <input
                      value={row._name}
                      onChange={(e) => updateRow(row.id, "_name", e.target.value)}
                      onFocus={() => setFocused(`${row.id}-name`)}
                      onBlur={() => { setFocused(null); void handleNameBlur(row); }}
                      disabled={isSaving}
                      title="Нажмите чтобы редактировать"
                      style={{
                        width: "100%",
                        background: focusedCell === `${row.id}-name` ? "var(--surface)" : "transparent",
                        border: `1px solid ${focusedCell === `${row.id}-name` ? "var(--accent)" : "transparent"}`,
                        borderRadius: "var(--r-sm)",
                        padding: "3px 6px",
                        fontSize: "13px",
                        fontFamily: "Urbanist, sans-serif",
                        color: "var(--text-primary)",
                        outline: "none",
                        fontWeight: 600,
                        boxSizing: "border-box",
                        opacity: isSaving ? 0.6 : 1,
                      }}
                    />
                  </td>

                  {/* МНН — read-only */}
                  <td style={{ padding: "8px 16px", fontSize: "13px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {isSaving ? <span style={{ opacity: 0.5 }}>…</span> : (row.drug_inn ?? "—")}
                  </td>

                  {/* Дозировка — editable */}
                  <td style={{ padding: "8px 16px" }}>
                    <input
                      value={row._dosage}
                      onChange={(e) => updateRow(row.id, "_dosage", e.target.value)}
                      onFocus={() => setFocused(`${row.id}-dosage`)}
                      onBlur={() => { setFocused(null); void handleDosageBlur(row); }}
                      disabled={isSaving}
                      placeholder="—"
                      style={{
                        width: "100%",
                        background: focusedCell === `${row.id}-dosage` ? "var(--surface)" : "transparent",
                        border: `1px solid ${focusedCell === `${row.id}-dosage` ? "var(--accent)" : "transparent"}`,
                        borderRadius: "var(--r-sm)",
                        padding: "3px 6px",
                        fontSize: "13px",
                        fontFamily: "Urbanist, sans-serif",
                        color: "var(--text-secondary)",
                        outline: "none",
                        boxSizing: "border-box",
                        opacity: isSaving ? 0.6 : 1,
                      }}
                    />
                  </td>

                  {/* Удалить */}
                  <td style={{ padding: "8px 8px", textAlign: "center" }}>
                    <button
                      onClick={() => { void deleteItem(row.id); }}
                      disabled={isSaving || isDeleting || !canDelete}
                      title={canDelete ? "Удалить препарат" : "Нельзя удалить единственный препарат"}
                      style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 26, height: 26,
                        borderRadius: "var(--r-sm)",
                        border: "1px solid transparent",
                        background: "transparent",
                        cursor: isSaving || isDeleting || !canDelete ? "not-allowed" : "pointer",
                        color: "var(--text-muted)",
                        padding: 0,
                        transition: "color 0.15s, background 0.15s, border-color 0.15s",
                        opacity: isSaving || isDeleting || !canDelete ? 0.3 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!isSaving && !isDeleting && canDelete) {
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
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M2 3.5h10M5.5 3.5V2.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1M5 3.5l.5 8M7 3.5v8M9 3.5l-.5 8M3.5 3.5l.5 8.5a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5l.5-8.5"
                          stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: "1px solid var(--border-light)" }}>
                <td colSpan={4} style={{
                  padding: "10px 16px", textAlign: "right",
                  fontSize: "11px", fontWeight: 600,
                  color: "var(--text-muted)",
                  textTransform: "uppercase", letterSpacing: "0.04em",
                }}>
                  Итого препаратов: {rows.length}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PrescriptionDetailPage() {
  const params       = useParams();
  const router       = useRouter();
  const id           = params.id as string;
  const queryClient  = useQueryClient();

  const { data: prescription, isLoading, isError } = useQuery<PrescriptionDetail>({
    queryKey: ["prescription", id],
    queryFn:  () => api.get<PrescriptionDetail>(`/api/v1/prescriptions/${id}`),
    staleTime: 30_000,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["prescription", id] });
    void queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
  }

  const docLabel = prescription ? (DOC_TYPE_LABELS[prescription.doc_type] ?? prescription.doc_type) : null;
  const riskCfg  = prescription ? RISK_CONFIG[prescription.risk_level] : null;

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px 48px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => router.push("/prescriptions")}
          className="btn btn-secondary btn-sm"
        >
          ← Назад
        </button>
        <h1 style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em", margin: 0 }}>
          Рецепт
        </h1>
        {docLabel && (
          <span style={{
            fontSize: "11px", fontWeight: 700,
            padding: "3px 12px", borderRadius: "var(--r-pill)",
            background: "var(--accent-light)", color: "var(--accent)",
          }}>
            {docLabel}
          </span>
        )}
        {riskCfg && (
          <span style={{
            fontSize: "11px", fontWeight: 700,
            padding: "3px 12px", borderRadius: "var(--r-pill)",
            background: riskCfg.bg, color: riskCfg.color,
          }}>
            {riskCfg.label}
          </span>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[400, 200, 120].map((h, i) => (
            <div key={i} style={{
              height: h,
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
          ⚠ Не удалось загрузить рецепт.
        </div>
      )}

      {/* Horizontal layout: photo left, data right */}
      {prescription && (
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          {/* Left: Photo */}
          <div style={{ flexShrink: 0, width: 360 }}>
            <PresignedImage prescriptionId={id} />
          </div>

          {/* Right: Editor + Table */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
            <PrescriptionEditor
              prescription={prescription}
              onSaved={invalidate}
              onDeleted={() => router.push("/prescriptions")}
            />
            <PrescriptionItemsTable
              items={prescription.items}
              prescriptionId={id}
              onChanged={invalidate}
            />
          </div>
        </div>
      )}
    </main>
  );
}
