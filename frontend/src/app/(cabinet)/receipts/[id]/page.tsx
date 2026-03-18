"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  ReceiptDetail,
  ReceiptItem,
  Prescription,
  PrescriptionListResponse,
} from "@/types/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRub(v: string | null | undefined): string {
  if (!v) return "—";
  return parseFloat(v).toLocaleString("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  });
}

const DOC_TYPE_LABELS: Record<string, string> = {
  recipe_107: "107-1/у",
  recipe_egisz: "ЕГИСЗ",
  doc_025: "025/у",
  doc_003: "003/у",
  doc_043: "043/у",
  doc_111: "111/у",
  doc_025_1: "025-1/у",
};

// ---------------------------------------------------------------------------
// PresignedImage — auto-refresh every 14 min
// ---------------------------------------------------------------------------

interface PresignedImageProps {
  receiptId: string;
}
function PresignedImage({ receiptId }: PresignedImageProps) {
  const REFRESH_MS = 14 * 60 * 1000;
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchUrl() {
    try {
      const detail = await api.get<ReceiptDetail>(`/api/v1/receipts/${receiptId}`);
      setImageUrl(detail.image_url ?? null);
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
  }, [receiptId]);

  if (!imageUrl) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
        Фото недоступно
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt="Фото чека"
      className="max-h-80 w-full rounded-xl object-contain border border-gray-200 bg-gray-50"
    />
  );
}

// ---------------------------------------------------------------------------
// OCREditor
// ---------------------------------------------------------------------------

interface OCREditorProps {
  receipt: ReceiptDetail;
  onSaved: () => void;
}
function OCREditor({ receipt, onSaved }: OCREditorProps) {
  const LOW_CONFIDENCE = 0.7;
  const hasLowConf =
    receipt.ocr_confidence !== null &&
    receipt.ocr_confidence !== undefined &&
    receipt.ocr_confidence < LOW_CONFIDENCE;

  const [date, setDate] = useState(receipt.purchase_date ?? "");
  const [pharmacy, setPharmacy] = useState(receipt.pharmacy_name ?? "");
  const [amount, setAmount] = useState(receipt.total_amount ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fieldCls = hasLowConf
    ? "border-yellow-300 bg-yellow-50 focus:border-yellow-500"
    : "border-gray-200 bg-white focus:border-blue-400";

  async function handleSave() {
    setSaving(true);
    try {
      await api.patch(`/api/v1/receipts/${receipt.id}`, {
        purchase_date: date || null,
        pharmacy_name: pharmacy || null,
        total_amount: amount ? parseFloat(amount) : null,
      });
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // error handling omitted for brevity
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl bg-white border border-gray-100 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">Данные чека</h2>
        {hasLowConf && (
          <span className="flex items-center gap-1 text-xs text-yellow-600">
            ⚠️ Низкая уверенность OCR ({Math.round((receipt.ocr_confidence ?? 0) * 100)}%)
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs text-gray-500">Дата покупки</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${fieldCls}`}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Аптека</label>
          <input
            type="text"
            value={pharmacy}
            onChange={(e) => setPharmacy(e.target.value)}
            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${fieldCls}`}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Сумма</label>
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${fieldCls}`}
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
        >
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
        {saved && <span className="text-sm text-green-600">✓ Сохранено</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PrescriptionLinker
// ---------------------------------------------------------------------------

interface PrescriptionLinkerProps {
  item: ReceiptItem;
  receiptId: string;
  onLinked: () => void;
}
function PrescriptionLinker({ item, receiptId, onLinked }: PrescriptionLinkerProps) {
  const [open, setOpen] = useState(false);
  const [linking, setLinking] = useState(false);

  const { data } = useQuery<PrescriptionListResponse>({
    queryKey: ["prescriptions-search", item.drug_inn],
    queryFn: () =>
      api.get<PrescriptionListResponse>(
        `/api/v1/prescriptions?drug_inn=${encodeURIComponent(item.drug_inn ?? "")}&status=active`,
      ),
    enabled: open && !!item.drug_inn,
    staleTime: 30_000,
  });

  async function handleLink(prescriptionId: string) {
    setLinking(true);
    try {
      await api.post(`/api/v1/prescriptions/link`, {
        prescription_id: prescriptionId,
        receipt_item_id: item.id,
      });
      onLinked();
      setOpen(false);
    } catch {
      // ignore
    } finally {
      setLinking(false);
    }
  }

  if (item.prescription_id) {
    return <span className="text-xs text-green-600">✓ Рецепт</span>;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-blue-500 hover:underline"
      >
        Привязать рецепт
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-72 rounded-xl bg-white border border-gray-200 shadow-lg p-3">
          <p className="text-xs font-semibold text-gray-700 mb-2">
            Рецепты для: {item.drug_inn ?? item.drug_name}
          </p>
          {!data && <p className="text-xs text-gray-400">Загрузка...</p>}
          {data?.items.length === 0 && (
            <p className="text-xs text-gray-400">Рецепты не найдены</p>
          )}
          {data?.items.map((p: Prescription) => (
            <div
              key={p.id}
              className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0"
            >
              <div>
                <p className="text-xs font-medium text-gray-800">{p.drug_name}</p>
                <p className="text-xs text-gray-400">
                  {DOC_TYPE_LABELS[p.doc_type] ?? p.doc_type} ·{" "}
                  {new Date(p.issue_date).toLocaleDateString("ru-RU")}
                </p>
                {p.risk_level !== "STANDARD" && (
                  <span className="text-xs text-yellow-600">⚠️ {p.risk_level}</span>
                )}
              </div>
              <button
                onClick={() => handleLink(p.id)}
                disabled={linking}
                className="text-xs text-blue-600 hover:underline disabled:opacity-50"
              >
                Привязать
              </button>
            </div>
          ))}
          <button
            onClick={() => setOpen(false)}
            className="mt-2 w-full text-xs text-gray-400 hover:text-gray-700"
          >
            Закрыть
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ItemsTable
// ---------------------------------------------------------------------------

interface ItemsTableProps {
  items: ReceiptItem[];
  receiptId: string;
  onLinked: () => void;
}
function ItemsTable({ items, receiptId, onLinked }: ItemsTableProps) {
  if (!items.length) {
    return (
      <div className="text-sm text-gray-400 text-center py-4">Позиции не найдены</div>
    );
  }
  return (
    <div className="rounded-xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-700">Препараты</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-400 border-b border-gray-50">
            <th className="px-4 py-2 text-left">Название</th>
            <th className="px-4 py-2 text-left">МНН</th>
            <th className="px-4 py-2 text-center">Кол-во</th>
            <th className="px-4 py-2 text-right">Цена</th>
            <th className="px-4 py-2 text-right">Сумма</th>
            <th className="px-4 py-2 text-center">Rх</th>
            <th className="px-4 py-2 text-center">Рецепт</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-gray-50">
              <td className="px-4 py-2.5 font-medium text-gray-800 max-w-[160px] truncate">
                {item.drug_name}
              </td>
              <td className="px-4 py-2.5 text-gray-500 text-xs">
                {item.drug_inn ?? "—"}
              </td>
              <td className="px-4 py-2.5 text-center text-gray-700">{item.quantity}</td>
              <td className="px-4 py-2.5 text-right text-gray-700">
                {formatRub(item.unit_price)}
              </td>
              <td className="px-4 py-2.5 text-right font-medium text-gray-800">
                {formatRub(item.total_price)}
              </td>
              <td className="px-4 py-2.5 text-center">
                {item.is_rx ? (
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                    Rx
                  </span>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-center">
                {item.is_rx ? (
                  <PrescriptionLinker
                    item={item}
                    receiptId={receiptId}
                    onLinked={onLinked}
                  />
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReceiptDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const queryClient = useQueryClient();

  const { data: receipt, isLoading, isError } = useQuery<ReceiptDetail>({
    queryKey: ["receipt", id],
    queryFn: () => api.get<ReceiptDetail>(`/api/v1/receipts/${id}`),
    staleTime: 30_000,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["receipt", id] });
    void queryClient.invalidateQueries({ queryKey: ["receipts-list"] });
  }

  const statusLabels: Record<string, string> = {
    DONE: "Готов",
    REVIEW: "Проверка",
    PENDING: "Обработка",
    FAILED: "Ошибка",
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => router.push("/receipts")}
          className="text-sm text-blue-500 hover:underline"
        >
          ← Назад
        </button>
        <h1 className="text-xl font-bold text-gray-900">Чек</h1>
        {receipt && (
          <span className="rounded-full bg-gray-100 px-3 py-0.5 text-xs font-medium text-gray-600">
            {statusLabels[receipt.ocr_status] ?? receipt.ocr_status}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse h-32 rounded-xl bg-gray-100" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-xl bg-red-50 p-6 text-center text-sm text-red-700">
          Не удалось загрузить чек.
        </div>
      )}

      {receipt && (
        <div className="space-y-5">
          {/* Photo */}
          <PresignedImage receiptId={id} />

          {/* OCR Editor */}
          <OCREditor receipt={receipt} onSaved={invalidate} />

          {/* Items Table */}
          <ItemsTable
            items={receipt.items}
            receiptId={id}
            onLinked={invalidate}
          />
        </div>
      )}
    </main>
  );
}
