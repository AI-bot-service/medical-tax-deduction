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
  objectUrl: string | null; // null for PDF
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

      const res = await fetch("/api/v1/batches", {
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

      // Clean up previews
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
    <div className="flex flex-col gap-4">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className={[
          "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors",
          dragging
            ? "border-blue-400 bg-blue-50"
            : "border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50",
        ].join(" ")}
      >
        <span className="text-3xl">📁</span>
        <p className="text-sm font-medium text-gray-700">
          Перетащите чеки сюда или нажмите для выбора
        </p>
        <p className="text-xs text-gray-400">
          JPG, PNG, WEBP, PDF · до {MAX_SIZE_MB} МБ каждый
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={handleInputChange}
        />
      </div>

      {/* Previews */}
      {previews.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {previews.map((p, idx) => (
            <div key={idx} className="relative group">
              {p.objectUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.objectUrl}
                  alt={p.file.name}
                  className="h-20 w-20 rounded-lg object-cover border border-gray-200"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-gray-200 bg-gray-100">
                  <span className="text-2xl">📄</span>
                </div>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(idx);
                }}
                className="absolute -top-2 -right-2 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs"
              >
                ×
              </button>
              <p className="mt-1 max-w-[5rem] truncate text-xs text-gray-500">
                {p.file.name}
              </p>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {previews.length > 0 && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className={[
            "rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition-colors",
            uploading
              ? "cursor-not-allowed bg-gray-300"
              : "bg-blue-600 hover:bg-blue-700",
          ].join(" ")}
        >
          {uploading
            ? "Загрузка..."
            : `Загрузить ${previews.length} ${previews.length === 1 ? "файл" : "файлов"}`}
        </button>
      )}
    </div>
  );
}
