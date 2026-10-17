import { HttpError, requestJson } from "@/lib/http";
import { assertDatasetId, assertSoqlColumns, isPersonalRow } from "./datasets";
import type { ApiCallLogger, SocrataAdapter, SocrataQuery, SocrataResult, SocrataRow } from "./types";

export const SOCRATA_BASE = "https://www.datos.gov.co/resource";
const MAX_PAGE = 50_000;

export function buildSocrataUrl(dataset: string, q: SocrataQuery, base = SOCRATA_BASE): string {
  const p = new URLSearchParams();
  if (q.select) p.set("$select", assertSoqlColumns(q.select));
  if (q.where) p.set("$where", q.where);
  if (q.group) p.set("$group", assertSoqlColumns(q.group));
  if (q.order) p.set("$order", assertSoqlColumns(q.order));
  p.set("$limit", String(Math.min(Math.max(Math.trunc(q.limit ?? 1000), 1), MAX_PAGE)));
  if (q.offset) p.set("$offset", String(Math.max(Math.trunc(q.offset), 0)));
  return `${base}/${assertDatasetId(dataset)}.json?${p.toString()}`;
}

export interface RealSocrataOptions {
  appToken?: string;
  /** @deprecated Disk cache removed: it could persist natural-person names. Accepted and ignored. */
  cacheDir?: string;
  minIntervalMs?: number;
  timeoutMs?: number;
  retries?: number;
  /** In-memory cache: max entries (default 50, 0 disables) and TTL (default 10 min). */
  cacheMaxEntries?: number;
  cacheTtlMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Called after every real network call (success or failure) to log into `api_calls`. */
  onCall?: ApiCallLogger;
}

/** Placeholder for names removed from the cache. */
export const REDACTED = "[REDACTED]";

/** Drops name/id fields of rows that describe natural persons before they are cached. */
export function redactRow(r: SocrataRow): SocrataRow {
  if (!isPersonalRow(r)) return r;
  const out: SocrataRow = { ...r, _personal: "1" };
  for (const k of ["razon_social", "nombresede", "nombreprestador", "nit", "numeroidentificacion", "email_sede", "t_lefonosede", "direcci_nsede"]) {
    if (k in out) out[k] = REDACTED;
  }
  return out;
}

export function createRealSocrata(opts: RealSocrataOptions = {}): SocrataAdapter {
  const minInterval = opts.minIntervalMs ?? 500;
  const maxEntries = opts.cacheMaxEntries ?? 50;
  const ttl = opts.cacheTtlMs ?? 10 * 60_000;
  const cache = new Map<string, { at: number; rows: SocrataRow[]; latencyMs: number }>();
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let last = 0;
  let gate: Promise<unknown> = Promise.resolve();

  /** Serialises requests so concurrent callers still respect the minimum interval. */
  const throttle = (): Promise<void> => {
    const next = gate.then(async () => {
      const wait = last + minInterval - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
    });
    gate = next.catch(() => undefined);
    return next;
  };

  const log = async (rec: Parameters<ApiCallLogger>[0]) => {
    try {
      await opts.onCall?.(rec);
    } catch {
      /* logging must never break a search */
    }
  };

  async function get(dataset: string, q: SocrataQuery): Promise<SocrataResult> {
    const url = buildSocrataUrl(dataset, q);
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < ttl) {
      cache.delete(url);
      cache.set(url, hit);
      return { rows: hit.rows, latencyMs: hit.latencyMs, fromCache: true, isMock: false };
    }
    await throttle();
    const endpoint = new URL(url).pathname;
    const started = Date.now();
    try {
      const res = await requestJson<SocrataRow[]>(url, {
        headers: opts.appToken ? { "X-App-Token": opts.appToken } : undefined,
        timeoutMs: opts.timeoutMs ?? 45_000,
        retries: opts.retries,
        fetchImpl: opts.fetchImpl,
        sleep: opts.sleep,
      });
      if (!Array.isArray(res.data)) throw new Error("Socrata returned a non-array response");
      await log({ service: "socrata", endpoint, status: 200, latencyMs: res.latencyMs, error: null, costUsd: 0, isMock: false });
      if (maxEntries > 0) {
        cache.set(url, { at: Date.now(), rows: res.data.map(redactRow), latencyMs: res.latencyMs });
        while (cache.size > maxEntries) cache.delete(cache.keys().next().value!);
      }
      return { rows: res.data, latencyMs: res.latencyMs, fromCache: false, isMock: false };
    } catch (err) {
      const status = err instanceof HttpError ? (err.status ?? null) : null;
      await log({
        service: "socrata",
        endpoint,
        status,
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message.slice(0, 300) : "unknown error",
        costUsd: 0,
        isMock: false,
      });
      throw err;
    }
  }

  return {
    query: get,
    async count(dataset, where) {
      const r = await get(dataset, { select: "count(*)", where, limit: 1 });
      return { count: Number(r.rows[0]?.count ?? 0), latencyMs: r.latencyMs };
    },
    async queryAll(dataset, q, o = {}) {
      const pageSize = Math.min(Math.max(Math.trunc(o.pageSize ?? 10_000), 1), MAX_PAGE);
      const maxRows = o.maxRows ?? 200_000;
      const rows: SocrataRow[] = [];
      let latencyMs = 0;
      let fromCache = true;
      for (let offset = 0; rows.length < maxRows; offset += pageSize) {
        const limit = Math.min(pageSize, maxRows - rows.length);
        const page = await get(dataset, { ...q, order: q.order ?? ":id", limit, offset });
        rows.push(...page.rows);
        latencyMs += page.latencyMs;
        fromCache &&= page.fromCache;
        if (page.rows.length < limit) break;
      }
      return { rows, latencyMs, fromCache, isMock: false };
    },
  };
}
