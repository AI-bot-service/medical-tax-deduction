"use client";

/**
 * Панель просмотра фото чека — открывается слева поверх контента.
 * Используется на странице редактирования чека и на странице дубликатов.
 */

import { useEffect, useRef, useCallback } from "react";

async function downloadImage(src: string, filename = "receipt.jpg") {
  const response = await fetch(src);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

interface ReceiptPhotoPanelProps {
  src: string;
  title?: string;
  onClose: () => void;
}

export function ReceiptPhotoPanel({ src, title = "Фото чека", onClose }: ReceiptPhotoPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const lastY = useRef(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    lastY.current = e.clientY;
    if (scrollRef.current) scrollRef.current.style.cursor = "grabbing";
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    const delta = lastY.current - e.clientY;
    scrollRef.current.scrollTop += delta;
    lastY.current = e.clientY;
  }, []);

  const stopDrag = useCallback(() => {
    isDragging.current = false;
    if (scrollRef.current) scrollRef.current.style.cursor = "grab";
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "clamp(320px, 46vw, 680px)",
        height: "100vh",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        boxShadow: "4px 0 24px rgba(0,0,0,0.18)",
      }}
    >
      {/* Шапка */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
          🧾 {title}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => downloadImage(src)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: "var(--r-sm)",
              border: "1px solid var(--border)",
              background: "var(--bg)",
              cursor: "pointer",
              color: "var(--text-secondary)",
              flexShrink: 0,
            }}
            title="Скачать чек"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 1v9M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          <button
            onClick={onClose}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: "var(--r-sm)",
              border: "1px solid var(--border)",
              background: "var(--bg)",
              cursor: "pointer",
              fontSize: "16px",
              color: "var(--text-secondary)",
              fontFamily: "Urbanist, sans-serif",
              lineHeight: 1,
              flexShrink: 0,
            }}
            title="Закрыть (Esc)"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Область прокрутки с фото */}
      <div
        ref={scrollRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        style={{
          flex: 1,
          overflow: "auto",
          padding: "12px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          cursor: "grab",
          userSelect: "none",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={title}
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--border)",
          }}
        />
      </div>
    </div>
  );
}
