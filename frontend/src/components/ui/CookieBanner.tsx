"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "cookie_consent";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) setVisible(true);
    } catch {
      // localStorage may be unavailable in some contexts
    }
  }, []);

  function accept() {
    try {
      localStorage.setItem(STORAGE_KEY, "accepted");
    } catch {
      // ignore
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 px-4 py-4 shadow-2xl">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <p className="flex-1 text-sm text-gray-200">
          Мы используем cookies для обеспечения работы сервиса. Продолжая использование,
          вы соглашаетесь с{" "}
          <a href="/privacy" className="text-blue-400 hover:underline">
            политикой обработки данных
          </a>
          .
        </p>
        <div className="flex gap-3 flex-shrink-0">
          <button
            onClick={accept}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
          >
            Принять
          </button>
          <a
            href="/privacy"
            className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:border-gray-400 transition-colors"
          >
            Подробнее
          </a>
        </div>
      </div>
    </div>
  );
}
