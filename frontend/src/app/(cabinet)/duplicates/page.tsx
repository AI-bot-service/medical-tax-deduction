"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, StarIcon, CopyIcon, ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DuplicateReviewModal } from "@/components/ui/DuplicateReviewModal";
import { useDashboardStore } from "@/lib/store";
import type { ReceiptDetail, ReceiptListItem } from "@/types/api";

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onDashboard }: { onDashboard: () => void }) {
  return (
    <div className="card" style={{ padding: "64px 24px", textAlign: "center" }}>
      <div style={{
        width: 56, height: 56, borderRadius: "50%",
        background: "var(--accent-light)",
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 16px",
      }}>
        <CheckIcon style={{ width: 24, height: 24, color: "var(--accent)", strokeWidth: 2.5 }} />
      </div>
      <p style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 6px" }}>
        Дублей не обнаружено
      </p>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 24px" }}>
        Все загруженные чеки уникальны — возможных дублей нет
      </p>
      <Button
        onClick={onDashboard}
        className="font-semibold"
        size="sm"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        На дашборд
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Done state (все просмотрены за сессию)
// ---------------------------------------------------------------------------

function DoneState({ total, onDashboard }: { total: number; onDashboard: () => void }) {
  return (
    <div className="card" style={{ padding: "64px 24px", textAlign: "center" }}>
      <div style={{
        width: 56, height: 56, borderRadius: "50%",
        background: "var(--accent-light)",
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 16px",
      }}>
        <StarIcon style={{ width: 24, height: 24, color: "var(--accent)", strokeWidth: 2.5 }} />
      </div>
      <p style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 6px" }}>
        Все дубли обработаны
      </p>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 24px" }}>
        {total} {total === 1 ? "чек проверен" : total < 5 ? "чека проверено" : "чеков проверено"} в этой сессии
      </p>
      <Button
        onClick={onDashboard}
        className="font-semibold"
        size="sm"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        На дашборд
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DuplicatesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setSelectedYear = useDashboardStore(s => s.setSelectedYear);

  // Загружаем очередь проверки и фильтруем только DUPLICATE_REVIEW
  const { data, isLoading } = useQuery<ReceiptListItem[]>({
    queryKey: ["receipts-review-queue"],
    queryFn: () => api.get<ReceiptListItem[]>("/api/v1/receipts/review-queue"),
    staleTime: 0,
  });

  const duplicates = (data ?? []).filter((r) => r.ocr_status === "DUPLICATE_REVIEW");

  const [currentIdx, setCurrentIdx] = useState(0);
  const [processedTotal, setProcessedTotal] = useState(0);

  // Сброс индекса если список обновился
  useEffect(() => {
    if (currentIdx >= duplicates.length && duplicates.length > 0) {
      setCurrentIdx(duplicates.length - 1);
    }
  }, [duplicates.length, currentIdx]);

  function handleResolved() {
    void queryClient.invalidateQueries({ queryKey: ["receipts-review-queue"] });
    void queryClient.invalidateQueries({ queryKey: ["receipts-list"] });
    setProcessedTotal((n) => n + 1);
    // После инвалидации список уменьшится — индекс остаётся, следующий подтянется
  }

  function handleSaved(receipt: ReceiptDetail) {
    void queryClient.invalidateQueries({ queryKey: ["receipts-review-queue"] });
    void queryClient.invalidateQueries({ queryKey: ["receipts-list"] });
    // Устанавливаем год фильтра по дате чека и переходим на страницу чеков
    const year = receipt.purchase_date
      ? new Date(receipt.purchase_date).getFullYear()
      : new Date().getFullYear();
    setSelectedYear(year);
    router.back();
  }

  function handlePrev() {
    setCurrentIdx((i) => Math.max(0, i - 1));
  }

  function handleNext() {
    setCurrentIdx((i) => Math.min(duplicates.length - 1, i + 1));
  }

  const currentItem = duplicates[currentIdx] ?? null;
  const total = duplicates.length;

  return (
    <div style={{ maxWidth: "none" }}>

      {/* ── Заголовок ── */}
      {!isLoading && !currentItem && total === 0 && processedTotal === 0 ? null : (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 20,
        }}>
          <div>
            <h1 style={{
              fontSize: 20, fontWeight: 800, color: "var(--text-primary)",
              letterSpacing: "-0.03em", margin: 0,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <CopyIcon style={{ width: 18, height: 18, strokeWidth: 2.5, color: "var(--accent)" }} />
              Дубликаты чеков
            </h1>
            {!isLoading && total > 0 && (
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
                Найдено {total} возможных {total === 1 ? "дубликата" : total < 5 ? "дубликата" : "дубликатов"} — сравните и подтвердите или удалите
              </p>
            )}
          </div>

          {!isLoading && total > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Навигация если дублей больше одного */}
              {total > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    onClick={handlePrev}
                    disabled={currentIdx === 0}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 30, height: 30, borderRadius: "var(--r-sm)",
                      border: "1px solid var(--border)", background: "var(--surface)",
                      cursor: currentIdx === 0 ? "not-allowed" : "pointer",
                      opacity: currentIdx === 0 ? 0.4 : 1,
                      color: "var(--text-secondary)",
                    }}
                  >
                    <ArrowLeftIcon style={{ width: 14, height: 14 }} />
                  </button>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", minWidth: 40, textAlign: "center" }}>
                    {currentIdx + 1} / {total}
                  </span>
                  <button
                    onClick={handleNext}
                    disabled={currentIdx === total - 1}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 30, height: 30, borderRadius: "var(--r-sm)",
                      border: "1px solid var(--border)", background: "var(--surface)",
                      cursor: currentIdx === total - 1 ? "not-allowed" : "pointer",
                      opacity: currentIdx === total - 1 ? 0.4 : 1,
                      color: "var(--text-secondary)",
                    }}
                  >
                    <ArrowRightIcon style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              )}
              <Badge
                variant="secondary"
                className="h-auto px-3 py-1 text-[12px] font-semibold shrink-0"
                style={{ background: "rgba(245,158,11,0.12)", color: "#D97706" }}
              >
                {total} на проверке
              </Badge>
            </div>
          )}
        </div>
      )}

      {/* ── Скелетон ── */}
      {isLoading && (
        <div className="card" style={{ height: 420, overflow: "hidden" }}>
          <div style={{ display: "flex", height: "100%" }}>
            <div style={{ width: 260, flexShrink: 0, background: "var(--bg)", borderRight: "1px solid var(--border-light)", animation: "pulse 1.5s ease-in-out infinite" }} />
            <div style={{ flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              {[60, 40, 40].map((w, i) => (
                <div key={i}>
                  <div style={{ width: 80, height: 10, background: "var(--bg)", borderRadius: 4, marginBottom: 8, animation: "pulse 1.5s ease-in-out infinite" }} />
                  <div style={{ height: 36, background: "var(--bg)", borderRadius: "var(--r-sm)", animation: "pulse 1.5s ease-in-out infinite", width: `${w}%` }} />
                </div>
              ))}
            </div>
          </div>
          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
        </div>
      )}

      {/* ── Нет дублей ── */}
      {!isLoading && total === 0 && processedTotal === 0 && (
        <EmptyState onDashboard={() => router.push("/dashboard")} />
      )}

      {/* ── Все обработаны в этой сессии ── */}
      {!isLoading && total === 0 && processedTotal > 0 && (
        <DoneState total={processedTotal} onDashboard={() => router.push("/dashboard")} />
      )}

      {/* ── Карточка сравнения дубликата ── */}
      {!isLoading && currentItem && (
        <DuplicateReviewModal
          key={currentItem.id}
          receiptId={currentItem.id}
          onSaved={handleSaved}
          onCancelled={handleResolved}
          asPage
        />
      )}
    </div>
  );
}
