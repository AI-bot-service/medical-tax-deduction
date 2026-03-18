/**
 * Telegram Mini App SDK utilities (I-02).
 * Safe to call in SSR — all checks are guarded by typeof window.
 */

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: Record<string, unknown>;
  themeParams: TelegramThemeParams;
  colorScheme: "light" | "dark";
  ready: () => void;
  expand: () => void;
  close: () => void;
  MainButton: {
    text: string;
    show: () => void;
    hide: () => void;
    onClick: (fn: () => void) => void;
  };
}

/**
 * Returns true if the app is running inside a Telegram Mini App context.
 */
export function isTelegramWebApp(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.Telegram?.WebApp?.initData &&
      window.Telegram.WebApp.initData.length > 0,
  );
}

/**
 * Returns the raw initData string from Telegram.WebApp.
 * Returns null if not in Mini App context.
 */
export function getTelegramInitData(): string | null {
  if (typeof window === "undefined") return null;
  const initData = window.Telegram?.WebApp?.initData;
  return initData && initData.length > 0 ? initData : null;
}

/**
 * Applies Telegram theme colors as CSS variables on :root.
 * Safe to call if not in Mini App context (no-op).
 */
export function applyTelegramTheme(): void {
  if (typeof window === "undefined") return;
  const webApp = window.Telegram?.WebApp;
  if (!webApp) return;

  const params = webApp.themeParams;
  const root = document.documentElement;

  if (params.bg_color) root.style.setProperty("--tg-bg-color", params.bg_color);
  if (params.text_color) root.style.setProperty("--tg-text-color", params.text_color);
  if (params.hint_color) root.style.setProperty("--tg-hint-color", params.hint_color);
  if (params.link_color) root.style.setProperty("--tg-link-color", params.link_color);
  if (params.button_color)
    root.style.setProperty("--tg-button-color", params.button_color);
  if (params.button_text_color)
    root.style.setProperty("--tg-button-text-color", params.button_text_color);
  if (params.secondary_bg_color)
    root.style.setProperty("--tg-secondary-bg-color", params.secondary_bg_color);

  // Apply dark mode class if Telegram is in dark mode
  if (webApp.colorScheme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }

  // Signal to Telegram that the app is ready
  webApp.ready();
  webApp.expand();
}
