"use client";

import { useState } from "react";
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} ГБ`;
}

const BUCKET_LABELS: Record<string, { label: string; icon: string }> = {
  receipts: { label: "Чеки", icon: "🧾" },
  prescriptions: { label: "Рецепты", icon: "💊" },
  exports: { label: "Экспорты (ZIP)", icon: "📦" },
};

// ---------------------------------------------------------------------------
// Scan animation steps
// ---------------------------------------------------------------------------

const SCAN_STEPS = [
  "Подключаемся к хранилищу...",
  "Сканируем бакет: чеки...",
  "Сканируем бакет: рецепты...",
  "Сканируем бакет: экспорты...",
  "Сверяем с базой данных...",
  "Формируем отчёт...",
];

const STEP_DELAY = 500; // ms per step

// ---------------------------------------------------------------------------
// BucketCard
// ---------------------------------------------------------------------------

function BucketCard({ name, stats }: { name: string; stats: BucketStats }) {
  const meta = BUCKET_LABELS[name] ?? { label: name, icon: "🗂️" };
  const hasOrphans = stats.orphan > 0;
  return (
    <div
      className={[
        "rounded-xl border p-4",
        hasOrphans
          ? "bg-orange-50 border-orange-200"
          : "bg-green-50 border-green-100",
      ].join(" ")}
    >
      <p className="text-sm font-semibold text-gray-700 mb-3">
        {meta.icon} {meta.label}
      </p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xl font-bold text-gray-800">{stats.total}</p>
          <p className="text-xs text-gray-500">всего</p>
        </div>
        <div>
          <p className="text-xl font-bold text-green-700">{stats.linked}</p>
          <p className="text-xs text-gray-500">связано</p>
        </div>
        <div>
          <p
            className={[
              "text-xl font-bold",
              hasOrphans ? "text-orange-600" : "text-gray-400",
            ].join(" ")}
          >
            {stats.orphan}
          </p>
          <p className="text-xs text-gray-500">мусор</p>
        </div>
      </div>
      {hasOrphans && (
        <p className="mt-2 text-xs text-orange-600 text-center">
          {formatBytes(stats.orphan_size_bytes)}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Phase = "idle" | "scanning" | "done" | "purging" | "purged" | "error";

export default function S3CleanupPage() {
  const [phase, setPhase] = useState<Phase>("idle");
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

    // Animate steps
    for (let i = 1; i < SCAN_STEPS.length; i++) {
      await new Promise((r) => setTimeout(r, STEP_DELAY));
      setScanStep(i);
    }

    try {
      const data = await api.get<AnalyzeResponse>("/api/v1/admin/s3/analyze");
      setAnalysis(data);
      setPhase("done");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ошибка при анализе"
      );
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

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-xl font-bold text-gray-900">Очистка S3</h1>
      <p className="mb-6 text-sm text-gray-500">
        Найти и удалить файлы в облаке, не связанные ни с одной записью в базе данных.
      </p>

      <div className="space-y-4">
        {/* ── idle ── */}
        {phase === "idle" && (
          <button
            onClick={handleAnalyze}
            className="w-full rounded-lg bg-blue-600 py-3 text-base font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            🔍 Запустить анализ
          </button>
        )}

        {/* ── scanning ── */}
        {phase === "scanning" && (
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600 shrink-0" />
              <p className="text-sm font-medium text-blue-800">
                {SCAN_STEPS[scanStep]}
              </p>
            </div>
            {/* Progress dots */}
            <div className="flex gap-1.5">
              {SCAN_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={[
                    "h-1.5 flex-1 rounded-full transition-all duration-300",
                    i <= scanStep ? "bg-blue-500" : "bg-blue-200",
                  ].join(" ")}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── done ── */}
        {phase === "done" && analysis && (
          <>
            {/* Bucket cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {Object.entries(analysis.buckets).map(([name, stats]) => (
                <BucketCard key={name} name={name} stats={stats} />
              ))}
            </div>

            {/* Summary */}
            <div
              className={[
                "rounded-xl border p-5",
                analysis.total_orphans > 0
                  ? "bg-orange-50 border-orange-200"
                  : "bg-green-50 border-green-100",
              ].join(" ")}
            >
              <p className="text-sm font-semibold text-gray-700 mb-3">
                Итого
              </p>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-gray-800">
                    {analysis.total_s3_objects}
                  </p>
                  <p className="text-xs text-gray-500">объектов в S3</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-700">
                    {analysis.total_linked}
                  </p>
                  <p className="text-xs text-gray-500">связано с БД</p>
                </div>
                <div>
                  <p
                    className={[
                      "text-2xl font-bold",
                      analysis.total_orphans > 0
                        ? "text-orange-600"
                        : "text-gray-400",
                    ].join(" ")}
                  >
                    {analysis.total_orphans}
                  </p>
                  <p className="text-xs text-gray-500">мусор</p>
                </div>
              </div>
              {analysis.total_orphans > 0 && (
                <p className="mt-2 text-sm text-orange-600 text-center font-medium">
                  Занято: {formatBytes(analysis.total_orphan_size_bytes)}
                </p>
              )}
              {analysis.total_orphans === 0 && (
                <p className="mt-2 text-sm text-green-700 text-center font-medium">
                  ✓ Мусора нет — хранилище чистое
                </p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleAnalyze}
                className="flex-1 rounded-lg border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Обновить
              </button>
              {analysis.total_orphans > 0 && (
                <button
                  onClick={handlePurge}
                  className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
                >
                  🗑 Очистить диск ({analysis.total_orphans} файлов)
                </button>
              )}
            </div>
          </>
        )}

        {/* ── purging ── */}
        {phase === "purging" && (
          <div className="rounded-xl border border-red-100 bg-red-50 p-6 text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-red-200 border-t-red-600" />
            <p className="text-sm font-medium text-red-800">Удаляем мусорные файлы...</p>
            <p className="mt-1 text-xs text-red-500">Не закрывайте страницу</p>
          </div>
        )}

        {/* ── purged ── */}
        {phase === "purged" && purgeResult && (
          <>
            <div className="rounded-xl border border-green-100 bg-green-50 p-5 text-center">
              <p className="text-4xl mb-2">✓</p>
              <p className="text-sm font-semibold text-green-800">
                Очистка завершена
              </p>
              <p className="mt-1 text-sm text-green-700">
                Удалено файлов: <strong>{purgeResult.deleted_count}</strong>
              </p>
              <p className="text-sm text-green-700">
                Освобождено: <strong>{formatBytes(purgeResult.freed_bytes)}</strong>
              </p>
            </div>
            <button
              onClick={handleAnalyze}
              className="w-full rounded-lg border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Запустить анализ снова
            </button>
          </>
        )}

        {/* ── error ── */}
        {phase === "error" && (
          <>
            <div className="rounded-xl border border-red-100 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-700 mb-1">Ошибка</p>
              <p className="text-sm text-red-600">{error}</p>
            </div>
            <button
              onClick={handleAnalyze}
              className="w-full rounded-lg border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Попробовать снова
            </button>
          </>
        )}
      </div>
    </main>
  );
}
