"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const STORAGE_KEY = "medical_consent_given";

interface MedicalDataConsentProps {
  /** Called when user accepts or has already accepted */
  onAccepted?: () => void;
}

/**
 * Modal dialog requesting consent for processing medical data (ст. 10 152-ФЗ).
 * Shows only once (tracked in localStorage + sent to backend).
 */
export function MedicalDataConsent({ onAccepted }: MedicalDataConsentProps) {
  const [visible, setVisible] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) setVisible(true);
      else onAccepted?.();
    } catch {
      setVisible(true);
    }
  }, [onAccepted]);

  async function handleAccept() {
    setAccepting(true);
    try {
      // Record consent timestamp on backend
      await api.post("/api/v1/profile/medical-consent");
    } catch {
      // Don't block the user if backend call fails
    } finally {
      try {
        localStorage.setItem(STORAGE_KEY, new Date().toISOString());
      } catch {
        // ignore
      }
      setAccepting(false);
      setVisible(false);
      onAccepted?.();
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="text-2xl">🏥</span>
          <h2 className="text-base font-bold text-gray-900">
            Согласие на обработку медицинских данных
          </h2>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Для формирования пакета документов на налоговый вычет сервис обрабатывает
          сведения о состоянии вашего здоровья: наименования лекарственных препаратов,
          рецепты, данные о медицинских организациях.
        </p>

        <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 mb-5">
          <p className="text-xs text-blue-800">
            В соответствии со ст. 10 Федерального закона № 152-ФЗ «О персональных данных»
            обработка специальных категорий персональных данных (сведений о состоянии
            здоровья) осуществляется только при наличии явного письменного согласия.
          </p>
        </div>

        <p className="text-sm text-gray-700 mb-5">
          Нажимая «Я согласен», вы даёте согласие на обработку сведений о состоянии
          здоровья в целях получения налогового вычета (ст. 219 НК РФ). Согласие можно
          отозвать в разделе{" "}
          <a href="/profile" className="text-blue-500 hover:underline">
            Профиль
          </a>
          .
        </p>

        <div className="flex flex-col gap-2">
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
          >
            {accepting ? "Сохранение..." : "Я согласен на обработку медицинских данных"}
          </button>
          <a
            href="/privacy"
            target="_blank"
            className="text-center text-xs text-gray-400 hover:underline"
          >
            Политика обработки персональных данных
          </a>
        </div>
      </div>
    </div>
  );
}
