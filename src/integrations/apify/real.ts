import { assertScrapableUrl } from "./guard";
import { APIFY_API, ApifyError, type ApifyAdapter, type ApifyContactItem, type ApifyRunResult } from "./types";

export interface RealApifyDeps {
  token: string;
  /** Actor id or `user~name`, e.g. the Contact Details Scraper. */
  actorId: string;
  fetchImpl?: typeof fetch;
  /** Max seconds to wait for the run (Apify caps one waitForFinish call at 60 s). */
  waitSecs?: number;
  now?: () => number;
}

interface RunData {
  id?: string;
  status?: string;
  defaultDatasetId?: string;
  usageTotalUsd?: number;
}

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);
const strArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Normalises one dataset row of a contact actor (field names vary by actor) to `ApifyContactItem`. */
export function toContactItem(row: Record<string, unknown>): ApifyContactItem {
  return {
    url: String(row.url ?? row.originalStartUrl ?? row.domain ?? ""),
    emails: strArray(row.emails),
    phones: [...strArray(row.phones), ...strArray(row.phonesUncertain)],
    whatsapps: strArray(row.whatsapps),
  };
}

/** Input for the Contact Details Scraper: shallow, same domain, no social profiles. */
export function buildActorInput(urls: string[]): Record<string, unknown> {
  return { startUrls: urls.map((url) => ({ url })), maxRequestsPerStartUrl: 3, maxDepth: 1, sameDomain: true };
}

export function createRealApify(deps: RealApifyDeps): ApifyAdapter {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const headers = { Authorization: `Bearer ${deps.token}`, "Content-Type": "application/json" };

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchImpl(`${APIFY_API}${path}`, { ...init, headers });
    if (!res.ok) throw new ApifyError(`Apify respondió ${res.status}`, res.status);
    return (await res.json()) as T;
  }

  return {
    async scrapeContacts(rawUrls: string[]): Promise<ApifyRunResult> {
      const urls = rawUrls.map(assertScrapableUrl); // throws before any request or cost
      const started = now();
      let run = (
        await call<{ data: RunData }>(`/acts/${encodeURIComponent(deps.actorId)}/runs?waitForFinish=45`, {
          method: "POST",
          body: JSON.stringify(buildActorInput(urls)),
        })
      ).data;
      const deadline = started + Math.min(deps.waitSecs ?? 50, 50) * 1000;
      while (run.id && !TERMINAL.has(run.status ?? "") && now() < deadline) {
        run = (await call<{ data: RunData }>(`/actor-runs/${run.id}?waitForFinish=${Math.max(1, Math.min(45, Math.floor((deadline - now()) / 1000)))}`)).data;
      }
      const usage = typeof run.usageTotalUsd === "number" ? run.usageTotalUsd : 0;
      if (run.status !== "SUCCEEDED") {
        if (run.id && !TERMINAL.has(run.status ?? "")) {
          const aborted = await call<{ data: RunData }>(`/actor-runs/${run.id}/abort`, { method: "POST" }).catch(() => undefined);
          run = aborted?.data ?? run;
        }
        throw new ApifyError(`La corrida de Apify terminó en estado ${run.status ?? "desconocido"}`, undefined, typeof run.usageTotalUsd === "number" ? run.usageTotalUsd : usage, run.id);
      }
      const rows = run.defaultDatasetId
        ? await call<Record<string, unknown>[]>(`/datasets/${run.defaultDatasetId}/items?clean=true&format=json&limit=200`)
        : [];
      return {
        items: rows.map(toContactItem),
        runId: run.id ?? null,
        usageTotalUsd: typeof run.usageTotalUsd === "number" ? run.usageTotalUsd : 0,
        latencyMs: now() - started,
        isMock: false,
      };
    },
  };
}
