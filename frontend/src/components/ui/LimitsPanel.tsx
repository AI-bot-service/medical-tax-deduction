"use client";

import { useTaxLimits } from "@/hooks/useTaxLimits";
import { useExpenseCategories } from "@/hooks/useExpenseCategories";
import { useDashboardStore } from "@/lib/store";
import { BigGlass } from "@/components/ui/BigGlass";
import { SmallGlass } from "@/components/ui/SmallGlass";

// Colour scheme per acceptance criteria
const COLOR_MAP: Record<string, string> = {
  treatment_regular: "#4A8FE2",   // синий
  treatment_expensive: "#7B9FD4", // нейтральный синий
  education_self: "#3BAB72",      // зелёный
  education_child: "#9B7FD4",     // фиолетовый
};

// Display order for SmallGlass
const ORDERED_KEYS = [
  "treatment_regular",
  "treatment_expensive",
  "education_self",
  "education_child",
] as const;

/**
 * LimitsPanel — панель 3 дашборда.
 * BigGlass (общий лимит) + 4 SmallGlass (по категориям).
 * Данные берутся из useTaxLimits(year) и useExpenseCategories(year).
 */
export function LimitsPanel() {
  const selectedYear = useDashboardStore((s) => s.selectedYear);
  const { data: taxLimits, isLoading: limitsLoading } = useTaxLimits(selectedYear);
  const { data: expenses, isLoading: expensesLoading } = useExpenseCategories(selectedYear);

  const isLoading = limitsLoading || expensesLoading;

  if (isLoading) {
    return (
      <div
        className="card"
        style={{
          height: 260,
          background: "var(--border-light)",
          animation: "pulse 1.5s ease-in-out infinite",
        }}
      />
    );
  }

  if (!taxLimits || !expenses) return null;

  // expense_key → amount
  const expenseMap: Record<string, number> = {};
  for (const cat of expenses.categories) {
    expenseMap[cat.category_key] = cat.amount;
  }

  // type_key → limit object
  const limitMap: Record<string, (typeof taxLimits.limits)[0]> = {};
  for (const l of taxLimits.limits) {
    limitMap[l.type_key] = l;
  }

  const treatmentAmount = expenseMap["treatment_regular"] ?? 0;
  const educationAmount = expenseMap["education_self"] ?? 0;

  return (
    <div className="card reveal reveal-3" style={{ padding: "20px 24px" }}>
      {/* Header */}
      <div className="card-header" style={{ marginBottom: 20 }}>
        <div>
          <div className="card-title">Налоговые лимиты</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
            {selectedYear} год · лимит {new Intl.NumberFormat("ru-RU").format(taxLimits.combined_limit)} ₽
          </div>
        </div>
      </div>

      {/* Glasses row */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        {/* BigGlass */}
        <BigGlass
          totalLimit={taxLimits.combined_limit}
          treatmentAmount={treatmentAmount}
          educationAmount={educationAmount}
        />

        {/* Vertical divider */}
        <div
          style={{
            width: 1,
            alignSelf: "stretch",
            background: "var(--border)",
            flexShrink: 0,
          }}
        />

        {/* 4 SmallGlass */}
        <div
          style={{
            display: "flex",
            gap: 20,
            flex: 1,
            flexWrap: "wrap",
            justifyContent: "space-around",
            alignItems: "flex-start",
          }}
        >
          {ORDERED_KEYS.map((key) => {
            const limit = limitMap[key];
            if (!limit) return null;
            const spent = expenseMap[key] ?? 0;

            // Max refund: use fixed refund_amount if available,
            // otherwise calculate from spending × refund_percent (for uncapped categories).
            const refund =
              limit.refund_amount != null
                ? limit.refund_amount
                : limit.refund_percent != null
                ? Math.round((spent * limit.refund_percent) / 100)
                : 0;

            return (
              <SmallGlass
                key={key}
                categoryName={limit.type_name}
                color={COLOR_MAP[key] ?? "#7B6FD4"}
                spent={spent}
                limit={limit.limit_amount}
                refund={refund}
                isUncapped={limit.is_uncapped}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
