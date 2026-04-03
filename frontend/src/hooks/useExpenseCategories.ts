"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CategoryBreakdown } from "@/types/api";

export function useExpenseCategories(year: number) {
  return useQuery<CategoryBreakdown>({
    queryKey: ["expense-categories", year],
    queryFn: () =>
      api.get<CategoryBreakdown>(`/api/v1/expenses/categories?year=${year}`),
    staleTime: 60_000, // 1 минута
    retry: 1,
  });
}
