"use client";

import {
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";

interface OTPInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}

const LENGTH = 6;

/**
 * 6-cell OTP input with auto-advance and HEITKAMP styling.
 */
export function OTPInput({ value, onChange, error, disabled }: OTPInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>(Array(LENGTH).fill(null));
  const digits = value.padEnd(LENGTH, "").split("").slice(0, LENGTH);

  function focus(idx: number) { refs.current[idx]?.focus(); }

  function handleChange(idx: number, e: ChangeEvent<HTMLInputElement>) {
    const char = e.target.value.replace(/\D/g, "").slice(-1);
    const next = digits.map((d, i) => (i === idx ? char : d));
    onChange(next.join("").replace(/ /g, ""));
    if (char && idx < LENGTH - 1) focus(idx + 1);
  }

  function handleKeyDown(idx: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[idx]) {
        const next = digits.map((d, i) => (i === idx ? "" : d));
        onChange(next.join("").replace(/ /g, ""));
      } else if (idx > 0) {
        const next = digits.map((d, i) => (i === idx - 1 ? "" : d));
        onChange(next.join("").replace(/ /g, ""));
        focus(idx - 1);
      }
      e.preventDefault();
    } else if (e.key === "ArrowLeft"  && idx > 0)            focus(idx - 1);
    else if   (e.key === "ArrowRight" && idx < LENGTH - 1)   focus(idx + 1);
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH);
    onChange(pasted);
    focus(Math.min(pasted.length, LENGTH - 1));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <label style={{
        fontSize: "11px", fontWeight: 600,
        color: "var(--text-secondary)",
        letterSpacing: ".04em", textTransform: "uppercase",
        fontFamily: "inherit",
      }}>
        Код из Telegram
      </label>

      <div style={{ display: "flex", gap: "8px" }}>
        {Array.from({ length: LENGTH }).map((_, idx) => {
          const filled = digits[idx] && digits[idx] !== " ";
          return (
            <input
              key={idx}
              ref={(el) => { refs.current[idx] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digits[idx] === " " ? "" : digits[idx]}
              onChange={(e) => handleChange(idx, e)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              onPaste={handlePaste}
              onFocus={(e) => {
                e.target.select();
                e.currentTarget.style.borderColor = "var(--accent)";
                e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-light)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = error ? "var(--red)" : "var(--border)";
                e.currentTarget.style.boxShadow = "none";
              }}
              disabled={disabled}
              autoFocus={idx === 0}
              style={{
                flex: 1,
                height: "52px",
                borderRadius: "var(--r-sm)",
                border: `1.5px solid ${error ? "var(--red)" : filled ? "var(--accent)" : "var(--border)"}`,
                background: error ? "var(--red-bg)" : filled ? "var(--accent-light)" : "var(--surface)",
                textAlign: "center",
                fontSize: "20px",
                fontWeight: 800,
                color: filled ? "var(--accent-dark)" : "var(--text-primary)",
                fontFamily: "inherit",
                outline: "none",
                transition: "border-color .15s, background .15s, box-shadow .15s",
                opacity: disabled ? 0.5 : 1,
                cursor: disabled ? "not-allowed" : "text",
              }}
            />
          );
        })}
      </div>

      {error && (
        <p style={{ fontSize: "12px", color: "var(--red-text)", fontFamily: "inherit" }}>
          {error}
        </p>
      )}
    </div>
  );
}
