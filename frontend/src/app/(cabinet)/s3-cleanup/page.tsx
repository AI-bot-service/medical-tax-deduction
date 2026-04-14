"use client";

import { useState, useEffect } from "react";
import {
  Database,
  Trash2,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  HardDrive,
  Archive,
  Package,
} from "lucide-react";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BucketStats {
  total: number;
  linked: number;
  orphan: number;
  orphan_size_bytes: number;
}

interface AnalyzeResponse {
  buckets: Record<string, BucketStats>;
  total_s3_objects: number;
  total_linked: number;
  total_orphans: number;
  total_orphan_size_bytes: number;
}

interface PurgeResponse {
  deleted_count: number;
  freed_bytes: number;
}

type Phase = "scanning" | "done" | "purging" | "purged" | "error";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} ГБ`;
}

const BUCKET_META: Record<string, { label: string; Icon: typeof HardDrive }> = {
  receipts:      { label: "Чеки",          Icon: HardDrive },
  prescriptions: { label: "Рецепты",       Icon: Package   },
  exports:       { label: "Экспорты (ZIP)", Icon: Archive   },
};

const SCAN_STEPS = [
  "Подключаемся к хранилищу...",
  "Сканируем бакет: чеки...",
  "Сканируем бакет: рецепты...",
  "Сканируем бакет: экспорты...",
  "Сверяем с базой данных...",
  "Формируем отчёт...",
];

// ---------------------------------------------------------------------------
// BucketCard
// ---------------------------------------------------------------------------

function BucketCard({
  name,
  stats,
  delay,
}: {
  name: string;
  stats: BucketStats;
  delay: number;
}) {
  const meta = BUCKET_META[name] ?? { label: name, Icon: HardDrive };
  const { Icon } = meta;
  const hasOrphans = stats.orphan > 0;

  return (
    <div
      style={{
        background: "var(--surface)",
        border: `1.5px solid ${hasOrphans ? "#FDBA74" : "var(--border-light)"}`,
        borderRadius: "var(--r-lg)",
        padding: "20px 20px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        boxShadow: hasOrphans
          ? "0 4px 20px rgba(251,146,60,0.12)"
          : "0 2px 12px rgba(26,26,46,0.04)",
        animation: `fadeInUp 0.45s ease both`,
        animationDelay: `${delay}ms`,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "var(--r-sm)",
              background: hasOrphans ? "#FFF7ED" : "var(--accent-light)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon
              size={16}
              style={{ color: hasOrphans ? "#EA580C" : "var(--accent)" }}
              strokeWidth={2}
            />
          </div>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text-primary)",
              letterSpacing: "-0.02em",
            }}
          >
            {meta.label}
          </span>
        </div>
        {hasOrphans && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: "#EA580C",
              background: "#FFF7ED",
              border: "1px solid #FDBA74",
              borderRadius: "var(--r-sm)",
              padding: "2px 7px",
            }}
          >
            МУСОР
          </span>
        )}
        {!hasOrphans && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: "var(--green-text)",
              background: "var(--green-bg)",
              borderRadius: "var(--r-sm)",
              padding: "2px 7px",
            }}
          >
            ЧИСТО
          </span>
        )}
      </div>

      {/* Stats row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 8,
          background: "var(--surface-subtle)",
          borderRadius: "var(--r-md)",
          padding: "12px 8px",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "var(--text-primary)",
              letterSpacing: "-0.04em",
              lineHeight: 1,
            }}
          >
            {stats.total}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3, fontWeight: 500 }}>
            всего
          </div>
        </div>
        <div style={{ textAlign: "center", borderLeft: "1px solid var(--border-light)", borderRight: "1px solid var(--border-light)" }}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "var(--green-text)",
              letterSpacing: "-0.04em",
              lineHeight: 1,
            }}
          >
            {stats.linked}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3, fontWeight: 500 }}>
            связано
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: hasOrphans ? "#EA580C" : "var(--text-disabled)",
              letterSpacing: "-0.04em",
              lineHeight: 1,
            }}
          >
            {stats.orphan}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3, fontWeight: 500 }}>
            мусор
          </div>
        </div>
      </div>

      {/* Orphan size */}
      {hasOrphans && (
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#EA580C",
            textAlign: "center",
            background: "#FFF7ED",
            borderRadius: "var(--r-sm)",
            padding: "5px 0",
          }}
        >
          {formatBytes(stats.orphan_size_bytes)} занято мусором
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scanning card
// ---------------------------------------------------------------------------

function ScanningCard({ step }: { step: number }) {
  const progress = Math.round(((step + 1) / SCAN_STEPS.length) * 100);

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #1A1A2E 0%, #2D2560 50%, #1A1A2E 100%)",
        borderRadius: "var(--r-lg)",
        padding: "32px 28px",
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 8px 40px rgba(123,111,212,0.25)",
        animation: "fadeInUp 0.3s ease both",
      }}
    >
      {/* Animated background orbs */}
      <div
        style={{
          position: "absolute",
          top: -40,
          right: -40,
          width: 160,
          height: 160,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(123,111,212,0.35) 0%, transparent 70%)",
          animation: "orbPulse 3s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -30,
          left: -30,
          width: 120,
          height: 120,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(168,159,224,0.2) 0%, transparent 70%)",
          animation: "orbPulse 3s ease-in-out infinite 1.5s",
        }}
      />

      {/* Loader + step */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 24, position: "relative" }}>
        {/* Ring loader */}
        <div style={{ position: "relative", width: 44, height: 44, flexShrink: 0 }}>
          <svg width="44" height="44" viewBox="0 0 44 44" style={{ animation: "spinRing 1.4s linear infinite" }}>
            <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
            <circle
              cx="22"
              cy="22"
              r="18"
              fill="none"
              stroke="#A89FE0"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="80 33"
            />
          </svg>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--accent)",
                animation: "dotPulse 1.4s ease-in-out infinite",
              }}
            />
          </div>
        </div>

        <div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#FFFFFF",
              letterSpacing: "-0.02em",
              marginBottom: 3,
            }}
          >
            Анализ хранилища
          </div>
          <div
            style={{
              fontSize: 12,
              color: "rgba(168,159,224,0.9)",
              fontWeight: 500,
              transition: "all 0.3s ease",
            }}
          >
            {SCAN_STEPS[step]}
          </div>
        </div>
      </div>

      {/* Steps list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 22, position: "relative" }}>
        {SCAN_STEPS.map((s, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              opacity: i > step ? 0.35 : 1,
              transition: "opacity 0.35s ease",
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                background:
                  i < step
                    ? "var(--green)"
                    : i === step
                    ? "var(--accent)"
                    : "rgba(255,255,255,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "background 0.3s ease",
                boxShadow: i === step ? "0 0 0 4px rgba(123,111,212,0.3)" : "none",
              }}
            >
              {i < step ? (
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <polyline
                    points="2,5 4,7.5 8,2.5"
                    fill="none"
                    stroke="white"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <div
                  style={{
                    width: i === step ? 6 : 4,
                    height: i === step ? 6 : 4,
                    borderRadius: "50%",
                    background: i === step ? "white" : "rgba(255,255,255,0.4)",
                    transition: "all 0.3s ease",
                  }}
                />
              )}
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: i === step ? 600 : 400,
                color: i === step ? "white" : "rgba(255,255,255,0.55)",
                transition: "all 0.3s ease",
              }}
            >
              {s}
            </span>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 4,
          background: "rgba(255,255,255,0.1)",
          borderRadius: 9999,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            background: "linear-gradient(90deg, var(--accent) 0%, #A89FE0 100%)",
            borderRadius: 9999,
            transition: "width 0.45s cubic-bezier(.4,0,.2,1)",
            boxShadow: "0 0 8px rgba(123,111,212,0.6)",
          }}
        />
      </div>
      <div
        style={{
          textAlign: "right",
          fontSize: 11,
          color: "rgba(168,159,224,0.7)",
          fontWeight: 600,
          marginTop: 6,
        }}
      >
        {progress}%
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary card
// ---------------------------------------------------------------------------

function SummaryCard({ analysis }: { analysis: AnalyzeResponse }) {
  const hasOrphans = analysis.total_orphans > 0;
  return (
    <div
      style={{
        background: "var(--surface)",
        border: `1.5px solid ${hasOrphans ? "#FDBA74" : "var(--border-light)"}`,
        borderRadius: "var(--r-lg)",
        padding: "22px 24px",
        boxShadow: hasOrphans
          ? "0 4px 24px rgba(251,146,60,0.1)"
          : "0 2px 16px rgba(26,26,46,0.04)",
        animation: "fadeInUp 0.45s ease both",
        animationDelay: "350ms",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.07em",
          color: "var(--text-muted)",
          marginBottom: 14,
          textTransform: "uppercase",
        }}
      >
        Итого по всем бакетам
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {[
          {
            value: analysis.total_s3_objects,
            label: "объектов в S3",
            color: "var(--text-primary)",
          },
          {
            value: analysis.total_linked,
            label: "связано с БД",
            color: "var(--green-text)",
          },
          {
            value: analysis.total_orphans,
            label: "мусорных файлов",
            color: hasOrphans ? "#EA580C" : "var(--text-disabled)",
          },
        ].map(({ value, label, color }) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 32,
                fontWeight: 800,
                color,
                letterSpacing: "-0.05em",
                lineHeight: 1,
              }}
            >
              {value}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginTop: 4,
                fontWeight: 500,
              }}
            >
              {label}
            </div>
          </div>
        ))}
      </div>

      {hasOrphans ? (
        <div
          style={{
            marginTop: 16,
            background: "#FFF7ED",
            border: "1px solid #FDBA74",
            borderRadius: "var(--r-md)",
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <AlertTriangle size={14} style={{ color: "#EA580C", flexShrink: 0 }} strokeWidth={2.5} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "#EA580C" }}>
            Обнаружен мусор: {formatBytes(analysis.total_orphan_size_bytes)} занято неиспользуемыми файлами
          </span>
        </div>
      ) : (
        <div
          style={{
            marginTop: 16,
            background: "var(--green-bg)",
            borderRadius: "var(--r-md)",
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <CheckCircle size={14} style={{ color: "var(--green-text)", flexShrink: 0 }} strokeWidth={2.5} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--green-text)" }}>
            Хранилище чистое — мусорных файлов не обнаружено
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Purging card
// ---------------------------------------------------------------------------

function PurgingCard() {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #7F1D1D 0%, #991B1B 50%, #7F1D1D 100%)",
        borderRadius: "var(--r-lg)",
        padding: "36px 28px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 8px 40px rgba(239,68,68,0.3)",
        animation: "fadeInUp 0.35s ease both",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -60,
          right: -60,
          width: 200,
          height: 200,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(239,68,68,0.3) 0%, transparent 70%)",
          animation: "orbPulse 2.5s ease-in-out infinite",
        }}
      />

      <div style={{ position: "relative" }}>
        <div style={{ marginBottom: 16, display: "flex", justifyContent: "center" }}>
          <svg width="52" height="52" viewBox="0 0 52 52" style={{ animation: "spinRing 1.2s linear infinite" }}>
            <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(239,68,68,0.2)" strokeWidth="3" />
            <circle
              cx="26"
              cy="26"
              r="22"
              fill="none"
              stroke="#FCA5A5"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="96 42"
            />
          </svg>
        </div>
        <div
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: "white",
            letterSpacing: "-0.02em",
            marginBottom: 6,
          }}
        >
          Удаляем мусорные файлы...
        </div>
        <div style={{ fontSize: 12, color: "rgba(252,165,165,0.8)", fontWeight: 500 }}>
          Не закрывайте страницу — операция выполняется
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Purged card
// ---------------------------------------------------------------------------

function PurgedCard({
  result,
  onReanalyze,
}: {
  result: PurgeResponse;
  onReanalyze: () => void;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1.5px solid var(--border-light)",
        borderRadius: "var(--r-lg)",
        padding: "36px 28px",
        textAlign: "center",
        animation: "fadeInUp 0.4s ease both",
        boxShadow: "0 4px 24px rgba(34,197,94,0.1)",
      }}
    >
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: "50%",
          background: "var(--green-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 18px",
          animation: "popIn 0.4s cubic-bezier(.175,.885,.32,1.275) both",
        }}
      >
        <CheckCircle
          size={28}
          style={{ color: "var(--green-text)", animation: "fadeIn 0.3s ease 0.2s both" }}
          strokeWidth={2}
        />
      </div>

      <div
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: "var(--text-primary)",
          letterSpacing: "-0.03em",
          marginBottom: 4,
        }}
      >
        Очистка завершена
      </div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>
        Хранилище успешно очищено от мусорных файлов
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginBottom: 24,
        }}
      >
        {[
          {
            value: result.deleted_count,
            label: "файлов удалено",
            color: "var(--red-text)",
            bg: "var(--red-bg)",
          },
          {
            value: formatBytes(result.freed_bytes),
            label: "освобождено",
            color: "var(--green-text)",
            bg: "var(--green-bg)",
          },
        ].map(({ value, label, color, bg }) => (
          <div
            key={label}
            style={{
              background: bg,
              borderRadius: "var(--r-md)",
              padding: "14px 12px",
            }}
          >
            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                color,
                letterSpacing: "-0.04em",
                lineHeight: 1,
              }}
            >
              {value}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, fontWeight: 500 }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onReanalyze}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          padding: "10px 22px",
          borderRadius: "var(--r-md)",
          background: "var(--accent)",
          border: "none",
          color: "white",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          letterSpacing: "-0.01em",
          transition: "background 0.2s ease, transform 0.15s ease",
          boxShadow: "0 4px 12px rgba(123,111,212,0.3)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "var(--accent-dark)";
          (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "var(--accent)";
          (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
        }}
      >
        <RefreshCw size={13} strokeWidth={2.5} />
        Запустить новый анализ
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error card
// ---------------------------------------------------------------------------

function ErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1.5px solid #FCA5A5",
        borderRadius: "var(--r-lg)",
        padding: "28px 24px",
        animation: "fadeInUp 0.35s ease both",
        boxShadow: "0 4px 20px rgba(239,68,68,0.08)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "var(--r-sm)",
            background: "var(--red-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <AlertTriangle size={17} style={{ color: "var(--red-text)" }} strokeWidth={2.5} />
        </div>
        <div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--red-text)",
              marginBottom: 4,
            }}
          >
            Произошла ошибка
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{message}</div>
        </div>
      </div>

      <button
        onClick={onRetry}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          padding: "9px 18px",
          borderRadius: "var(--r-md)",
          background: "none",
          border: "1.5px solid var(--border)",
          color: "var(--text-secondary)",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          transition: "border-color 0.2s, color 0.2s, transform 0.15s",
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLButtonElement;
          el.style.borderColor = "var(--accent)";
          el.style.color = "var(--accent)";
          el.style.transform = "translateY(-1px)";
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLButtonElement;
          el.style.borderColor = "var(--border)";
          el.style.color = "var(--text-secondary)";
          el.style.transform = "translateY(0)";
        }}
      >
        <RefreshCw size={12} strokeWidth={2.5} />
        Попробовать снова
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const STEP_DELAY = 480;

export default function S3CleanupPage() {
  const [phase, setPhase] = useState<Phase>("scanning");
  const [scanStep, setScanStep] = useState(0);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [purgeResult, setPurgeResult] = useState<PurgeResponse | null>(null);
  const [error, setError] = useState("");

  async function handleAnalyze() {
    setPhase("scanning");
    setScanStep(0);
    setAnalysis(null);
    setPurgeResult(null);
    setError("");

    for (let i = 1; i < SCAN_STEPS.length; i++) {
      await new Promise<void>((r) => setTimeout(r, STEP_DELAY));
      setScanStep(i);
    }

    try {
      const data = await api.get<AnalyzeResponse>("/api/v1/admin/s3/analyze");
      setAnalysis(data);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка при анализе");
      setPhase("error");
    }
  }

  async function handlePurge() {
    setPhase("purging");
    try {
      const result = await api.post<PurgeResponse>("/api/v1/admin/s3/purge");
      setPurgeResult(result);
      setPhase("purged");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка при очистке");
      setPhase("error");
    }
  }

  // Auto-analyze on page load
  useEffect(() => {
    void handleAnalyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes spinRing {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes orbPulse {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.08); }
        }
        @keyframes dotPulse {
          0%, 100% { opacity: 1;   transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.7); }
        }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.6); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>

      <div style={{ maxWidth: 760, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 28,
            animation: "fadeInUp 0.35s ease both",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "var(--r-md)",
                background: "linear-gradient(135deg, var(--accent-dark) 0%, var(--accent) 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 14px rgba(123,111,212,0.35)",
              }}
            >
              <Database size={20} style={{ color: "white" }} strokeWidth={2} />
            </div>
            <div>
              <h1
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: "var(--text-primary)",
                  letterSpacing: "-0.04em",
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                Очистка S3
              </h1>
              <p
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  margin: "3px 0 0",
                  fontWeight: 500,
                }}
              >
                Управление файлами облачного хранилища
              </p>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 12px 5px 9px",
              borderRadius: "var(--r-md)",
              background: "var(--accent-light)",
              border: "1.5px solid rgba(123,111,212,0.2)",
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--accent)",
                animation: "dotPulse 2s ease-in-out infinite",
              }}
            />
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.1em",
                color: "var(--accent-dark)",
              }}
            >
              ADMIN
            </span>
          </div>
        </div>

        {/* ── Content ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Scanning */}
          {phase === "scanning" && <ScanningCard step={scanStep} />}

          {/* Done */}
          {phase === "done" && analysis && (
            <>
              {/* Bucket cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {Object.entries(analysis.buckets).map(([name, stats], i) => (
                  <BucketCard key={name} name={name} stats={stats} delay={i * 90} />
                ))}
              </div>

              {/* Summary */}
              <SummaryCard analysis={analysis} />

              {/* Actions */}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  animation: "fadeInUp 0.45s ease both",
                  animationDelay: "450ms",
                }}
              >
                <button
                  onClick={handleAnalyze}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                    padding: "11px 16px",
                    borderRadius: "var(--r-md)",
                    background: "var(--surface)",
                    border: "1.5px solid var(--border)",
                    color: "var(--text-secondary)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "border-color 0.2s, color 0.2s, transform 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.borderColor = "var(--accent)";
                    el.style.color = "var(--accent)";
                    el.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.borderColor = "var(--border)";
                    el.style.color = "var(--text-secondary)";
                    el.style.transform = "translateY(0)";
                  }}
                >
                  <RefreshCw size={13} strokeWidth={2.5} />
                  Обновить анализ
                </button>

                {analysis.total_orphans > 0 && (
                  <button
                    onClick={handlePurge}
                    style={{
                      flex: 2,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      padding: "11px 20px",
                      borderRadius: "var(--r-md)",
                      background: "var(--red)",
                      border: "none",
                      color: "white",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      letterSpacing: "-0.01em",
                      transition: "background 0.2s, transform 0.15s",
                      boxShadow: "0 4px 14px rgba(239,68,68,0.3)",
                    }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLButtonElement;
                      el.style.background = "var(--red-text)";
                      el.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLButtonElement;
                      el.style.background = "var(--red)";
                      el.style.transform = "translateY(0)";
                    }}
                  >
                    <Trash2 size={14} strokeWidth={2.5} />
                    Очистить {analysis.total_orphans} файл
                    {analysis.total_orphans === 1
                      ? ""
                      : analysis.total_orphans < 5
                      ? "а"
                      : "ов"}{" "}
                    <span style={{ opacity: 0.75, fontWeight: 500 }}>
                      ({formatBytes(analysis.total_orphan_size_bytes)})
                    </span>
                  </button>
                )}
              </div>
            </>
          )}

          {/* Purging */}
          {phase === "purging" && <PurgingCard />}

          {/* Purged */}
          {phase === "purged" && purgeResult && (
            <PurgedCard result={purgeResult} onReanalyze={handleAnalyze} />
          )}

          {/* Error */}
          {phase === "error" && (
            <ErrorCard message={error} onRetry={handleAnalyze} />
          )}
        </div>
      </div>
    </>
  );
}
