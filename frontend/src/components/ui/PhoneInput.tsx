"use client";

import { forwardRef, type ChangeEvent, type FocusEvent } from "react";

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  disabled?: boolean;
}

/**
 * Phone input with +7 prefix and formatting: +7 (XXX) XXX-XX-XX
 */
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  function PhoneInput({ value, onChange, onBlur, error, disabled }, ref) {
    function formatDisplay(digits: string): string {
      const d = digits.replace(/\D/g, "").slice(0, 10);
      if (d.length === 0) return "";
      let formatted = "+7";
      if (d.length > 0) formatted += " (" + d.slice(0, 3);
      if (d.length >= 3) formatted += ") " + d.slice(3, 6);
      else return formatted;
      if (d.length >= 6) formatted += "-" + d.slice(6, 8);
      if (d.length >= 8) formatted += "-" + d.slice(8, 10);
      return formatted;
    }

    function handleChange(e: ChangeEvent<HTMLInputElement>) {
      const raw = e.target.value.replace(/\D/g, "");
      let digits = raw;
      if (digits.startsWith("7") || digits.startsWith("8")) digits = digits.slice(1);
      digits = digits.slice(0, 10);
      onChange(digits);
    }

    function handleBlur(e: FocusEvent<HTMLInputElement>) {
      onBlur?.();
      void e;
    }

    const display = value ? formatDisplay(value) : "";

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <label
          htmlFor="phone"
          style={{
            fontSize: "11px", fontWeight: 600,
            color: "var(--text-secondary)",
            letterSpacing: ".04em", textTransform: "uppercase",
            fontFamily: "inherit",
          }}
        >
          Номер телефона
        </label>
        <input
          ref={ref}
          id="phone"
          type="tel"
          inputMode="numeric"
          placeholder="+7 (___) ___-__-__"
          value={display}
          onChange={handleChange}
          onBlur={handleBlur}
          disabled={disabled}
          autoComplete="tel"
          style={{
            width: "100%",
            borderRadius: "var(--r-sm)",
            border: `1.5px solid ${error ? "var(--red)" : "var(--border)"}`,
            background: error ? "var(--red-bg)" : "var(--surface)",
            padding: "11px 16px",
            fontSize: "15px",
            fontWeight: 500,
            color: "var(--text-primary)",
            fontFamily: "inherit",
            outline: "none",
            transition: "border-color .15s, box-shadow .15s",
            opacity: disabled ? 0.5 : 1,
            cursor: disabled ? "not-allowed" : "text",
          }}
          onFocus={(e) => {
            if (!error) e.currentTarget.style.borderColor = "var(--accent)";
            e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-light)";
          }}
          onBlurCapture={(e) => {
            e.currentTarget.style.borderColor = error ? "var(--red)" : "var(--border)";
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
  },
);
