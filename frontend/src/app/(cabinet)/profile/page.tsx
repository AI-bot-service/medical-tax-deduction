"use client";

import { useState } from "react";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// СНИЛС маска: XXX-XXX-XXX XX
// ---------------------------------------------------------------------------

function formatSnils(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  let result = digits.slice(0, 3);
  if (digits.length > 3) result += "-" + digits.slice(3, 6);
  if (digits.length > 6) result += "-" + digits.slice(6, 9);
  if (digits.length > 9) result += " " + digits.slice(9, 11);
  return result;
}

function parseSnils(formatted: string): string {
  return formatted.replace(/\D/g, "");
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProfilePage() {
  const [fullName, setFullName] = useState("");
  const [inn, setInn] = useState("");
  const [snils, setSnils] = useState("");
  const [notifications, setNotifications] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await api.patch("/api/v1/profile", {
        full_name: fullName || null,
        inn: inn || null,
        snils: parseSnils(snils) || null,
        notifications_enabled: notifications,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 transition-colors";
  const labelCls = "block text-xs font-medium text-gray-500 mb-1";

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-xl font-bold text-gray-900">Профиль</h1>

      <div className="space-y-5">
        {/* Personal data */}
        <div className="rounded-xl bg-white border border-gray-100 p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">
            Персональные данные
          </h2>
          <p className="mb-4 text-xs text-gray-400">
            Данные зашифрованы (AES-256) и используются только для формирования
            документов в ИФНС
          </p>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className={labelCls}>ФИО (как в паспорте)</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Иванов Иван Иванович"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>ИНН</label>
              <input
                type="text"
                value={inn}
                onChange={(e) => setInn(e.target.value.replace(/\D/g, "").slice(0, 12))}
                placeholder="123456789012"
                inputMode="numeric"
                maxLength={12}
                className={inputCls}
              />
              <p className="mt-1 text-xs text-gray-400">12 цифр</p>
            </div>
            <div>
              <label className={labelCls}>СНИЛС</label>
              <input
                type="text"
                value={snils}
                onChange={(e) => setSnils(formatSnils(e.target.value))}
                placeholder="XXX-XXX-XXX XX"
                inputMode="numeric"
                className={inputCls}
              />
              <p className="mt-1 text-xs text-gray-400">Формат: XXX-XXX-XXX XX</p>
            </div>
          </div>
        </div>

        {/* Notification settings */}
        <div className="rounded-xl bg-white border border-gray-100 p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Уведомления</h2>
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-sm text-gray-800">Уведомления в Telegram</p>
              <p className="text-xs text-gray-400">
                Получать сообщения о статусе обработки чеков
              </p>
            </div>
            <button
              onClick={() => setNotifications((v) => !v)}
              className={[
                "relative h-6 w-11 rounded-full transition-colors",
                notifications ? "bg-blue-600" : "bg-gray-300",
              ].join(" ")}
            >
              <span
                className={[
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                  notifications ? "translate-x-5" : "translate-x-0.5",
                ].join(" ")}
              />
            </button>
          </label>
        </div>

        {/* Policy links */}
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-4">
          <p className="text-xs font-medium text-gray-600 mb-2">Документы</p>
          <div className="flex flex-col gap-1.5">
            <a
              href="/privacy"
              className="text-sm text-blue-500 hover:underline"
            >
              Политика обработки персональных данных (152-ФЗ)
            </a>
            <a
              href="/terms"
              className="text-sm text-blue-500 hover:underline"
            >
              Пользовательское соглашение
            </a>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className={[
            "w-full rounded-lg py-3 text-base font-semibold text-white transition-colors",
            saving ? "cursor-not-allowed bg-gray-300" : "bg-blue-600 hover:bg-blue-700",
          ].join(" ")}
        >
          {saving ? "Сохранение..." : "Сохранить изменения"}
        </button>
        {saved && (
          <p className="text-center text-sm text-green-600">✓ Данные сохранены</p>
        )}
      </div>
    </main>
  );
}
