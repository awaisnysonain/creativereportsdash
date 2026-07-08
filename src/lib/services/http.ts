/**
 * Small resilient fetch wrapper used by external service clients.
 * Handles retries with exponential backoff, honoring 429 / 5xx.
 */

export interface FetchJsonOptions extends RequestInit {
  retries?: number;
  backoffMs?: number;
  timeoutMs?: number;
}

export class HttpError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchJson<T = unknown>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const { retries = 3, backoffMs = 600, timeoutMs = 30_000, ...init } = options;
  let attempt = 0;
  let lastErr: unknown;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      const text = await res.text();
      if (!res.ok) {
        // Retry on rate limit / transient server errors.
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          const retryAfter = Number(res.headers.get("retry-after"));
          const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffMs * 2 ** attempt;
          await sleep(wait);
          attempt++;
          continue;
        }
        throw new HttpError(res.status, text);
      }
      return text ? (JSON.parse(text) as T) : ({} as T);
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (err instanceof HttpError) throw err;
      // Network / abort → retry.
      if (attempt < retries) {
        await sleep(backoffMs * 2 ** attempt);
        attempt++;
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("fetchJson failed");
}
