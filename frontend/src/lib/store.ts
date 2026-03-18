/**
 * Zustand stores (G-01):
 *  - authStore   : authentication state
 *  - batchStore  : active batch + SSE event handling
 *  - reviewStore : REVIEW-queue navigation
 */

import { create } from "zustand";
import type { BatchSSEEvent, ReceiptListItem } from "@/types/api";

// ---------------------------------------------------------------------------
// authStore
// ---------------------------------------------------------------------------

export interface AuthUser {
  telegram_id: number;
  telegram_username: string | null;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (user: AuthUser | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,

  login: (user) => set({ user, isAuthenticated: true }),

  logout: () => set({ user: null, isAuthenticated: false }),
}));

// ---------------------------------------------------------------------------
// batchStore
// ---------------------------------------------------------------------------

export interface BatchItem {
  file_index: number;
  status: "done" | "review" | "failed";
}

interface BatchState {
  activeBatch: string | null; // batch_id UUID
  totalFiles: number;
  doneCount: number;
  reviewCount: number;
  failedCount: number;
  completed: boolean;
  items: BatchItem[];

  startBatch: (batchId: string, totalFiles: number) => void;
  handleSSEEvent: (event: BatchSSEEvent) => void;
  clearBatch: () => void;
}

export const useBatchStore = create<BatchState>((set) => ({
  activeBatch: null,
  totalFiles: 0,
  doneCount: 0,
  reviewCount: 0,
  failedCount: 0,
  completed: false,
  items: [],

  startBatch: (batchId, totalFiles) =>
    set({
      activeBatch: batchId,
      totalFiles,
      doneCount: 0,
      reviewCount: 0,
      failedCount: 0,
      completed: false,
      items: [],
    }),

  handleSSEEvent: (event) =>
    set((state) => ({
      doneCount: event.done_count,
      reviewCount: event.review_count,
      failedCount: event.failed_count,
      completed: event.completed,
      items: [
        ...state.items.filter((i) => i.file_index !== event.file_index),
        { file_index: event.file_index, status: event.status },
      ].sort((a, b) => a.file_index - b.file_index),
    })),

  clearBatch: () =>
    set({
      activeBatch: null,
      totalFiles: 0,
      doneCount: 0,
      reviewCount: 0,
      failedCount: 0,
      completed: false,
      items: [],
    }),
}));

// ---------------------------------------------------------------------------
// reviewStore
// ---------------------------------------------------------------------------

interface ReviewState {
  queue: ReceiptListItem[];
  currentIdx: number;

  loadQueue: (items: ReceiptListItem[]) => void;
  approve: () => void;
  skip: () => void;
}

export const useReviewStore = create<ReviewState>((set) => ({
  queue: [],
  currentIdx: 0,

  loadQueue: (items) => set({ queue: items, currentIdx: 0 }),

  approve: () =>
    set((state) => ({
      currentIdx: Math.min(state.currentIdx + 1, state.queue.length),
    })),

  skip: () =>
    set((state) => ({
      currentIdx: Math.min(state.currentIdx + 1, state.queue.length),
    })),
}));
