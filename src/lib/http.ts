import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const USER_AGENT = "Faro-30XHackathon/0.1";

export interface HttpOptions {
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
  /** Disk cache directory (e.g. `.cache/overpass`). Omit to disable. */
  cacheDir?: string;
  cacheTtlMs?: number;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface HttpResult<T> {
  data: T;
  /** Latency of the original network call (also when served from cache). */
  latencyMs: number;
  fromCache: boolean;
  attempts: number;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function cacheKey(url: string, body?: string): string {
  return createHash("sha1")
    .update(url + "\n" + (body ?? ""))
    .digest("hex");
}

/** JSON request with timeout, retry + exponential backoff, and optional disk cache. */
export async function requestJson<T>(url: string, opts: HttpOptions = {}): Promise<HttpResult<T>> {
  const { timeoutMs = 60_000, retries = 3, backoffMs = 2_000, cacheDir, cacheTtlMs = 24 * 3600_000 } = opts;
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const file = cacheDir ? path.join(cacheDir, cacheKey(url, opts.body) + ".json") : undefined;

  if (file) {
    try {
      const raw = JSON.parse(await readFile(file, "utf8")) as { at: number; data: T; latencyMs?: number };
      if (Date.now() - raw.at < cacheTtlMs) return { data: raw.data, latencyMs: raw.latencyMs ?? 0, fromCache: true, attempts: 0 };
    } catch {
      /* cache miss */
    }
  }

  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    const started = Date.now();
    try {
      const res = await doFetch(url, {
        method: opts.method ?? "GET",
        body: opts.body,
        headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...opts.headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new HttpError(`HTTP ${res.status} from ${new URL(url).host}`, res.status);
      const data = (await res.json()) as T;
      if (file) {
        await mkdir(cacheDir!, { recursive: true });
        await writeFile(file, JSON.stringify({ at: Date.now(), data, latencyMs: Date.now() - started }));
      }
      return { data, latencyMs: Date.now() - started, fromCache: false, attempts: attempt };
    } catch (err) {
      lastErr = err;
      const status = err instanceof HttpError ? err.status : undefined;
      const retryable = status === undefined || RETRYABLE.has(status);
      if (!retryable || attempt > retries) break;
      await sleep(backoffMs * 2 ** (attempt - 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
