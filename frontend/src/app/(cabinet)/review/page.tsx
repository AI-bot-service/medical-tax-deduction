"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useReviewStore } from "@/lib/store";
import type { ReceiptListResponse, ReceiptListItem, ReceiptDetail } from "@/types/api";

// ---------------------------------------------------------------------------
// ReviewCard
// ---------------------------------------------------------------------------

interface ReviewCardProps {
  item: ReceiptListItem;
  total: number;
  current: number;
  onApprove: () => void;
  onSkip: () => void;
}

function ReviewCard({ item, total, current, onApprove, onSkip }: ReviewCardProps) {
  const [detail, setDetail] = useState<ReceiptDetail | null>(null);
  const [date, setDate] = useState(item.purchase_date ?? "");
  const [pharmacy, setPharmacy] = useState(item.pharmacy_name ?? "");
  const [amount, setAmount] = useState(item.total_amount ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api.get<ReceiptDetail>(`/api/v1/receipts/${item.id}`).then((d) => {
      setDetail(d);
      setDate(d.purchase_date ?? "");
      setPharmacy(d.pharmacy_name ?? "");
      setAmount(d.total_amount ?? "");
    });
  }, [item.id]);

  const LOW_CONFIDENCE = 0.7;
  const isLowConf =
    item.ocr_confidence !== null &&
    item.ocr_confidence !== undefined &&
    item.ocr_confidence < LOW_CONFIDENCE;

  const highlightCls = isLowConf
    ? "border-yellow-300 bg-yellow-50 focus:border-yellow-500"
    : "border-gray-200 bg-white focus:border-blue-400";
  const inputBase =
    "w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors";
  const labelCls = "block text-xs text-gray-500 mb-1";

  async function handleApprove() {
    setSaving(true);
    try {
      await api.patch(`/api/v1/receipts/${item.id}`, {
        purchase_date: date || null,
        pharmacy_name: pharmacy || null,
        total_amount: amount ? parseFloat(amount) : null,
      });
      onApprove();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-gray-50 px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-yellow-100 px-3 py-0.5 text-xs font-medium text-yellow-700">
            Требует проверки
          </span>
          {isLowConf && (
            <span className="text-xs text-yellow-600">
              ⚠️ OCR {Math.round((item.ocr_confidence ?? 0) * 100)}%
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400">
          {current} из {total}
        </span>
      </div>

      <div className="flex flex-col gap-5 p-5 sm:flex-row">
        {/* Photo */}
        <div className="sm:w-48 flex-shrink-0">
          {detail?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={detail.image_url}
              alt="Фото чека"
              className="h-48 w-full rounded-xl object-cover border border-gray-200"
            />
          ) : (
            <div className="flex h-48 items-center justify-center rounded-xl bg-gray-100 text-gray-400 text-sm">
              {detail === null ? "Загрузка..." : "Фото недоступно"}
            </div>
          )}
        </div>

        {/* Fields */}
        <div className="flex-1 flex flex-col gap-4">
          <div>
            <label className={labelCls}>Дата покупки</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={`${inputBase} ${highlightCls}`}
            />
          </div>
          <div>
            <label className={labelCls}>Аптека</label>
            <input
              type="text"
              value={pharmacy}
              onChange={(e) => setPharmacy(e.target.value)}
              className={`${inputBase} ${highlightCls}`}
            />
          </div>
          <div>
            <label className={labelCls}>Сумма</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${inputBase} ${highlightCls}`}
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 mt-auto">
            <button
              onClick={handleApprove}
              disabled={saving}
              className="flex-1 rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-gray-300 transition-colors"
            >
              {saving ? "Сохранение..." : "✓ Подтвердить"}
            </button>
            <button
              onClick={onSkip}
              disabled={saving}
              className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Пропустить →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReviewPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { queue, currentIdx, loadQueue, approve, skip } = useReviewStore();

  const { data, isLoading } = useQuery<ReceiptListResponse>({
    queryKey: ["receipts-review"],
    queryFn: () => api.get<ReceiptListResponse>("/api/v1/receipts?status=REVIEW"),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (data) {
      const reviewItems = data.months.flatMap((m) =>
        m.receipts.filter((r) => r.ocr_status === "REVIEW"),
      );
      loadQueue(reviewItems);
    }
  }, [data, loadQueue]);

  const currentItem = queue[currentIdx] ?? null;
  const remaining = queue.length - currentIdx;

  function handleApprove() {
    void queryClient.invalidateQueries({ queryKey: ["receipts-review"] });
    void queryClient.invalidateQueries({ queryKey: ["receipts-list"] });
    approve();
    if (currentIdx + 1 >= queue.length) {
      router.push("/dashboard");
    }
  }

  function handleSkip() {
    skip();
    if (currentIdx + 1 >= queue.length) {
      router.push("/dashboard");
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Очередь проверки</h1>
        {remaining > 0 && (
          <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-700">
            {remaining} чек{remaining === 1 ? "" : "ов"} требует проверки
          </span>
        )}
      </div>

      {isLoading && (
        <div className="animate-pulse h-64 rounded-xl bg-gray-100" />
      )}

      {!isLoading && queue.length === 0 && (
        <div className="rounded-xl bg-green-50 border border-green-100 p-12 text-center">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-lg font-semibold text-green-800">Всё проверено!</p>
          <p className="mt-1 text-sm text-green-600">
            Нет чеков, требующих ручной проверки
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-5 rounded-lg bg-green-600 px-6 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
          >
            На дашборд
          </button>
        </div>
      )}

      {!isLoading && currentItem && currentIdx < queue.length && (
        <ReviewCard
          item={currentItem}
          total={queue.length}
          current={currentIdx + 1}
          onApprove={handleApprove}
          onSkip={handleSkip}
        />
      )}

      {!isLoading && queue.length > 0 && currentIdx >= queue.length && (
        <div className="rounded-xl bg-blue-50 border border-blue-100 p-12 text-center">
          <p className="text-4xl mb-3">🎉</p>
          <p className="text-lg font-semibold text-blue-800">
            Вы просмотрели все чеки в очереди
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-5 rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            На дашборд
          </button>
        </div>
      )}
    </main>
  );
}
