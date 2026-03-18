"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Summary } from "@/types/api";

export function useSummary(year?: number) {
  const currentYear = year ?? new Date().getFullYear();
  return useQuery<Summary>({
    queryKey: ["summary", currentYear],
    queryFn: () => api.get<Summary>(`/api/v1/receipts/summary?year=${currentYear}`),
    staleTime: 60_000,
    retry: 1,
  });
}
