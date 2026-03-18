"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isTelegramWebApp, getTelegramInitData, applyTelegramTheme } from "@/lib/telegram";
import { useAuthStore } from "@/lib/store";

interface MessageResponse {
  message: string;
}

/**
 * Authentication hook.
 *
 * - If running inside Telegram Mini App: automatically authenticates via
 *   initData → POST /api/auth/mini-app → sets authStore, redirects to /dashboard
 * - Otherwise: no-op (user is redirected to /login by middleware or manually)
 */
export function useAuth() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const login = useAuthStore((s) => s.login);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) return;
    if (!isTelegramWebApp()) {
      router.replace("/login");
      return;
    }

    applyTelegramTheme();

    const initData = getTelegramInitData();
    if (!initData) {
      router.replace("/login");
      return;
    }

    setLoading(true);
    fetch("/api/auth/mini-app", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ init_data: initData }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { detail?: string };
          throw new Error(body.detail ?? `Auth error ${res.status}`);
        }
        return res.json() as Promise<MessageResponse>;
      })
      .then(() => {
        login(null);
        router.replace("/dashboard");
      })
      .catch((err: Error) => {
        setError(err.message);
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [isAuthenticated, login, router]);

  return { loading, error };
}
