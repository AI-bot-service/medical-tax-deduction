"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { UploadZone } from "@/components/ui/UploadZone";
import { BatchProgress } from "@/components/ui/BatchProgress";
import { useBatchStore } from "@/lib/store";
import type { ReceiptListResponse, ReceiptListItem, OCRStatus } from "@/types/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRub(amount: string | null | undefined): string {
  if (!amount) return "—";
  const n = parseFloat(amount);
  return n.toLocaleString("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  });
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU");
}

// ---------------------------------------------------------------------------
// ConfidenceBadge
// ---------------------------------------------------------------------------

interface ConfidenceBadgeProps {
  status: OCRStatus;
  confidence?: number | null;
}
function ConfidenceBadge({ status, confidence }: ConfidenceBadgeProps) {
  let cls: string;
  let label: string;

  if (status === "DONE") {
    if (confidence !== undefined && confidence !== null) {
      if (confidence >= 0.85) {
        cls = "bg-green-100 text-green-700";
        label = `✓ ${Math.round(confidence * 100)}%`;
      } else if (confidence >= 0.6) {
        cls = "bg-yellow-100 text-yellow-700";
        label = `⚠ ${Math.round(confidence * 100)}%`;
      } else {
        cls = "bg-red-100 text-red-700";
        label = `✗ ${Math.round(confidence * 100)}%`;
      }
    } else {
      cls = "bg-green-100 text-green-700";
      label = "Готов";
    }
  } else if (status === "REVIEW") {
    cls = "bg-yellow-100 text-yellow-700";
    label = "Проверка";
  } else if (status === "FAILED") {
    cls = "bg-red-100 text-red-700";
    label = "Ошибка";
  } else {
    cls = "bg-gray-100 text-gray-600";
    label = "Обработка";
  }

  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ReceiptTable
// ---------------------------------------------------------------------------

interface ReceiptTableProps {
  data: ReceiptListResponse;
  selectedMonth: string;
}

type SortField = "purchase_date" | "total_amount" | "pharmacy_name";
type SortDir = "asc" | "desc";

function ReceiptTable({ data, selectedMonth }: ReceiptTableProps) {
  const router = useRouter();
  const [sortField, setSortField] = useState<SortField>("purchase_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const months = data.months.filter(
    (m) => selectedMonth === "all" || m.month === selectedMonth,
  );

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function sortReceipts(receipts: ReceiptListItem[]): ReceiptListItem[] {
    return [...receipts].sort((a, b) => {
      let cmp = 0;
      if (sortField === "purchase_date") {
        cmp = (a.purchase_date ?? "").localeCompare(b.purchase_date ?? "");
      } else if (sortField === "total_amount") {
        cmp = parseFloat(a.total_amount ?? "0") - parseFloat(b.total_amount ?? "0");
      } else {
        cmp = (a.pharmacy_name ?? "").localeCompare(b.pharmacy_name ?? "");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }

  const sortIcon = (field: SortField) =>
    sortField === field ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  if (months.length === 0) {
    return (
      <div className="rounded-xl bg-white border border-gray-100 p-8 text-center text-sm text-gray-400">
        Нет чеков за выбранный период
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {months.map((month) => {
        const sorted = sortReceipts(month.receipts);
        return (
          <div
            key={month.month}
            className="rounded-xl bg-white border border-gray-100 shadow-sm overflow-hidden"
          >
            {/* Month header */}
            <div className="flex items-center justify-between bg-gray-50 px-4 py-2 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-700">
                {new Date(month.month + "-01").toLocaleDateString("ru-RU", {
                  month: "long",
                  year: "numeric",
                })}
              </span>
              <span className="text-sm font-medium text-gray-500">
                Итого: {formatRub(month.total_amount)}
              </span>
            </div>

            {/* Table */}
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-50">
                  <th
                    className="px-4 py-2 text-left cursor-pointer hover:text-gray-700"
                    onClick={() => toggleSort("purchase_date")}
                  >
                    Дата{sortIcon("purchase_date")}
                  </th>
                  <th
                    className="px-4 py-2 text-left cursor-pointer hover:text-gray-700"
                    onClick={() => toggleSort("pharmacy_name")}
                  >
                    Аптека{sortIcon("pharmacy_name")}
                  </th>
                  <th
                    className="px-4 py-2 text-right cursor-pointer hover:text-gray-700"
                    onClick={() => toggleSort("total_amount")}
                  >
                    Сумма{sortIcon("total_amount")}
                  </th>
                  <th className="px-4 py-2 text-center">Статус</th>
                  <th className="px-4 py-2 text-center">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sorted.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => router.push(`/receipts/${r.id}`)}
                  >
                    <td className="px-4 py-2.5 text-gray-700">
                      {formatDate(r.purchase_date)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 max-w-[180px] truncate">
                      {r.pharmacy_name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-800">
                      {formatRub(r.total_amount)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <ConfidenceBadge
                        status={r.ocr_status}
                        confidence={r.ocr_confidence}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/receipts/${r.id}`);
                        }}
                        className="text-blue-500 hover:underline text-xs"
                      >
                        Открыть
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MonthFilter
// ---------------------------------------------------------------------------

interface MonthFilterProps {
  months: string[];
  value: string;
  onChange: (v: string) => void;
}
function MonthFilter({ months, value, onChange }: MonthFilterProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-400"
    >
      <option value="all">Все месяцы</option>
      {months.map((m) => (
        <option key={m} value={m}>
          {new Date(m + "-01").toLocaleDateString("ru-RU", {
            month: "long",
            year: "numeric",
          })}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReceiptsPage() {
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [showUpload, setShowUpload] = useState(false);
  const activeBatch = useBatchStore((s) => s.activeBatch);

  const { data, isLoading, isError, refetch } = useQuery<ReceiptListResponse>({
    queryKey: ["receipts-list"],
    queryFn: () => api.get<ReceiptListResponse>("/api/v1/receipts"),
    staleTime: 30_000,
  });

  const allMonths = data?.months.map((m) => m.month) ?? [];

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Мои чеки</h1>
        <button
          onClick={() => setShowUpload((v) => !v)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          {showUpload ? "Скрыть" : "+ Загрузить чеки"}
        </button>
      </div>

      {showUpload && (
        <div className="mb-6 rounded-xl bg-white border border-gray-100 p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Загрузка чеков</h2>
          <UploadZone
            onUploaded={() => {
              setShowUpload(false);
              void refetch();
            }}
          />
        </div>
      )}

      {activeBatch && (
        <div className="mb-6">
          <BatchProgress />
        </div>
      )}

      {/* Filter bar */}
      {!isLoading && data && (
        <div className="mb-4 flex items-center gap-3">
          <MonthFilter
            months={allMonths}
            value={selectedMonth}
            onChange={setSelectedMonth}
          />
          <span className="text-sm text-gray-400">
            {data.total_count} чек{data.total_count === 1 ? "" : "ов"}
          </span>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse h-12 rounded-xl bg-gray-100" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-xl bg-red-50 p-6 text-center text-sm text-red-700">
          Не удалось загрузить список чеков.
        </div>
      )}

      {data && (
        <ReceiptTable data={data} selectedMonth={selectedMonth} />
      )}
    </main>
  );
}
