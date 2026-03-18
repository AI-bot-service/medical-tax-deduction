"use client";

import { useRouter } from "next/navigation";
import { useSummary } from "@/hooks/useSummary";
import type { Summary, ReceiptListItem } from "@/types/api";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ReceiptListResponse } from "@/types/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEDUCTION_LIMIT = 150_000;
const NDFL_RATE = 0.13;

function formatRub(amount: string | number | undefined): string {
  if (amount === undefined || amount === null) return "—";
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return n.toLocaleString("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU");
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl bg-gray-100 p-5 h-28" />
  );
}

interface StatCardProps {
  label: string;
  value: string;
  icon: string;
  accent?: string;
}
function StatCard({ label, value, icon, accent = "text-blue-600" }: StatCardProps) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className={`mt-1 text-xl font-bold ${accent}`}>{value}</p>
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  );
}

interface YearProgressProps {
  pct: number;
  spent: string;
}
function YearProgress({ pct, spent }: YearProgressProps) {
  const capped = Math.min(pct, 100);
  const color =
    capped > 90 ? "bg-red-500" : capped > 50 ? "bg-yellow-400" : "bg-green-500";
  const textColor =
    capped > 90 ? "text-red-600" : capped > 50 ? "text-yellow-600" : "text-green-600";

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-gray-700">Использовано лимита 150 000 ₽</p>
        <span className={`text-sm font-bold ${textColor}`}>{capped.toFixed(1)}%</span>
      </div>
      <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${capped}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Потрачено: {spent} из {formatRub(DEDUCTION_LIMIT)}
      </p>
    </div>
  );
}

interface ConfidenceBadgeProps {
  status: ReceiptListItem["ocr_status"];
}
function ConfidenceBadge({ status }: ConfidenceBadgeProps) {
  const map: Record<string, [string, string]> = {
    DONE: ["bg-green-100 text-green-700", "Готов"],
    REVIEW: ["bg-yellow-100 text-yellow-700", "Проверка"],
    PENDING: ["bg-gray-100 text-gray-600", "Обработка"],
    FAILED: ["bg-red-100 text-red-700", "Ошибка"],
  };
  const [cls, label] = map[status] ?? ["bg-gray-100 text-gray-600", status];
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

interface RecentReceiptsProps {
  receipts: ReceiptListItem[];
}
function RecentReceipts({ receipts }: RecentReceiptsProps) {
  const router = useRouter();
  if (receipts.length === 0) {
    return (
      <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
        <p className="text-sm font-medium text-gray-700 mb-3">Последние чеки</p>
        <p className="text-sm text-gray-400 text-center py-4">Чеков пока нет</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
      <p className="text-sm font-medium text-gray-700 mb-3">Последние чеки</p>
      <ul className="divide-y divide-gray-50">
        {receipts.map((r) => (
          <li
            key={r.id}
            onClick={() => router.push(`/receipts/${r.id}`)}
            className="flex items-center justify-between py-2 cursor-pointer hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-gray-800">
                {r.pharmacy_name ?? "Аптека"}
              </p>
              <p className="text-xs text-gray-400">{formatDate(r.purchase_date)}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-gray-700">
                {r.total_amount ? formatRub(r.total_amount) : "—"}
              </span>
              <ConfidenceBadge status={r.ocr_status} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface DeductionCalcProps {
  deduction: string;
}
function DeductionCalc({ deduction }: DeductionCalcProps) {
  const amount = parseFloat(deduction || "0");
  const ndflReturn = Math.round(amount * NDFL_RATE);
  return (
    <div className="rounded-xl bg-blue-50 p-5 shadow-sm border border-blue-100">
      <p className="text-sm font-medium text-blue-800 mb-1">Расчёт вычета</p>
      <p className="text-xs text-blue-600">
        Сумма к вычету:{" "}
        <span className="font-semibold">{formatRub(deduction)}</span>
      </p>
      <p className="text-xs text-blue-600 mt-0.5">
        Возврат НДФЛ 13%:{" "}
        <span className="font-bold text-blue-800">{formatRub(ndflReturn)}</span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard loaded content
// ---------------------------------------------------------------------------

function DashboardContent({ summary }: { summary: Summary }) {
  const { data: receiptData } = useQuery<ReceiptListResponse>({
    queryKey: ["receipts-list"],
    queryFn: () => api.get<ReceiptListResponse>("/api/v1/receipts"),
    staleTime: 60_000,
  });

  const allReceipts: ReceiptListItem[] = (receiptData?.months ?? []).flatMap(
    (m) => m.receipts,
  );
  const recentReceipts = allReceipts.slice(0, 5);

  const errorCount = allReceipts.filter(
    (r) => r.ocr_status === "REVIEW" || r.ocr_status === "FAILED",
  ).length;

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Итого расходов"
          value={formatRub(summary.total_amount)}
          icon="💊"
          accent="text-gray-900"
        />
        <StatCard
          label="Вычет 13%"
          value={formatRub(
            String(Math.round(parseFloat(summary.deduction_amount) * NDFL_RATE)),
          )}
          icon="💰"
          accent="text-green-600"
        />
        <StatCard
          label="Чеков"
          value={String(summary.months.reduce((s, m) => s + m.receipts_count, 0))}
          icon="🧾"
          accent="text-blue-600"
        />
        <StatCard
          label="Требуют проверки"
          value={String(errorCount)}
          icon="⚠️"
          accent={errorCount > 0 ? "text-red-600" : "text-gray-400"}
        />
      </div>

      {/* Year Progress */}
      <YearProgress
        pct={summary.limit_used_pct}
        spent={formatRub(summary.total_amount)}
      />

      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <RecentReceipts receipts={recentReceipts} />
        <DeductionCalc deduction={summary.deduction_amount} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const year = new Date().getFullYear();
  const { data: summary, isLoading, isError } = useSummary(year);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">
          Дашборд · {year}
        </h1>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-xl bg-red-50 p-6 text-center text-sm text-red-700">
          Не удалось загрузить данные. Проверьте соединение.
        </div>
      )}

      {summary && <DashboardContent summary={summary} />}
    </main>
  );
}
