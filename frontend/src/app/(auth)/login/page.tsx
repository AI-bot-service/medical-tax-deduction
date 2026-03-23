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

// ---------------------------------------------------------------------------
// Left panel — brand
// ---------------------------------------------------------------------------

function BrandPanel() {
  return (
    <div
      style={{
        background: "#1A1A2E",
        flex: "0 0 420px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "48px 44px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Decorative orbs */}
      <div style={{
        position: "absolute", top: "-80px", right: "-80px",
        width: "320px", height: "320px", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(123,111,212,0.25), transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: "-60px", left: "-60px",
        width: "260px", height: "260px", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(168,159,224,0.15), transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", position: "relative", zIndex: 1 }}>
        <div className="logo-icon" style={{ width: "44px", height: "44px", fontSize: "22px" }}>💊</div>
        <div>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#fff", letterSpacing: "-.3px" }}>МедВычет</div>
          <div style={{ fontSize: "11px", color: "var(--sidebar-text)", marginTop: "1px" }}>Налоговый вычет на лекарства</div>
        </div>
      </div>

      {/* Center content */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{
          fontSize: "clamp(1.5rem, 2.5vw, 2rem)",
          fontWeight: 800,
          color: "#fff",
          lineHeight: 1.1,
          letterSpacing: "-.03em",
          marginBottom: "20px",
        }}>
          Верните до{" "}
          <span style={{
            background: "linear-gradient(135deg, var(--accent-mid), #fff)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            19 500 ₽
          </span>
          {" "}из бюджета
        </div>
        <p style={{ fontSize: "14px", color: "var(--sidebar-text)", lineHeight: 1.6, marginBottom: "32px" }}>
          Фотографируйте чеки из аптеки — мы автоматически распознаём их, привязываем рецепты
          и готовим пакет документов для ИФНС.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {[
            { icon: "📸", text: "Загрузите фото чека — OCR распознаёт за 30 сек" },
            { icon: "📋", text: "Система сформирует реестр для налоговой" },
            { icon: "✅", text: "Скачайте готовый пакет и подайте в ИФНС" },
          ].map((item) => (
            <div key={item.text} style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
              <span style={{
                width: "32px", height: "32px", borderRadius: "8px", flexShrink: 0,
                background: "rgba(123,111,212,.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "15px",
              }}>
                {item.icon}
              </span>
              <span style={{ fontSize: "13px", color: "var(--sidebar-text)", lineHeight: 1.5, paddingTop: "6px" }}>
                {item.text}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ fontSize: "11px", color: "rgba(160,168,192,.4)", position: "relative", zIndex: 1 }}>
        ст. 219 НК РФ · данные защищены по 152-ФЗ
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LoginPage() {
  const router = useRouter();
  const login  = useAuthStore((s) => s.login);

  const [step, setStep]           = useState<Step>("phone");
  const [phone, setPhone]         = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [otp, setOtp]             = useState("");
  const [otpError, setOtpError]   = useState("");
  const [loading, setLoading]     = useState(false);
  const [resendSec, setResendSec] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback(() => {
    setResendSec(OTP_RESEND_SEC);
    timerRef.current = setInterval(() => {
      setResendSec((s) => {
        if (s <= 1) { clearInterval(timerRef.current!); return 0; }
        return s - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  function isPhoneValid() { return /^\d{10}$/.test(phone); }

  async function handleRequestOTP() {
    if (!isPhoneValid()) { setPhoneError("Введите корректный номер +7XXXXXXXXXX"); return; }
    setPhoneError("");
    setLoading(true);
    try {
      await api.post<MessageResponse>("/api/v1/auth/otp", { phone: `+7${phone}` });
      setStep("otp");
      startTimer();
    } catch (err) {
      if (err instanceof ApiError) {
        if      (err.status === 404) setPhoneError("Пользователь не найден. Зарегистрируйтесь через Telegram-бот.");
        else if (err.status === 429) setPhoneError("Слишком много попыток. Подождите.");
        else                         setPhoneError(err.message || "Ошибка при отправке кода");
      } else { setPhoneError("Сетевая ошибка"); }
    } finally { setLoading(false); }
  }

  async function handleVerifyOTP() {
    if (otp.replace(/\D/g, "").length < 6) return;
    setOtpError("");
    setLoading(true);
    try {
      await api.post<MessageResponse>("/api/v1/auth/verify", { phone: `+7${phone}`, code: otp });
      login(null);
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) setOtpError(`Слишком много попыток. Подождите ${Math.ceil(OTP_RESEND_SEC / 60)} мин.`);
        else                    setOtpError("Неверный код. Попробуйте ещё раз.");
      } else { setOtpError("Сетевая ошибка"); }
      setOtp("");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (otp.replace(/\D/g, "").length === 6 && step === "otp" && !loading) {
      void handleVerifyOTP();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  async function handleResend() {
    if (resendSec > 0) return;
    setOtp(""); setOtpError("");
    setLoading(true);
    try {
      await api.post<MessageResponse>("/api/v1/auth/otp", { phone: `+7${phone}` });
      startTimer();
    } catch (err) {
      if (err instanceof ApiError && err.status === 429)
        setOtpError("Слишком много попыток. Подождите.");
      else
        setOtpError("Ошибка при повторной отправке кода");
    } finally { setLoading(false); }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      background: "var(--bg)",
      fontFamily: "'Urbanist', system-ui, sans-serif",
    }}>
      {/* Left brand panel (hidden on mobile) */}
      <div style={{ display: "flex" }} className="login-brand-panel">
        <BrandPanel />
      </div>

      {/* Right form panel */}
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
      }}>
        <div style={{
          width: "100%",
          maxWidth: "400px",
          display: "flex",
          flexDirection: "column",
          gap: "0",
        }}>
          {/* Mobile logo */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "40px" }}
               className="login-mobile-logo">
            <div className="logo-icon">💊</div>
            <div>
              <div style={{ fontSize: "16px", fontWeight: 800, color: "var(--text-primary)" }}>МедВычет</div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Налоговый вычет на лекарства</div>
            </div>
          </div>

          {/* Heading */}
          <div style={{ marginBottom: "32px" }}>
            <h1 style={{
              fontSize: "1.5rem", fontWeight: 800,
              color: "var(--text-primary)", letterSpacing: "-.03em",
              marginBottom: "6px",
            }}>
              {step === "phone" ? "Вход в кабинет" : "Введите код"}
            </h1>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              {step === "phone"
                ? "Введите номер телефона — пришлём код в Telegram"
                : <>Код отправлен в Telegram на <strong style={{ color: "var(--text-primary)" }}>+7{phone}</strong></>
              }
            </p>
          </div>

          {/* Step indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: "0", marginBottom: "28px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div className="step-circle" style={{
                width: "28px", height: "28px", borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "11px", fontWeight: 700, flexShrink: 0,
                background: "var(--accent)", color: "#fff",
              }}>1</div>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>Номер</span>
            </div>
            <div style={{ flex: 1, height: "2px", background: step === "otp" ? "var(--accent)" : "var(--border)", margin: "0 12px", transition: "background .4s" }} />
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{
                width: "28px", height: "28px", borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "11px", fontWeight: 700, flexShrink: 0,
                background: step === "otp" ? "var(--accent)" : "var(--bg)",
                color: step === "otp" ? "#fff" : "var(--text-muted)",
                border: step === "otp" ? "none" : "1px solid var(--border)",
                transition: "background .4s, color .4s",
              }}>2</div>
              <span style={{
                fontSize: "12px", fontWeight: 600,
                color: step === "otp" ? "var(--text-primary)" : "var(--text-muted)",
                transition: "color .4s",
              }}>Код</span>
            </div>
          </div>

          {/* Form */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {step === "phone" ? (
              <>
                <PhoneInput
                  value={phone}
                  onChange={setPhone}
                  onBlur={() => {
                    if (phone && !isPhoneValid()) setPhoneError("Введите корректный номер +7XXXXXXXXXX");
                    else setPhoneError("");
                  }}
                  error={phoneError}
                  disabled={loading}
                />

                <button
                  onClick={handleRequestOTP}
                  disabled={!isPhoneValid() || loading}
                  className="btn btn-primary btn-lg"
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    opacity: (!isPhoneValid() || loading) ? 0.45 : 1,
                    cursor: (!isPhoneValid() || loading) ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? (
                    <><span style={{ opacity: .7 }}>Отправка</span> <span className="spinner" /></>
                  ) : "Получить код →"}
                </button>

                <p style={{ textAlign: "center", fontSize: "12px", color: "var(--text-muted)" }}>
                  Не зарегистрированы?{" "}
                  <a
                    href="https://t.me/MedVychetBot"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--accent)", fontWeight: 600 }}
                  >
                    Откройте Telegram-бот
                  </a>
                </p>
              </>
            ) : (
              <>
                <OTPInput
                  value={otp}
                  onChange={setOtp}
                  error={otpError}
                  disabled={loading}
                />

                <button
                  onClick={handleVerifyOTP}
                  disabled={otp.replace(/\D/g, "").length < 6 || loading}
                  className="btn btn-primary btn-lg"
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    opacity: (otp.replace(/\D/g, "").length < 6 || loading) ? 0.45 : 1,
                    cursor: (otp.replace(/\D/g, "").length < 6 || loading) ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "Проверка..." : "Войти →"}
                </button>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button
                    onClick={() => { setStep("phone"); setOtp(""); setOtpError(""); }}
                    style={{
                      fontSize: "12px", color: "var(--text-secondary)",
                      background: "none", border: "none", cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    ← Изменить номер
                  </button>

                  <button
                    onClick={handleResend}
                    disabled={resendSec > 0 || loading}
                    style={{
                      fontSize: "12px", fontWeight: 600,
                      color: resendSec > 0 || loading ? "var(--text-muted)" : "var(--accent)",
                      background: "none", border: "none",
                      cursor: resendSec > 0 || loading ? "not-allowed" : "pointer",
                      fontFamily: "inherit",
                      transition: "color .2s",
                    }}
                  >
                    {resendSec > 0 ? `Повторить через ${resendSec} сек` : "Отправить снова"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile / responsive */}
      <style>{`
        .login-brand-panel { display: flex; }
        .login-mobile-logo  { display: none; }

        @media (max-width: 768px) {
          .login-brand-panel { display: none !important; }
          .login-mobile-logo  { display: flex !important; }
        }

        .spinner {
          display: inline-block;
          width: 14px; height: 14px;
          border: 2px solid rgba(255,255,255,.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin .7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
