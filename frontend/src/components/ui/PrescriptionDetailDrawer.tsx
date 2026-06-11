"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { PrescriptionDetail, DocType, RiskLevel } from "@/types/api";

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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function computeExpires(issue: string, expires: string): string {
  return new Date(expires).toLocaleDateString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function getDaysLeft(expiresAt: string): number {
  return Math.floor((new Date(expiresAt).getTime() - Date.now()) / 86400000);
}

// ---------------------------------------------------------------------------
// PhotoSection — загружает presigned URL, поддерживает zoom
// ---------------------------------------------------------------------------

function PhotoSection({ prescriptionId }: { prescriptionId: string }) {
  const REFRESH_MS = 14 * 60 * 1000;
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchUrl() {
    try {
      const res = await api.get<{ image_url: string | null }>(
        `/api/v1/prescriptions/${prescriptionId}/image`,
      );
      setImageUrl(res.image_url ?? null);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    setImageUrl(null);
    void fetchUrl();
    timerRef.current = setInterval(() => void fetchUrl(), REFRESH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prescriptionId]);

  if (loading) {
    return (
      <div style={{
        height: 200, borderRadius: "var(--r-md)",
        background: "var(--bg)",
        animation: "drawerPulse 1.5s ease-in-out infinite",
      }} />
    );
  }

  if (!imageUrl) {
    return (
      <div style={{
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        height: 160, borderRadius: "var(--r-md)",
        background: "var(--bg)", border: "1px dashed var(--border)",
        color: "var(--text-muted)", gap: 8,
      }}>
        <span style={{ fontSize: 28 }}>📋</span>
        <span style={{ fontSize: "12px" }}>Фото не прикреплено</span>
      </div>
    );
  }

  return (
    <>
      <div
        onClick={() => setModalOpen(true)}
        title="Нажмите чтобы открыть"
        style={{
          borderRadius: "var(--r-md)", border: "1px solid var(--border)",
          background: "var(--bg)", overflow: "hidden",
          cursor: "zoom-in", height: 220, position: "relative",
        }}
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
            background: "rgba(0,0,0,0)", transition: "background 0.2s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(0,0,0,0.16)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(0,0,0,0)"; }}
        >
          <span style={{
            fontSize: "11px", fontWeight: 700, color: "#fff",
            background: "rgba(0,0,0,0.45)",
            padding: "3px 10px", borderRadius: "var(--r-pill)",
            pointerEvents: "none",
          }}>
            🔍 Увеличить
          </span>
        </div>
      </div>

      {modalOpen && (
        <div
          onClick={() => setModalOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.85)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "zoom-out",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Фото рецепта (полный размер)"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: "92vw", maxHeight: "92vh",
              borderRadius: "var(--r-md)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
              objectFit: "contain", cursor: "default",
            }}
          />
          <button
            onClick={() => setModalOpen(false)}
            style={{
              position: "absolute", top: 20, right: 20,
              width: 36, height: 36, borderRadius: "50%",
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#fff", fontSize: 18, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// SkeletonDrawer
// ---------------------------------------------------------------------------

function SkeletonDrawer() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 20px 20px" }}>
      <style>{`
        @keyframes drawerPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.45; }
        }
      `}</style>
      {[220, 120, 80, 80, 60].map((h, i) => (
        <div key={i} style={{
          height: h, borderRadius: "var(--r-md)",
          background: "var(--bg)",
          animation: `drawerPulse 1.5s ease-in-out ${i * 0.1}s infinite`,
        }} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusChip
// ---------------------------------------------------------------------------

function StatusChip({ expiresAt, status }: { expiresAt: string; status: string }) {
  if (status === "deleted") {
    return <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>Удалён</span>;
  }
  const d = getDaysLeft(expiresAt);
  if (d < 0) {
    return (
      <span style={{
        fontSize: "10px", fontWeight: 600,
        padding: "2px 8px", borderRadius: "var(--r-pill)",
        background: "var(--red-bg)", color: "var(--red-text)",
      }}>
        Просрочен
      </span>
    );
  }
  if (d <= 14) {
    return (
      <span style={{
        fontSize: "10px", fontWeight: 600,
        padding: "2px 8px", borderRadius: "var(--r-pill)",
        background: "var(--yellow-bg)", color: "var(--yellow-text)",
      }}>
        Истекает через {d} дн.
      </span>
    );
  }
  return (
    <span style={{
      fontSize: "10px", fontWeight: 600,
      padding: "2px 8px", borderRadius: "var(--r-pill)",
      background: "var(--green-bg)", color: "var(--green-text)",
    }}>
      Активен · {d} дн.
    </span>
  );
}

// ---------------------------------------------------------------------------
// PrescriptionDetailDrawer
// ---------------------------------------------------------------------------

export interface PrescriptionDetailDrawerProps {
  prescriptionId: string | null;
  onClose:        () => void;
  onDeleted:      () => void;
  onSaved:        () => void;
}

export default function PrescriptionDetailDrawer({
  prescriptionId,
  onClose,
  onDeleted,
  onSaved,
}: PrescriptionDetailDrawerProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  // Анимация: open/close через CSS transition
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (prescriptionId) {
      // небольшая задержка чтобы transition сработал после mount
      const t = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(t);
    } else {
      setVisible(false);
    }
  }, [prescriptionId]);

  // Закрытие по Escape
  useEffect(() => {
    if (!prescriptionId) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [prescriptionId, onClose]);

  const { data: prescription, isLoading, isError } = useQuery<PrescriptionDetail>({
    queryKey: ["prescription-drawer", prescriptionId],
    queryFn: () => api.get<PrescriptionDetail>(`/api/v1/prescriptions/${prescriptionId}`),
    enabled: !!prescriptionId,
    staleTime: 30_000,
  });

  async function handleDelete() {
    if (!prescriptionId) return;
    if (!confirm("Удалить этот рецепт? Это действие нельзя отменить.")) return;
    setDeleting(true);
    try {
      await api.delete(`/api/v1/prescriptions/${prescriptionId}`);
      onDeleted();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        alert(e.message);
      }
    } finally {
      setDeleting(false);
    }
  }

  if (!prescriptionId) return null;

  const docLabel = prescription ? (DOC_TYPE_LABELS[prescription.doc_type] ?? prescription.doc_type) : null;
  const riskCfg  = prescription ? RISK_CONFIG[prescription.risk_level] : null;

  const fieldLabel: React.CSSProperties = {
    fontSize: "10px", fontWeight: 700,
    color: "var(--text-secondary)",
    textTransform: "uppercase", letterSpacing: "0.06em",
    marginBottom: 3, display: "block",
  };

  const fieldValue: React.CSSProperties = {
    fontSize: "13px", color: "var(--text-primary)", fontWeight: 500,
  };

  return (
    <>
      <style>{`
        @keyframes drawerPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.45; }
        }
      `}</style>

      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.35)",
          backdropFilter: "blur(2px)",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.25s ease",
          pointerEvents: visible ? "auto" : "none",
        }}
      />

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 1001,
          width: "min(480px, 100vw)",
          background: "var(--surface)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "-8px 0 40px rgba(0,0,0,0.12)",
          display: "flex", flexDirection: "column",
          transform: visible ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
          overflowY: "auto",
          fontFamily: "Urbanist, sans-serif",
        }}
      >
        {/* ── Header ── */}
        <div style={{
          position: "sticky", top: 0, zIndex: 10,
          padding: "16px 20px",
          background: "var(--surface)",
          borderBottom: "1px solid var(--border-light)",
          display: "flex", alignItems: "flex-start", gap: 10,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: "15px", fontWeight: 800,
              color: "var(--text-primary)", letterSpacing: "-0.02em",
              marginBottom: 6,
            }}>
              {docLabel ? `Рецепт ${docLabel}` : "Рецепт"}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              {docLabel && (
                <span style={{
                  fontSize: "10px", fontWeight: 700,
                  padding: "2px 8px", borderRadius: "var(--r-pill)",
                  background: "var(--accent-light)", color: "var(--accent)",
                }}>
                  {docLabel}
                </span>
              )}
              {riskCfg && (
                <span style={{
                  fontSize: "10px", fontWeight: 700,
                  padding: "2px 8px", borderRadius: "var(--r-pill)",
                  background: riskCfg.bg, color: riskCfg.color,
                }}>
                  {riskCfg.label}
                </span>
              )}
              {prescription && (
                <StatusChip expiresAt={prescription.expires_at} status={prescription.status ?? ""} />
              )}
            </div>
          </div>

          {/* Close */}
          <button
            onClick={onClose}
            title="Закрыть"
            style={{
              flexShrink: 0,
              width: 32, height: 32,
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: "var(--r-sm)",
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text-muted)",
              cursor: "pointer", fontSize: 18, lineHeight: 1,
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "var(--surface-subtle)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "var(--bg)";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            ×
          </button>
        </div>

        {/* ── Content ── */}
        {isLoading && <SkeletonDrawer />}

        {isError && (
          <div style={{
            margin: 20, padding: "14px 16px",
            borderRadius: "var(--r-md)",
            background: "var(--red-bg)", color: "var(--red-text)",
            fontSize: "13px", fontWeight: 500,
          }}>
            ⚠ Не удалось загрузить рецепт
          </div>
        )}

        {prescription && (
          <div style={{ display: "flex", flexDirection: "column", gap: 0, flex: 1 }}>
            {/* Photo */}
            <div style={{ padding: "16px 20px 0" }}>
              <PhotoSection prescriptionId={prescription.id} />
            </div>

            {/* Данные рецепта */}
            <div style={{ padding: "16px 20px 0" }}>
              <div style={{
                fontSize: "11px", fontWeight: 700,
                color: "var(--text-secondary)",
                textTransform: "uppercase", letterSpacing: "0.06em",
                marginBottom: 10,
              }}>
                Данные рецепта
              </div>
              <div style={{
                background: "var(--bg)",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--border-light)",
                overflow: "hidden",
              }}>
                {[
                  { label: "Врач",        value: prescription.doctor_name || "—" },
                  { label: "Специальность", value: prescription.doctor_specialty || "—" },
                  { label: "Клиника",     value: prescription.clinic_name || "—" },
                  { label: "Дата выдачи", value: formatDate(prescription.issue_date) },
                  { label: "Действует до", value: computeExpires(prescription.issue_date, prescription.expires_at) },
                ].map((row, i, arr) => (
                  <div
                    key={row.label}
                    style={{
                      display: "flex", justifyContent: "space-between",
                      alignItems: "baseline", gap: 12,
                      padding: "10px 14px",
                      borderBottom: i < arr.length - 1 ? "1px solid var(--border-light)" : "none",
                    }}
                  >
                    <span style={{ ...fieldLabel, marginBottom: 0, flexShrink: 0 }}>{row.label}</span>
                    <span style={{
                      ...fieldValue,
                      textAlign: "right", maxWidth: 220,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Препараты */}
            {prescription.items.length > 0 && (
              <div style={{ padding: "16px 20px 0" }}>
                <div style={{
                  fontSize: "11px", fontWeight: 700,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase", letterSpacing: "0.06em",
                  marginBottom: 10,
                }}>
                  Препараты · {prescription.items.length}
                </div>
                <div style={{
                  background: "var(--bg)",
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--border-light)",
                  overflow: "hidden",
                }}>
                  {/* Шапка */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    gap: 8, padding: "8px 14px",
                    borderBottom: "1px solid var(--border-light)",
                    background: "var(--surface-subtle)",
                  }}>
                    {(["Название", "МНН", "Дозировка"] as const).map(h => (
                      <span key={h} style={{
                        fontSize: "10px", fontWeight: 700,
                        color: "var(--text-muted)",
                        textTransform: "uppercase", letterSpacing: "0.06em",
                      }}>
                        {h}
                      </span>
                    ))}
                  </div>
                  {prescription.items.map((item, i) => (
                    <div
                      key={item.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto auto",
                        gap: 8, padding: "9px 14px",
                        borderBottom: i < prescription.items.length - 1
                          ? "1px solid var(--border-light)" : "none",
                        alignItems: "center",
                      }}
                    >
                      <span style={{
                        fontSize: "12px", fontWeight: 600,
                        color: "var(--text-primary)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {item.drug_name}
                      </span>
                      <span style={{
                        fontSize: "11px", color: "var(--text-muted)",
                        whiteSpace: "nowrap", minWidth: 60, textAlign: "right",
                      }}>
                        {item.drug_inn ?? "—"}
                      </span>
                      <span style={{
                        fontSize: "11px", color: "var(--text-secondary)",
                        whiteSpace: "nowrap", minWidth: 60, textAlign: "right",
                      }}>
                        {item.dosage ?? "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Spacer */}
            <div style={{ flex: 1, minHeight: 20 }} />

            {/* ── Footer actions ── */}
            <div style={{
              position: "sticky", bottom: 0,
              padding: "14px 20px",
              background: "var(--surface)",
              borderTop: "1px solid var(--border-light)",
              display: "flex", gap: 8,
            }}>
              <button
                onClick={() => router.push(`/prescriptions/${prescription.id}`)}
                className="btn btn-primary"
                style={{ flex: 1, fontSize: "13px" }}
              >
                Редактировать →
              </button>
              <button
                onClick={() => { void handleDelete(); }}
                disabled={deleting}
                className="btn"
                style={{
                  fontSize: "13px",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  color: deleting ? "var(--text-muted)" : "var(--red-text)",
                  cursor: deleting ? "not-allowed" : "pointer",
                  opacity: deleting ? 0.5 : 1,
                  padding: "0 16px",
                }}
              >
                {deleting ? "…" : "Удалить"}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
