"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { TaxLimitsResponse } from "@/types/api";

export function useTaxLimits(year: number) {
  return useQuery<TaxLimitsResponse>({
    queryKey: ["tax-limits", year],
    queryFn: () =>
      api.get<TaxLimitsResponse>(`/api/v1/tax-limits?year=${year}`),
    staleTime: 5 * 60_000, // 5 минут
    retry: 1,
  });
}
