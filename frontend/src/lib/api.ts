/**
 * API fetch wrapper with 401 → refresh → retry logic (G-01).
 * Works with httpOnly cookie-based JWT (access TTL 15 min, refresh TTL 30 days).
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let isRefreshing = false;
let refreshQueue: Array<(ok: boolean) => void> = [];

async function doRefresh(): Promise<boolean> {
  try {
    const res = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Main fetch wrapper. All requests are sent with credentials: "include"
 * so the browser attaches the httpOnly cookie automatically.
 *
 * On 401:
 *   1. First request triggers POST /api/v1/auth/refresh
 *   2. Concurrent requests queue and wait for refresh result
 *   3. On success — original request is retried once
 *   4. On failure — ApiError(401) is thrown (caller should redirect to /login)
 */
export async function apiRequest<T = unknown>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const init: RequestInit = {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  };

  const res = await fetch(url, init);

  if (res.status !== 401) {
    if (!res.ok) {
      let message = res.statusText;
      try {
        const body = (await res.json()) as { detail?: string };
        if (body.detail) message = body.detail;
      } catch {
        // ignore
      }
      throw new ApiError(res.status, message);
    }
    return res.json() as Promise<T>;
  }

  // --- 401 handling ---
  if (isRefreshing) {
    // Queue this request until refresh resolves
    const ok = await new Promise<boolean>((resolve) => {
      refreshQueue.push(resolve);
    });
    if (!ok) throw new ApiError(401, "Session expired");
    const retry = await fetch(url, init);
    if (!retry.ok) throw new ApiError(retry.status, retry.statusText);
    return retry.json() as Promise<T>;
  }

  isRefreshing = true;
  const refreshed = await doRefresh();
  isRefreshing = false;

  // Notify queued requests
  refreshQueue.forEach((resolve) => resolve(refreshed));
  refreshQueue = [];

  if (!refreshed) throw new ApiError(401, "Session expired");

  const retry = await fetch(url, init);
  if (!retry.ok) {
    let message = retry.statusText;
    try {
      const body = (await retry.json()) as { detail?: string };
      if (body.detail) message = body.detail;
    } catch {
      // ignore
    }
    throw new ApiError(retry.status, message);
  }
  return retry.json() as Promise<T>;
}

/**
 * Upload FormData with 401 → refresh → retry (аналогично apiRequest, но без Content-Type).
 * Используется для multipart/form-data загрузок.
 */
export async function uploadFormData<T = unknown>(
  url: string,
  body: FormData,
): Promise<T> {
  const makeRequest = () =>
    fetch(url, { method: "POST", credentials: "include", body });

  let res = await makeRequest();

  if (res.status !== 401) {
    if (!res.ok) {
      let message = res.statusText;
      try {
        const b = (await res.json()) as { detail?: string };
        if (b.detail) message = b.detail;
      } catch { /* ignore */ }
      throw new ApiError(res.status, message);
    }
    return res.json() as Promise<T>;
  }

  // --- 401: refresh и повтор ---
  if (isRefreshing) {
    const ok = await new Promise<boolean>((resolve) => { refreshQueue.push(resolve); });
    if (!ok) throw new ApiError(401, "Сессия истекла");
    res = await makeRequest();
    if (!res.ok) throw new ApiError(res.status, res.statusText);
    return res.json() as Promise<T>;
  }

  isRefreshing = true;
  const refreshed = await doRefresh();
  isRefreshing = false;
  refreshQueue.forEach((resolve) => resolve(refreshed));
  refreshQueue = [];

  if (!refreshed) throw new ApiError(401, "Сессия истекла");

  res = await makeRequest();
  if (!res.ok) {
    let message = res.statusText;
    try {
      const b = (await res.json()) as { detail?: string };
      if (b.detail) message = b.detail;
    } catch { /* ignore */ }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

/** Convenience helpers */
export const api = {
  get: <T>(url: string, options?: RequestInit) =>
    apiRequest<T>(url, { ...options, method: "GET" }),

  post: <T>(url: string, body?: unknown, options?: RequestInit) =>
    apiRequest<T>(url, {
      ...options,
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(url: string, body?: unknown, options?: RequestInit) =>
    apiRequest<T>(url, {
      ...options,
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(url: string, options?: RequestInit) =>
    apiRequest<T>(url, { ...options, method: "DELETE" }),
};
