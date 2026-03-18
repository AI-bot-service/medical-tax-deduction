"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBatchStore } from "@/lib/store";
import type { BatchSSEEvent } from "@/types/api";

/**
 * Connects to SSE stream for a batch job and updates batchStore.
 * On completion: invalidates receipts queries so table refreshes.
 */
export function useBatchSSE(batchId: string | null) {
  const esRef = useRef<EventSource | null>(null);
  const handleSSEEvent = useBatchStore((s) => s.handleSSEEvent);
  const clearBatch = useBatchStore((s) => s.clearBatch);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!batchId) return;

    const es = new EventSource(`/api/v1/batches/${batchId}/stream`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data as string) as BatchSSEEvent;
        handleSSEEvent(event);
        if (event.completed) {
          es.close();
          void queryClient.invalidateQueries({ queryKey: ["receipts-list"] });
          void queryClient.invalidateQueries({ queryKey: ["summary"] });
          setTimeout(() => clearBatch(), 3000);
        }
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
    };
  }, [batchId, handleSSEEvent, clearBatch, queryClient]);
}
