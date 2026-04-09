"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { uploadWithProgress } from "@/components/ui/UploadZone";
import { useBatchStore } from "@/lib/store";
import { useBatchSSE } from "@/hooks/useBatchSSE";
import { api } from "@/lib/api";
import type { BatchJob, ReceiptListItem } from "@/types/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UploadState = "idle" | "uploading" | "done" | "error";
type StepKind   = "pending" | "idle" | "active" | "done" | "alert";

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

// ---------------------------------------------------------------------------
// StepCircle
// ---------------------------------------------------------------------------

function StepCircle({
  kind, children, progress, spinning,
}: {
  kind: StepKind;
  children: React.ReactNode;
  progress?: number;
  spinning?: boolean;
}) {
  const D = 64;
  const r = D / 2 + 5;
  const circ = 2 * Math.PI * r;

  const cfg: Record<StepKind, { bg: string; border: string; color: string; anim?: string }> = {
    pending: { bg: "var(--bg)",          border: "var(--border)",      color: "var(--text-muted)" },
    idle:    { bg: "var(--accent-light)", border: "var(--accent-mid)",  color: "var(--accent)",    anim: "ppIdlePulse 2.6s ease-in-out infinite" },
    active:  { bg: "var(--accent)",       border: "var(--accent-dark)", color: "#fff",             anim: "ppActivePulse 1.5s ease-in-out infinite" },
    done:    { bg: "#22C55E",             border: "#16A34A",            color: "#fff" },
    alert:   { bg: "#F59E0B",             border: "#D97706",            color: "#fff",             anim: "ppAlertPulse 1.8s ease-in-out infinite" },
  };
  const c = cfg[kind];

  return (
    <div style={{ position: "relative", width: D, height: D, flexShrink: 0 }}>
      {progress !== undefined && (
        <svg
          width={D + 14} height={D + 14}
          style={{ position: "absolute", top: -7, left: -7, transform: "rotate(-90deg)", pointerEvents: "none", zIndex: 2 }}
        >
          <circle cx={(D + 14) / 2} cy={(D + 14) / 2} r={r}
            fill="none" stroke="rgba(123,111,212,0.18)" strokeWidth="3"
          />
          <circle cx={(D + 14) / 2} cy={(D + 14) / 2} r={r}
            fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round"
            strokeDasharray={`${(progress / 100) * circ} ${circ}`}
            style={{ transition: "stroke-dasharray 0.25s ease" }}
          />
        </svg>
      )}

      {spinning && (
        <div style={{
          position: "absolute", inset: -4, borderRadius: "50%",
          border: "3px solid transparent",
          borderTopColor: "var(--accent)",
          animation: "ppSpin 0.85s linear infinite",
          zIndex: 2,
        }} />
      )}

      <div style={{
        width: D, height: D, borderRadius: "50%",
        background: c.bg,
        border: `2px solid ${c.border}`,
        color: c.color,
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: c.anim,
        transition: "background 0.35s, border-color 0.35s, color 0.35s",
        overflow: "hidden",
        position: "relative",
        zIndex: 1,
      }}>
        {kind === "active" && !spinning && (
          <div style={{
            position: "absolute", left: 0, right: 0, height: 2,
            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.9) 40%, rgba(255,255,255,0.9) 60%, transparent 100%)",
            animation: "ppScanBeam 1.6s ease-in-out infinite",
            pointerEvents: "none", zIndex: 3,
          }} />
        )}
        {kind === "done" ? (
          <span style={{ animation: "ppCheckPop 0.45s var(--ease-spring) both", display: "flex" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PipelineStep
// ---------------------------------------------------------------------------

function PipelineStep({
  kind, label, sublabel, icon, onClick, progress, spinning,
}: {
  kind: StepKind;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  onClick?: () => void;
  progress?: number;
  spinning?: boolean;
}) {
  const labelColor =
    kind === "done"   ? "#16A34A" :
    kind === "alert"  ? "#92400E" :
    kind === "active" ? "var(--accent)" :
    kind === "idle"   ? "var(--text-primary)" :
    "var(--text-muted)";

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: 10, flex: 1, minWidth: 0,
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      <StepCircle kind={kind} progress={progress} spinning={spinning}>
        {icon}
      </StepCircle>
      <div style={{ textAlign: "center", width: "100%" }}>
        <div style={{
          fontSize: "12px", fontWeight: 700, letterSpacing: "-0.01em",
          color: labelColor,
          transition: "color 0.3s",
        }}>
          {label}
        </div>
        <div style={{
          fontSize: "11px", color: "var(--text-muted)", marginTop: 2,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          maxWidth: 120,
        }}>
          {sublabel}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StepConnector
// ---------------------------------------------------------------------------

function StepConnector({ filled }: { filled: boolean }) {
  return (
    <div style={{
      flexShrink: 0, width: 52,
      display: "flex", alignItems: "flex-start",
      paddingTop: 30,
    }}>
      <div style={{ position: "relative", width: "100%", height: 2 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 1, background: "var(--border-strong)" }} />
        {filled && (
          <div style={{
            position: "absolute", inset: 0, borderRadius: 1,
            background: "#22C55E",
            animation: "ppLineFill 0.55s var(--ease-spring) both",
            transformOrigin: "left",
          }} />
        )}
        <div style={{
          position: "absolute", right: -1, top: "50%",
          width: 6, height: 6,
          borderTop: `2px solid ${filled ? "#22C55E" : "var(--border-strong)"}`,
          borderRight: `2px solid ${filled ? "#22C55E" : "var(--border-strong)"}`,
          transform: "translateY(-50%) rotate(45deg)",
          transition: "border-color 0.5s",
        }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function IconUpload() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M12 12v9" />
      <path d="m16 16-4-4-4 4" />
    </svg>
  );
}

function IconScan() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  );
}

function IconReview() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function DotLoader() {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", justifyContent: "center", height: 14 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 5, height: 5, borderRadius: "50%",
          background: "rgba(255,255,255,0.85)",
          animation: `ppDotBlink 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProcessingPipeline — exported component
// ---------------------------------------------------------------------------

export function ProcessingPipeline({ onRefetch }: { onRefetch?: () => void }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStuckSince, setProcessingStuckSince] = useState<number | null>(null);
  const [showStuckWarning, setShowStuckWarning] = useState(false);
  const [reviewCheckState, setReviewCheckState] = useState<"idle" | "checking" | "done">("idle");

  const {
    activeBatch, totalFiles, doneCount, reviewCount, failedCount, completed,
    startBatch, clearBatch,
  } = useBatchStore();

  useBatchSSE(activeBatch);

  useEffect(() => {
    if (!activeBatch || completed) {
      setProcessingStuckSince(null);
      setShowStuckWarning(false);
      return;
    }
    const processed = doneCount + reviewCount + failedCount;
    if (processed < totalFiles) {
      if (!processingStuckSince) setProcessingStuckSince(Date.now());
    } else {
      setProcessingStuckSince(null);
    }
  }, [activeBatch, completed, doneCount, reviewCount, failedCount, totalFiles]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!processingStuckSince) { setShowStuckWarning(false); return; }
    const t = setTimeout(() => setShowStuckWarning(true), 3 * 60 * 1000);
    return () => clearTimeout(t);
  }, [processingStuckSince]);

  useEffect(() => {
    if (!activeBatch && uploadState === "done") {
      setUploadState("idle");
      setUploadProgress(0);
    }
  }, [activeBatch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeBatch || !completed || reviewCount > 0) return;
    const t = setTimeout(() => {
      clearBatch();
      setUploadState("idle");
      setUploadProgress(0);
    }, 3000);
    return () => clearTimeout(t);
  }, [activeBatch, completed, reviewCount]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Авто-переход на шаг «Проверка» после завершения распознавания */
  useEffect(() => {
    if (!activeBatch || !completed || reviewCount === 0) return;
    if (reviewCheckState !== "idle") return;

    setReviewCheckState("checking");

    void (async () => {
      try {
        const queue = await api.get<ReceiptListItem[]>("/api/v1/receipts/review-queue");
        const firstItem = queue[0];
        clearBatch();
        setUploadState("idle");
        setUploadProgress(0);
        setReviewCheckState("idle");
        if (firstItem?.ocr_status === "DUPLICATE_REVIEW") {
          router.push("/duplicates");
        } else if (firstItem) {
          router.push("/review");
        }
      } catch {
        setReviewCheckState("done");
      }
    })();
  }, [activeBatch, completed, reviewCount]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Сброс состояния проверки при очистке батча */
  useEffect(() => {
    if (!activeBatch) setReviewCheckState("idle");
  }, [activeBatch]);

  const step1Kind: StepKind =
    uploadState === "uploading"                          ? "active" :
    uploadState === "error"                              ? "idle" :
    !!activeBatch && !completed                          ? "done" :
    uploadState === "done" && !!activeBatch && completed ? "idle" :
    uploadState === "done"                               ? "done" :
    "idle";

  const step2Kind: StepKind =
    !!activeBatch && !completed ? "active" :
    !!activeBatch &&  completed ? "done" :
    "pending";

  const step3Kind: StepKind =
    reviewCheckState === "checking"                                                           ? "active" :
    reviewCheckState === "done"                                                               ? "alert" :
    !!activeBatch && completed && reviewCount === 0 && failedCount > 0 && doneCount === 0    ? "alert" :
    !!activeBatch && completed && reviewCount === 0                                           ? "done" :
    "pending";

  const step1Sub =
    uploadState === "uploading"                          ? `${uploadProgress}%` :
    uploadState === "error"                              ? "Ошибка — повторите" :
    !!activeBatch && !completed                          ? "Файлы переданы" :
    !!activeBatch && completed && uploadState === "done" ? "Нажмите для загрузки" :
    uploadState === "done"                               ? "Файлы переданы" :
    "Нажмите для загрузки";

  const processed = doneCount + reviewCount + failedCount;
  const step2Sub =
    !!activeBatch && !completed ? `${processed} / ${totalFiles}` :
    !!activeBatch &&  completed ? `${totalFiles} ${plural(totalFiles, "файл", "файла", "файлов")}` :
    "Ожидает загрузки";

  const step3Sub =
    reviewCheckState === "checking"
      ? "Проверка дублей..." :
    reviewCheckState === "done"
      ? "Ошибка — попробуйте снова" :
    !!activeBatch && completed && failedCount > 0 && reviewCount === 0 && doneCount === 0
      ? "Не распознан" :
    !!activeBatch && completed && doneCount > 0 && reviewCount === 0
      ? "Дубликат, пропущен" :
    !!activeBatch && completed
      ? "Обработано" :
    "Ожидает обработки";

  function triggerUpload() {
    if (uploadState === "uploading") return;
    if (activeBatch) {
      clearBatch();
      setUploadState("idle");
      setUploadProgress(0);
    }
    setTimeout(() => fileInputRef.current?.click(), 0);
  }

  async function handleFiles(files: FileList) {
    if (!files.length) return;
    const fd = new FormData();
    Array.from(files).forEach(f => fd.append("files", f));

    setUploadState("uploading");
    setUploadProgress(0);

    try {
      const job: BatchJob = await uploadWithProgress("/api/v1/batch", fd, setUploadProgress);
      startBatch(job.batch_id, job.total_files);
      setUploadState("done");
      onRefetch?.();
    } catch {
      setUploadState("error");
      setTimeout(() => setUploadState("idle"), 4000);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="card" style={{ padding: "22px 28px" }}>
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        <PipelineStep
          kind={step1Kind}
          label="Загрузить"
          sublabel={step1Sub}
          icon={step2Kind === "active" ? <DotLoader /> : <IconUpload />}
          onClick={triggerUpload}
          progress={uploadState === "uploading" ? uploadProgress : undefined}
          spinning={uploadState === "uploading"}
        />

        <StepConnector filled={step1Kind === "done"} />

        <PipelineStep
          kind={step2Kind}
          label="Распознавание"
          sublabel={step2Sub}
          icon={<IconScan />}
        />

        <StepConnector filled={step2Kind === "done"} />

        <PipelineStep
          kind={step3Kind}
          label="Проверка"
          sublabel={step3Sub}
          icon={<IconReview />}
        />
      </div>

      {showStuckWarning && (
        <div style={{
          marginTop: 14,
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "12px 16px",
          background: "rgba(239,68,68,0.07)",
          border: "1px solid rgba(239,68,68,0.28)",
          borderRadius: "var(--r-md)",
        }}>
          <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>⚠</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--red-text)", marginBottom: 2 }}>
              Распознавание занимает слишком долго
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Возможная причина: ошибка связи с сервером распознавания или временный сбой. Попробуйте{" "}
              <button
                onClick={() => { clearBatch(); setUploadState("idle"); setShowStuckWarning(false); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontWeight: 600, fontSize: 12, padding: 0, textDecoration: "underline" }}
              >
                сбросить и загрузить повторно
              </button>.
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp,.pdf"
        style={{ display: "none" }}
        onChange={e => { if (e.target.files?.length) void handleFiles(e.target.files); }}
      />
    </div>
  );
}
