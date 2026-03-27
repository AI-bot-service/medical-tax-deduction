import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Urbanist", "system-ui", "-apple-system", "sans-serif"],
      },
      colors: {
        // shadcn/ui semantic tokens → HEITKAMP CSS vars
        background:  "hsl(var(--tw-background))",
        foreground:  "hsl(var(--tw-foreground))",
        card: {
          DEFAULT:    "hsl(var(--tw-card))",
          foreground: "hsl(var(--tw-card-foreground))",
        },
        primary: {
          DEFAULT:    "hsl(var(--tw-primary))",
          foreground: "hsl(var(--tw-primary-foreground))",
        },
        secondary: {
          DEFAULT:    "hsl(var(--tw-secondary))",
          foreground: "hsl(var(--tw-secondary-foreground))",
        },
        muted: {
          DEFAULT:    "hsl(var(--tw-muted))",
          foreground: "hsl(var(--tw-muted-foreground))",
        },
        destructive: {
          DEFAULT:    "hsl(var(--tw-destructive))",
          foreground: "hsl(var(--tw-destructive-foreground))",
        },
        border:  "hsl(var(--tw-border))",
        input:   "hsl(var(--tw-input))",
        ring:    "hsl(var(--tw-ring))",
      },
      borderRadius: {
        "4xl": "2rem",
        lg: "var(--r-md)",
        md: "var(--r-sm)",
        sm: "6px",
      },
      keyframes: {
        shimmer: {
          "0%":   { opacity: "0", transform: "translateX(-100%)" },
          "50%":  { opacity: "1" },
          "100%": { opacity: "0", transform: "translateX(300%)" },
        },
        pop: {
          "0%":   { transform: "scale(0)", opacity: "0" },
          "70%":  { transform: "scale(1.2)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s ease-in-out infinite",
        pop: "pop 0.3s ease-out forwards",
      },
    },
  },
  plugins: [],
};

export default config;
