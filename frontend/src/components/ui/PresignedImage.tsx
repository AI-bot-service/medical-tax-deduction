"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  ReceiptDetail,
} from "@/types/api";

interface PresignedImageProps {
  receiptId: string;
}
function PresignedImage({ receiptId }: PresignedImageProps) {
  const REFRESH_MS = 14 * 60 * 1000;
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchUrl() {
    try {
      const detail = await api.get<ReceiptDetail>(`/api/v1/receipts/${receiptId}`);
      setImageUrl(detail.image_url ?? null);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void fetchUrl();
    timerRef.current = setInterval(() => void fetchUrl(), REFRESH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-line react-hooks/exhaustive-deps
  }, [receiptId]);

  if (!imageUrl) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 200,
        borderRadius: "var(--r-md)",
        background: "var(--bg)",
        color: "var(--text-muted)",
        gap: 8,
        border: "1px solid var(--border)",
      }}>
        <span style={{ fontSize: 32 }}>🧾</span>
        <span style={{ fontSize: "13px" }}>Фото недоступно</span>
      </div>
    );
  }

  return (
    <>
      {/* Thumbnail */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          onClick={() => setModalOpen(true)}
          style={{
            borderRadius: "var(--r-md)",
            border: "1px solid var(--border)",
            background: "var(--bg)",
            overflow: "hidden",
            cursor: "zoom-in",
            height: 480,
            position: "relative",
          }}
          title="Нажмите чтобы открыть"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Фото чека"
            style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }}
          />
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0)",
            transition: "background 0.2s",
          }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(0,0,0,0.18)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(0,0,0,0)"; }}
          >
            <span style={{
              fontSize: "12px", fontWeight: 700,
              color: "#fff",
              background: "rgba(0,0,0,0.45)",
              padding: "4px 12px",
              borderRadius: "var(--r-pill)",
              pointerEvents: "none",
            }}>
              🔍 Открыть
            </span>
          </div>
        </div>
        <p style={{ fontSize: "11px", color: "var(--text-muted)", textAlign: "center", margin: 0 }}>
          Нажмите на фото чтобы увеличить
        </p>
      </div>

      {/* Modal — fixed on the left */}
      {modalOpen && (
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
          {/* Header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
              🧾 Фото чека
            </span>
            <button
              onClick={() => setModalOpen(false)}
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
              title="Закрыть"
            >
              ✕
            </button>
          </div>

          {/* Image scroll area */}
          <div style={{
            flex: 1,
            overflow: "auto",
            padding: "12px",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Фото чека"
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
      )}
    </>
  );
}