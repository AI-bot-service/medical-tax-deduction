"use client";

import {
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";

interface OTPInputProps {
  value: string; // 0-6 digit string
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}

const LENGTH = 6;

/**
 * 6-cell OTP input with auto-advance on input and backspace-to-prev navigation.
 */
export function OTPInput({ value, onChange, error, disabled }: OTPInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>(Array(LENGTH).fill(null));

  const digits = value.padEnd(LENGTH, "").split("").slice(0, LENGTH);

  function focus(idx: number) {
    refs.current[idx]?.focus();
  }

  function handleChange(idx: number, e: ChangeEvent<HTMLInputElement>) {
    const char = e.target.value.replace(/\D/g, "").slice(-1);
    const next = digits.map((d, i) => (i === idx ? char : d));
    onChange(next.join("").replace(/ /g, ""));
    if (char && idx < LENGTH - 1) focus(idx + 1);
  }

  function handleKeyDown(idx: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[idx]) {
        // clear current cell
        const next = digits.map((d, i) => (i === idx ? "" : d));
        onChange(next.join("").replace(/ /g, ""));
      } else if (idx > 0) {
        // move to previous and clear
        const next = digits.map((d, i) => (i === idx - 1 ? "" : d));
        onChange(next.join("").replace(/ /g, ""));
        focus(idx - 1);
      }
      e.preventDefault();
    } else if (e.key === "ArrowLeft" && idx > 0) {
      focus(idx - 1);
    } else if (e.key === "ArrowRight" && idx < LENGTH - 1) {
      focus(idx + 1);
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, LENGTH);
    onChange(pasted);
    const lastIdx = Math.min(pasted.length, LENGTH - 1);
    focus(lastIdx);
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-700">
        Код из Telegram
      </label>
      <div className="flex gap-2">
        {Array.from({ length: LENGTH }).map((_, idx) => (
          <input
            key={idx}
            ref={(el) => {
              refs.current[idx] = el;
            }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digits[idx] === " " ? "" : digits[idx]}
            onChange={(e) => handleChange(idx, e)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.target.select()}
            disabled={disabled}
            autoFocus={idx === 0}
            className={[
              "h-12 w-10 rounded-lg border text-center text-xl font-semibold outline-none transition-colors",
              "focus:border-blue-500 focus:ring-2 focus:ring-blue-200",
              error ? "border-red-400 bg-red-50" : "border-gray-300 bg-white",
              disabled ? "cursor-not-allowed opacity-50" : "",
            ].join(" ")}
          />
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
