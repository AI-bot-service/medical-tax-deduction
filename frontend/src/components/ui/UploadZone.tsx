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

export function UploadZone({ onUploaded }: UploadZoneProps) {
  const [previews, setPreviews] = useState<FilePreview[]>([]);
  const [uploading, setUploading] = useState(false);
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
    setError("");
    try {
      const form = new FormData();
      previews.forEach((p) => form.append("files", p.file));

      const res = await fetch("/api/v1/batch", {
        method: "POST",
        credentials: "include",
        body: form,
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(body.detail ?? `Ошибка ${res.status}`);
      }

      const batch = (await res.json()) as BatchJob;
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
    }
  }, [previews, startBatch, queryClient, onUploaded]);

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

      {/* Previews */}
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
            disabled={uploading}
            className="btn btn-primary"
            style={uploading ? { opacity: 0.55, cursor: "not-allowed" } : {}}
          >
            {uploading
              ? "Загрузка..."
              : `↑ Загрузить ${previews.length} ${previews.length === 1 ? "файл" : "файлов"}`}
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
