"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { OTPInput } from "@/components/ui/OTPInput";
import { api, ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import type { MessageResponse } from "@/types/api";

type Step = "phone" | "otp";

const OTP_RESEND_SEC = 60;

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState(""); // 10 raw digits
  const [phoneError, setPhoneError] = useState("");
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendSec, setResendSec] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback(() => {
    setResendSec(OTP_RESEND_SEC);
    timerRef.current = setInterval(() => {
      setResendSec((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Validate phone: must be exactly 10 digits
  function isPhoneValid() {
    return /^\d{10}$/.test(phone);
  }

  async function handleRequestOTP() {
    if (!isPhoneValid()) {
      setPhoneError("Введите корректный номер +7XXXXXXXXXX");
      return;
    }
    setPhoneError("");
    setLoading(true);
    try {
      await api.post<MessageResponse>("/api/v1/auth/otp", {
        phone: `+7${phone}`,
      });
      setStep("otp");
      startTimer();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          setPhoneError("Пользователь не найден. Сначала зарегистрируйтесь через Telegram-бот.");
        } else if (err.status === 429) {
          setPhoneError("Слишком много попыток. Подождите перед повторным запросом.");
        } else {
          setPhoneError(err.message || "Ошибка при отправке кода");
        }
      } else {
        setPhoneError("Сетевая ошибка");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOTP() {
    if (otp.replace(/\D/g, "").length < 6) return;
    setOtpError("");
    setLoading(true);
    try {
      await api.post<MessageResponse>("/api/v1/auth/verify", {
        phone: `+7${phone}`,
        code: otp,
      });
      login(null);
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          const minutes = Math.ceil(OTP_RESEND_SEC / 60);
          setOtpError(`Слишком много попыток. Подождите ${minutes} мин.`);
        } else {
          setOtpError("Неверный код. Попробуйте ещё раз.");
        }
      } else {
        setOtpError("Сетевая ошибка");
      }
      setOtp("");
    } finally {
      setLoading(false);
    }
  }

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (otp.replace(/\D/g, "").length === 6 && step === "otp" && !loading) {
      void handleVerifyOTP();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  async function handleResend() {
    if (resendSec > 0) return;
    setOtp("");
    setOtpError("");
    setLoading(true);
    try {
      await api.post<MessageResponse>("/api/v1/auth/otp", {
        phone: `+7${phone}`,
      });
      startTimer();
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setOtpError("Слишком много попыток. Подождите перед повторной отправкой.");
      } else {
        setOtpError("Ошибка при повторной отправке кода");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        {/* Logo / Title */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">МедВычет</h1>
          <p className="mt-1 text-sm text-gray-500">
            Налоговый вычет на лекарства
          </p>
        </div>

        {step === "phone" ? (
          /* ---- Step 1: phone ---- */
          <div className="flex flex-col gap-6">
            <PhoneInput
              value={phone}
              onChange={setPhone}
              onBlur={() => {
                if (phone && !isPhoneValid()) {
                  setPhoneError("Введите корректный номер +7XXXXXXXXXX");
                } else {
                  setPhoneError("");
                }
              }}
              error={phoneError}
              disabled={loading}
            />
            <button
              onClick={handleRequestOTP}
              disabled={!isPhoneValid() || loading}
              className={[
                "w-full rounded-lg py-3 text-base font-semibold text-white transition-colors",
                isPhoneValid() && !loading
                  ? "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
                  : "cursor-not-allowed bg-gray-300",
              ].join(" ")}
            >
              {loading ? "Отправка..." : "Получить код"}
            </button>
            <p className="text-center text-xs text-gray-400">
              Код придёт в Telegram-бот МедВычет
            </p>
          </div>
        ) : (
          /* ---- Step 2: OTP ---- */
          <div className="flex flex-col gap-6">
            <div>
              <p className="mb-1 text-sm text-gray-600">
                Код отправлен в Telegram на номер{" "}
                <span className="font-medium">+7{phone}</span>
              </p>
              <button
                onClick={() => {
                  setStep("phone");
                  setOtp("");
                  setOtpError("");
                }}
                className="text-xs text-blue-500 hover:underline"
              >
                Изменить номер
              </button>
            </div>

            <OTPInput
              value={otp}
              onChange={setOtp}
              error={otpError}
              disabled={loading}
            />

            <button
              onClick={handleVerifyOTP}
              disabled={otp.replace(/\D/g, "").length < 6 || loading}
              className={[
                "w-full rounded-lg py-3 text-base font-semibold text-white transition-colors",
                otp.replace(/\D/g, "").length === 6 && !loading
                  ? "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
                  : "cursor-not-allowed bg-gray-300",
              ].join(" ")}
            >
              {loading ? "Проверка..." : "Войти"}
            </button>

            <button
              onClick={handleResend}
              disabled={resendSec > 0 || loading}
              className={[
                "text-center text-sm transition-colors",
                resendSec > 0 || loading
                  ? "cursor-not-allowed text-gray-400"
                  : "text-blue-500 hover:underline",
              ].join(" ")}
            >
              {resendSec > 0
                ? `Отправить повторно через ${resendSec} сек`
                : "Отправить код повторно"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
