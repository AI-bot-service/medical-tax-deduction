"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { DocumentStats } from "@/types/api";

export function useDocumentStats(year: number) {
  return useQuery<DocumentStats>({
    queryKey: ["document-stats", year],
    queryFn: () =>
      api.get<DocumentStats>(`/api/v1/documents/stats?year=${year}`),
    staleTime: 60_000, // 1 минута
    retry: 1,
  });
}
