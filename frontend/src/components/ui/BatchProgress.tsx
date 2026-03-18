"use client";

import { useBatchStore } from "@/lib/store";
import { useBatchSSE } from "@/hooks/useBatchSSE";

export function BatchProgress() {
  const activeBatch = useBatchStore((s) => s.activeBatch);
  const totalFiles = useBatchStore((s) => s.totalFiles);
  const doneCount = useBatchStore((s) => s.doneCount);
  const reviewCount = useBatchStore((s) => s.reviewCount);
  const failedCount = useBatchStore((s) => s.failedCount);
  const completed = useBatchStore((s) => s.completed);
  const items = useBatchStore((s) => s.items);

  useBatchSSE(activeBatch);

  if (!activeBatch) return null;

  const processed = doneCount + reviewCount + failedCount;
  const pct = totalFiles > 0 ? Math.round((processed / totalFiles) * 100) : 0;

  return (
    <div className="rounded-xl bg-white border border-blue-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-gray-800">
          {completed ? "Обработка завершена" : "Обработка чеков..."}
        </p>
        <span className="text-xs text-gray-500">
          {processed}/{totalFiles}
        </span>
      </div>

      <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden mb-3">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {items.map((item) => {
          const icon =
            item.status === "done" ? "✅" : item.status === "review" ? "⚠️" : "❌";
          return (
            <span
              key={item.file_index}
              className="text-base"
              title={`Файл ${item.file_index + 1}: ${item.status}`}
            >
              {icon}
            </span>
          );
        })}
        {Array.from({ length: totalFiles - items.length }).map((_, i) => (
          <span key={`pending-${i}`} className="text-base text-gray-300">
            ⏳
          </span>
        ))}
      </div>

      <div className="flex gap-4 text-xs text-gray-500">
        <span className="text-green-600 font-medium">✅ {doneCount}</span>
        <span className="text-yellow-600 font-medium">⚠️ {reviewCount}</span>
        <span className="text-red-600 font-medium">❌ {failedCount}</span>
      </div>
    </div>
  );
}
