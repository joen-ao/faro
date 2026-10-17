import { requestJson } from "@/lib/http";
import type { SocrataAdapter, SocrataQuery, SocrataResult, SocrataRow } from "./types";

export const SOCRATA_BASE = "https://www.datos.gov.co/resource";

export function buildSocrataUrl(dataset: string, q: SocrataQuery, base = SOCRATA_BASE): string {
  const p = new URLSearchParams();
  if (q.select) p.set("$select", q.select);
  if (q.where) p.set("$where", q.where);
  if (q.group) p.set("$group", q.group);
  if (q.order) p.set("$order", q.order);
  p.set("$limit", String(q.limit ?? 1000));
  if (q.offset) p.set("$offset", String(q.offset));
  return `${base}/${dataset}.json?${p.toString()}`;
}

export interface RealSocrataOptions {
  appToken?: string;
  cacheDir?: string;
  minIntervalMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export function createRealSocrata(opts: RealSocrataOptions = {}): SocrataAdapter {
  const minInterval = opts.minIntervalMs ?? 500;
  let last = 0;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  async function get(dataset: string, q: SocrataQuery): Promise<SocrataResult> {
    const wait = last + minInterval - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await requestJson<SocrataRow[]>(buildSocrataUrl(dataset, q), {
      headers: opts.appToken ? { "X-App-Token": opts.appToken } : undefined,
      cacheDir: opts.cacheDir,
      timeoutMs: 90_000,
      fetchImpl: opts.fetchImpl,
      sleep: opts.sleep,
    });
    if (!Array.isArray(res.data)) throw new Error("Socrata returned a non-array response");
    return { rows: res.data, latencyMs: res.latencyMs, fromCache: res.fromCache, isMock: false };
  }

  return {
    query: get,
    async count(dataset, where) {
      const r = await get(dataset, { select: "count(*)", where, limit: 1 });
      return { count: Number(r.rows[0]?.count ?? 0), latencyMs: r.latencyMs };
    },
    async queryAll(dataset, q, o = {}) {
      const pageSize = o.pageSize ?? 10_000;
      const maxRows = o.maxRows ?? 200_000;
      const rows: SocrataRow[] = [];
      let latencyMs = 0;
      let fromCache = true;
      for (let offset = 0; rows.length < maxRows; offset += pageSize) {
        const page = await get(dataset, { ...q, order: q.order ?? ":id", limit: pageSize, offset });
        rows.push(...page.rows);
        latencyMs += page.latencyMs;
        fromCache &&= page.fromCache;
        if (page.rows.length < pageSize) break;
      }
      return { rows, latencyMs, fromCache, isMock: false };
    },
  };
}
