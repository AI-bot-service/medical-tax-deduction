"use client";

import { forwardRef, useState, type ChangeEvent } from "react";

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  disabled?: boolean;
}

/**
 * Phone input with fixed "+7" prefix and formatting: (XXX) XXX-XX-XX
 */
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  function PhoneInput({ value, onChange, onBlur, error, disabled }, ref) {
    const [focused, setFocused] = useState(false);

    function formatDisplay(digits: string): string {
      const d = digits.replace(/\D/g, "").slice(0, 10);
      if (!d) return "";
      if (d.length < 3) return "(" + d;
      const out = "(" + d.slice(0, 3) + ")";
      if (d.length === 3) return out;
      if (d.length < 6) return out + " " + d.slice(3);
      const out2 = out + " " + d.slice(3, 6);
      if (d.length === 6) return out2;
      if (d.length < 8) return out2 + "-" + d.slice(6);
      const out3 = out2 + "-" + d.slice(6, 8);
      if (d.length === 8) return out3;
      return out3 + "-" + d.slice(8, 10);
    }

    function handleChange(e: ChangeEvent<HTMLInputElement>) {
      let raw = e.target.value.replace(/\D/g, "");
      // Strip leading 7 or 8 prefix (paste/autofill: +79... or 89...)
      if (raw.startsWith("7") || raw.startsWith("8")) raw = raw.slice(1);
      onChange(raw.slice(0, 10));
    }

    const borderColor = error
      ? "var(--red)"
      : focused
      ? "var(--accent)"
      : "var(--border)";
    const boxShadow = focused ? "0 0 0 3px var(--accent-light)" : "none";

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <label
          htmlFor="phone"
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--text-secondary)",
            letterSpacing: ".04em",
            textTransform: "uppercase",
            fontFamily: "inherit",
          }}
        >
          Номер телефона
        </label>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            borderRadius: "var(--r-sm)",
            border: `1.5px solid ${borderColor}`,
            background: error ? "var(--red-bg)" : "var(--surface)",
            boxShadow,
            transition: "border-color .15s, box-shadow .15s",
            opacity: disabled ? 0.5 : 1,
          }}
        >
          {/* Фиксированный префикс +7 */}
          <span
            style={{
              padding: "11px 2px 11px 16px",
              fontSize: "15px",
              fontWeight: 500,
              color: "var(--text-primary)",
              fontFamily: "inherit",
              userSelect: "none",
              pointerEvents: "none",
              flexShrink: 0,
            }}
          >
            +7
          </span>

          <input
            ref={ref}
            id="phone"
            type="tel"
            inputMode="numeric"
            placeholder=" (___) ___-__-__"
            value={value ? " " + formatDisplay(value) : ""}
            onChange={handleChange}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              onBlur?.();
            }}
            disabled={disabled}
            autoComplete="tel"
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              padding: "11px 16px 11px 0",
              fontSize: "15px",
              fontWeight: 500,
              color: "var(--text-primary)",
              fontFamily: "inherit",
              outline: "none",
              cursor: disabled ? "not-allowed" : "text",
              minWidth: 0,
            }}
          />
        </div>

        {error && (
          <p
            style={{
              fontSize: "12px",
              color: "var(--red-text)",
              fontFamily: "inherit",
            }}
          >
            {error}
          </p>
        )}
      </div>
    );
  },
);
