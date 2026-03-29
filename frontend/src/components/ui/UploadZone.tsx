"use client";

import {
  useCallback,
  useRef,
  useState,
  type DragEvent,
  type ChangeEvent,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBatchStore } from "@/lib/store";
import { ApiError } from "@/lib/api";
import type { BatchJob } from "@/types/api";

const ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf";
const ACCEPT_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE_MB = 20;

interface FilePreview {
  file: File;
  objectUrl: string | null;
}

interface UploadZoneProps {
  onUploaded?: () => void;
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

/* ─── XHR upload с отслеживанием прогресса + 401 retry ─── */
async function uploadWithProgress(
  url: string,
  body: FormData,
  onProgress: (pct: number) => void,
): Promise<BatchJob> {
  const doXHR = (formData: FormData): Promise<{ status: number; body: string }> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      xhr.withCredentials = true;
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 95)); // max 95% — оставим 5% на ответ сервера
        }
      };
      xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
      xhr.onerror = () => reject(new Error("Ошибка сети"));
      xhr.send(formData);
    });

  let result = await doXHR(body);

  if (result.status === 401) {
    // Пытаемся обновить токен
    const refresh = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    if (!refresh.ok) throw new ApiError(401, "Сессия истекла");
    result = await doXHR(body);
  }

  onProgress(100);

  if (result.status < 200 || result.status >= 300) {
    let message = "Ошибка загрузки";
    try {
      const b = JSON.parse(result.body) as { detail?: string };
      if (b.detail) message = b.detail;
    } catch { /* ignore */ }
    throw new ApiError(result.status, message);
  }

  return JSON.parse(result.body) as BatchJob;
}

/* ─── Анимация загрузки ─── */
function UploadProgressCard({
  progress,
  fileCount,
}: {
  progress: number;
  fileCount: number;
}) {
  const isDone = progress >= 100;
  const label =
    progress === 0
      ? "Подготовка..."
      : isDone
        ? "Запускаем распознавание..."
        : "Передача данных на сервер...";

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 20,
      padding: "36px 24px",
      borderRadius: "var(--r-md)",
      border: "1px solid var(--border)",
      background: "var(--surface-subtle)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Фоновый блик */}
      <div style={{
        position: "absolute",
        top: "-80px", left: "50%", transform: "translateX(-50%)",
        width: 320, height: 320,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(123,111,212,0.07) 0%, transparent 70%)",
        pointerEvents: "none",
      }}/>

      {/* Иконка облака */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <svg
          viewBox="0 0 64 64"
          fill="none"
          style={{ width: 64, height: 64 }}
        >
          {/* Облако */}
          <path
            d="M48 40H40M16 40H28M28 40C28 40 22 40 18 36C14 32 14 26 18 22C20.5 19 24 18 27 18.5C28 14 32 11 37 12C42 13 45 17 44.5 22C47 22 50 24 50 28C50 32 48 35 44 36C42 37 40 37 40 37"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
          {/* Стрелка вверх */}
          <g style={{ animation: "uzArrow 1.6s ease-in-out infinite" }}>
            <line x1="32" y1="48" x2="32" y2="30" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"/>
            <polyline points="26,37 32,30 38,37" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </g>
        </svg>

        {/* Пульс вокруг иконки */}
        <div style={{
          position: "absolute",
          inset: -8,
          borderRadius: "50%",
          border: "2px solid rgba(123,111,212,0.2)",
          animation: "uzPulse 2s ease-out infinite",
        }}/>
      </div>

      {/* Текст */}
      <div style={{ textAlign: "center", zIndex: 1 }}>
        <p style={{
          margin: "0 0 4px",
          fontSize: 15,
          fontWeight: 700,
          color: "var(--text-primary)",
          letterSpacing: "-0.02em",
        }}>
          {isDone
            ? "Файлы загружены"
            : `Загружаем ${fileCount} ${plural(fileCount, "файл", "файла", "файлов")}`}
        </p>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
          {label}
        </p>
      </div>

      {/* Прогресс-бар */}
      <div style={{ width: "100%", maxWidth: 360, zIndex: 1 }}>
        <div style={{
          height: 6,
          borderRadius: 3,
          background: "var(--border)",
          overflow: "hidden",
          position: "relative",
        }}>
          <div style={{
            position: "absolute",
            left: 0, top: 0, bottom: 0,
            width: `${progress}%`,
            background: isDone
              ? "var(--green)"
              : "linear-gradient(90deg, var(--accent-mid), var(--accent))",
            borderRadius: 3,
            transition: "width 0.3s ease, background 0.4s ease",
          }}/>
          {/* Бегущий блик на прогресс-баре */}
          {!isDone && (
            <div style={{
              position: "absolute",
              top: 0, bottom: 0,
              width: 60,
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)",
              animation: "uzSheen 1.8s linear infinite",
              borderRadius: 3,
            }}/>
          )}
        </div>

        {/* Процент */}
        <div style={{
          display: "flex",
          justifyContent: "flex-end",
          marginTop: 6,
        }}>
          <span style={{
            fontSize: 12,
            fontWeight: 700,
            color: isDone ? "var(--green-text)" : "var(--accent)",
            fontVariantNumeric: "tabular-nums",
            transition: "color 0.4s ease",
          }}>
            {progress}%
          </span>
        </div>
      </div>

      <style>{`
        @keyframes uzArrow {
          0%, 100% { transform: translateY(0);   opacity: 1; }
          45%       { transform: translateY(-5px); opacity: 0.6; }
          50%       { transform: translateY(6px);  opacity: 0; }
          55%       { transform: translateY(6px);  opacity: 0; }
          60%       { transform: translateY(0);    opacity: 1; }
        }
        @keyframes uzPulse {
          0%   { transform: scale(1);    opacity: 0.7; }
          70%  { transform: scale(1.6);  opacity: 0;   }
          100% { transform: scale(1.6);  opacity: 0;   }
        }
        @keyframes uzSheen {
          0%   { left: -80px; }
          100% { left: calc(100% + 20px); }
        }
      `}</style>
    </div>
  );
}

/* ─── Основной компонент ─── */
export function UploadZone({ onUploaded }: UploadZoneProps) {
  const [previews, setPreviews] = useState<FilePreview[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startBatch = useBatchStore((s) => s.startBatch);
  const queryClient = useQueryClient();

  function addFiles(files: FileList | null) {
    if (!files) return;
    const valid: FilePreview[] = [];
    const errors: string[] = [];

    Array.from(files).forEach((f) => {
      if (!ACCEPT_MIME.includes(f.type)) {
        errors.push(`${f.name}: неподдерживаемый формат`);
        return;
      }
      if (f.size > MAX_SIZE_MB * 1024 * 1024) {
        errors.push(`${f.name}: файл больше ${MAX_SIZE_MB} МБ`);
        return;
      }
      const objectUrl = f.type.startsWith("image/") ? URL.createObjectURL(f) : null;
      valid.push({ file: f, objectUrl });
    });

    if (errors.length) setError(errors.join("; "));
    else setError("");

    setPreviews((prev) => [...prev, ...valid]);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave() {
    setDragging(false);
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    addFiles(e.target.files);
    e.target.value = "";
  }

  function removeFile(idx: number) {
    setPreviews((prev) => {
      const item = prev[idx];
      if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
      return prev.filter((_, i) => i !== idx);
    });
  }

  const handleUpload = useCallback(async () => {
    if (!previews.length) return;
    setUploading(true);
    setUploadProgress(0);
    setError("");
    try {
      const form = new FormData();
      previews.forEach((p) => form.append("files", p.file));

      const batch = await uploadWithProgress(
        "/api/v1/batch",
        form,
        setUploadProgress,
      );

      startBatch(batch.batch_id, batch.total_files);

      previews.forEach((p) => {
        if (p.objectUrl) URL.revokeObjectURL(p.objectUrl);
      });
      setPreviews([]);

      await queryClient.invalidateQueries({ queryKey: ["receipts-list"] });
      onUploaded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [previews, startBatch, queryClient, onUploaded]);

  /* Показываем карточку прогресса поверх всего во время загрузки */
  if (uploading) {
    return <UploadProgressCard progress={uploadProgress} fileCount={previews.length} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          borderRadius: "var(--r-md)",
          border: "2px dashed " + (dragging ? "var(--accent)" : "var(--border-strong)"),
          padding: "32px 24px",
          cursor: "pointer",
          transition: "border-color 0.2s, background 0.2s",
          background: dragging ? "var(--accent-light)" : "var(--surface-subtle)",
        }}
      >
        <span style={{ fontSize: 32 }}>📁</span>
        <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
          Перетащите чеки сюда или нажмите для выбора
        </p>
        <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>
          JPG, PNG, WEBP, PDF · до {MAX_SIZE_MB} МБ каждый
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          style={{ display: "none" }}
          onChange={handleInputChange}
        />
      </div>

      {/* Превью файлов */}
      {previews.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {previews.map((p, idx) => (
            <div
              key={idx}
              style={{ position: "relative" }}
              onMouseEnter={(e) => {
                const btn = e.currentTarget.querySelector<HTMLButtonElement>(".remove-btn");
                if (btn) btn.style.display = "flex";
              }}
              onMouseLeave={(e) => {
                const btn = e.currentTarget.querySelector<HTMLButtonElement>(".remove-btn");
                if (btn) btn.style.display = "none";
              }}
            >
              {p.objectUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.objectUrl}
                  alt={p.file.name}
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: "var(--r-sm)",
                    objectFit: "cover",
                    border: "1px solid var(--border)",
                    display: "block",
                  }}
                />
              ) : (
                <div style={{
                  width: 80,
                  height: 80,
                  borderRadius: "var(--r-sm)",
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 28,
                }}>
                  📄
                </div>
              )}
              <button
                className="remove-btn"
                onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                style={{
                  display: "none",
                  position: "absolute",
                  top: -6,
                  right: -6,
                  width: 20,
                  height: 20,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "50%",
                  background: "var(--red)",
                  color: "#fff",
                  fontSize: 12,
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
              <p style={{
                marginTop: 4,
                maxWidth: 80,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: "11px",
                color: "var(--text-muted)",
                margin: "4px 0 0",
              }}>
                {p.file.name}
              </p>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p style={{ fontSize: "12px", color: "var(--red-text)", margin: 0 }}>
          {error}
        </p>
      )}

      {previews.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={handleUpload}
            className="btn btn-primary"
          >
            Загрузить {previews.length} {previews.length === 1 ? "файл" : "файлов"}
          </button>
          <button
            onClick={() => {
              previews.forEach((p) => { if (p.objectUrl) URL.revokeObjectURL(p.objectUrl); });
              setPreviews([]);
            }}
            className="btn btn-secondary btn-sm"
          >
            Отмена
          </button>
        </div>
      )}
    </div>
  );
}
