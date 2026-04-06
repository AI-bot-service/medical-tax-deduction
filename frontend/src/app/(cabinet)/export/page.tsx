"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useSummary } from "@/hooks/useSummary";
import { useDashboardStore } from "@/lib/store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExportCreateResponse {
  export_id: string;
  status: string;
  year: number;
}

interface ExportStatusResponse {
  export_id: string;
  status: string;
  year: number;
  download_url: string | null;
  created_at: string;
  completed_at: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const POLL_INTERVAL = 2000;

// ---------------------------------------------------------------------------
// ExportPreview
// ---------------------------------------------------------------------------

interface ExportPreviewProps {
  year: number;
}
function ExportPreview({ year }: ExportPreviewProps) {
  const { data: summary } = useSummary(year);
  if (!summary) {
    return <div className="animate-pulse h-20 rounded-xl bg-gray-100" />;
  }
  const receiptsCount = summary.months.reduce((s, m) => s + m.receipts_count, 0);
  return (
    <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
      <p className="text-sm font-semibold text-blue-800 mb-2">Состав ZIP-архива</p>
      <ul className="text-sm text-blue-700 space-y-1">
        <li>📄 PDF Реестр расходов {year}</li>
        <li>🧾 {receiptsCount} чек{receiptsCount === 1 ? "" : "ов"} за {year} год</li>
        <li>💊 Рецепты к Rx-препаратам</li>
        <li>📝 Сопроводительное письмо для ИФНС</li>
      </ul>
      <p className="mt-3 text-xs text-blue-500">
        Итого к вычету: {parseFloat(summary.deduction_amount).toLocaleString("ru-RU", {
          style: "currency",
          currency: "RUB",
          maximumFractionDigits: 0,
        })}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ExportPage() {
  const selectedYear = useDashboardStore(s => s.selectedYear);
  const [exportJob, setExportJob] = useState<ExportCreateResponse | null>(null);
  const [status, setStatus] = useState<ExportStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => {
    return stopPolling;
  }, []);

  async function handleCreateExport() {
    setLoading(true);
    setError("");
    setStatus(null);
    try {
      const job = await api.post<ExportCreateResponse>(
        `/api/v1/export?year=${selectedYear}`,
      );
      setExportJob(job);

      // Start polling
      pollRef.current = setInterval(async () => {
        try {
          const s = await api.get<ExportStatusResponse>(`/api/v1/export/${job.export_id}`);
          setStatus(s);
          if (s.status === "done" || s.status === "failed") {
            stopPolling();
          }
        } catch {
          stopPolling();
        }
      }, POLL_INTERVAL);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка создания экспорта");
    } finally {
      setLoading(false);
    }
  }

  const isDone = status?.status === "done";
  const isFailed = status?.status === "failed";
  const isProcessing = exportJob && !isDone && !isFailed;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-xl font-bold text-gray-900">Экспорт для ИФНС</h1>

      <div className="space-y-5">
        {/* Preview */}
        <ExportPreview year={selectedYear} />

        {/* Create button */}
        {!exportJob && (
          <button
            onClick={handleCreateExport}
            disabled={loading}
            className={[
              "w-full rounded-lg py-3 text-base font-semibold text-white transition-colors",
              loading
                ? "cursor-not-allowed bg-gray-300"
                : "bg-blue-600 hover:bg-blue-700",
            ].join(" ")}
          >
            {loading ? "Создание задачи..." : "📦 Сформировать ZIP"}
          </button>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Processing state */}
        {isProcessing && (
          <div className="rounded-xl bg-blue-50 border border-blue-100 p-5 text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
            <p className="text-sm font-medium text-blue-800">Готовлю архив...</p>
            <p className="text-xs text-blue-500 mt-1">
              Обычно занимает 10–30 секунд
            </p>
          </div>
        )}

        {/* Done state */}
        {isDone && status?.download_url && (
          <div className="rounded-xl bg-green-50 border border-green-100 p-5">
            <p className="text-sm font-semibold text-green-800 mb-3">
              ✓ Архив готов!
            </p>
            <a
              href={status.download_url}
              download={`medvychet_${status.year}.zip`}
              className="block w-full rounded-lg bg-green-600 py-3 text-center text-base font-semibold text-white hover:bg-green-700 transition-colors"
            >
              ⬇️ Скачать ZIP ({status.year})
            </a>
            <p className="mt-2 text-xs text-green-600 text-center">
              Ссылка действительна 7 дней
            </p>
          </div>
        )}

        {/* Failed state */}
        {isFailed && (
          <div className="rounded-xl bg-red-50 border border-red-100 p-5 text-center">
            <p className="text-sm text-red-700">Ошибка формирования архива</p>
            <button
              onClick={() => {
                setExportJob(null);
                setStatus(null);
              }}
              className="mt-3 text-sm text-blue-500 hover:underline"
            >
              Попробовать снова
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
