"use client";

import { type ChangeEvent } from "react";

interface OTPInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}

/**
 * Single OTP input field (6 digits).
 */
export function OTPInput({ value, onChange, error, disabled }: OTPInputProps) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
    onChange(digits);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <label
        htmlFor="otp"
        style={{
          fontSize: "11px", fontWeight: 600,
          color: "var(--text-secondary)",
          letterSpacing: ".04em", textTransform: "uppercase",
          fontFamily: "inherit",
        }}
      >
        Код из Telegram
      </label>

      <input
        id="otp"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="______"
        maxLength={6}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        autoFocus
        style={{
          width: "100%",
          borderRadius: "var(--r-sm)",
          border: `1.5px solid ${error ? "var(--red)" : value.length > 0 ? "var(--accent)" : "var(--border)"}`,
          background: error ? "var(--red-bg)" : value.length > 0 ? "var(--accent-light)" : "var(--surface)",
          padding: "11px 16px",
          fontSize: "22px",
          fontWeight: 800,
          letterSpacing: "0.35em",
          color: error ? "var(--red-text)" : value.length > 0 ? "var(--accent-dark)" : "var(--text-primary)",
          fontFamily: "inherit",
          outline: "none",
          transition: "border-color .15s, background .15s, box-shadow .15s",
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "text",
          textAlign: "center",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--accent)";
          e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-light)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = error ? "var(--red)" : value.length > 0 ? "var(--accent)" : "var(--border)";
          e.currentTarget.style.boxShadow = "none";
        }}
      />

      {error && (
        <p style={{ fontSize: "12px", color: "var(--red-text)", fontFamily: "inherit" }}>
          {error}
        </p>
      )}
    </div>
  );
}
