"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PrescriptionListResponse, Prescription, DocType } from "@/types/api";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOC_TYPE_LABELS: Record<DocType, string> = {
  recipe_107: "107-1/у",
  recipe_egisz: "ЕГИСЗ",
  doc_025: "025/у",
  doc_003: "003/у",
  doc_043: "043/у",
  doc_111: "111/у",
  doc_025_1: "025-1/у",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDaysUntilExpiry(expiresAt: string): number {
  const now = new Date();
  const exp = new Date(expiresAt);
  return Math.floor((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function StatusBadge({ prescription }: { prescription: Prescription }) {
  const daysLeft = getDaysUntilExpiry(prescription.expires_at);
  const isExpired = daysLeft < 0;
  const isExpiringSoon = daysLeft >= 0 && daysLeft <= 14;

  if (prescription.status === "deleted") {
    return (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
        Удалён
      </span>
    );
  }

  if (isExpired) {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        Просрочен {Math.abs(daysLeft)} дн.
      </span>
    );
  }

  if (isExpiringSoon) {
    return (
      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
        Истекает через {daysLeft} дн.
      </span>
    );
  }

  return (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
      Активен
    </span>
  );
}

function RiskBadge({ risk }: { risk: string }) {
  if (risk === "DISPUTED") {
    return (
      <span className="rounded-full bg-yellow-50 px-2 py-0.5 text-xs text-yellow-600 border border-yellow-200">
        ⚠️ Спорный
      </span>
    );
  }
  if (risk === "HIGH") {
    return (
      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-600 border border-red-200">
        🔴 Высокий риск
      </span>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PrescriptionsPage() {
  const router = useRouter();
  const [docTypeFilter, setDocTypeFilter] = useState<string>("all");

  const { data, isLoading, isError } = useQuery<PrescriptionListResponse>({
    queryKey: ["prescriptions", docTypeFilter],
    queryFn: () => {
      const qs = docTypeFilter !== "all" ? `?doc_type=${docTypeFilter}` : "";
      return api.get<PrescriptionListResponse>(`/api/v1/prescriptions${qs}`);
    },
    staleTime: 30_000,
  });

  const items = data?.items ?? [];

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Рецепты</h1>
        <button
          onClick={() => router.push("/prescriptions/new")}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          + Добавить рецепт
        </button>
      </div>

      {/* DocType Filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setDocTypeFilter("all")}
          className={[
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            docTypeFilter === "all"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200",
          ].join(" ")}
        >
          Все
        </button>
        {Object.entries(DOC_TYPE_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setDocTypeFilter(key)}
            className={[
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              docTypeFilter === key
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse h-16 rounded-xl bg-gray-100" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-xl bg-red-50 p-6 text-center text-sm text-red-700">
          Не удалось загрузить рецепты.
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="rounded-xl bg-gray-50 p-8 text-center">
          <p className="text-sm text-gray-500">Рецепты не найдены</p>
          <button
            onClick={() => router.push("/prescriptions/new")}
            className="mt-3 text-sm text-blue-500 hover:underline"
          >
            Добавить первый рецепт
          </button>
        </div>
      )}

      {items.length > 0 && (
        <div className="rounded-xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-50 bg-gray-50">
                <th className="px-4 py-2 text-left">Препарат</th>
                <th className="px-4 py-2 text-left">Тип</th>
                <th className="px-4 py-2 text-left">Врач</th>
                <th className="px-4 py-2 text-center">Выдан</th>
                <th className="px-4 py-2 text-center">Истекает</th>
                <th className="px-4 py-2 text-center">Статус</th>
                <th className="px-4 py-2 text-center">Риск</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-800">
                    <div>{p.drug_name}</div>
                    {p.drug_inn && (
                      <div className="text-xs text-gray-400">{p.drug_inn}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {DOC_TYPE_LABELS[p.doc_type as DocType] ?? p.doc_type}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[140px] truncate">
                    {p.doctor_name}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500">
                    {new Date(p.issue_date).toLocaleDateString("ru-RU")}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500">
                    {new Date(p.expires_at).toLocaleDateString("ru-RU")}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge prescription={p} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <RiskBadge risk={p.risk_level} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-gray-400 text-right">
        {data?.total ?? 0} рецептов
      </p>
    </main>
  );
}
