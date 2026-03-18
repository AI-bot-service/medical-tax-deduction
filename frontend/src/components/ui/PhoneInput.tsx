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
      // digits: raw 10-digit string (after +7)
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
      // strip leading 7 or 8 if user types full number
      let digits = raw;
      if (digits.startsWith("7") || digits.startsWith("8")) {
        digits = digits.slice(1);
      }
      digits = digits.slice(0, 10);
      onChange(digits);
    }

    function handleBlur(e: FocusEvent<HTMLInputElement>) {
      onBlur?.();
      void e;
    }

    const display = value ? formatDisplay(value) : "";

    return (
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700" htmlFor="phone">
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
          className={[
            "w-full rounded-lg border px-4 py-3 text-base outline-none transition-colors",
            "focus:border-blue-500 focus:ring-2 focus:ring-blue-200",
            error
              ? "border-red-400 bg-red-50"
              : "border-gray-300 bg-white",
            disabled ? "cursor-not-allowed opacity-50" : "",
          ].join(" ")}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  },
);
