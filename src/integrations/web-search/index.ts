import { getEnv, type Env } from "@/lib/env";

/**
 * Free web search (F22) to find a company's own site and its social pages without Apify:
 * Brave Search API (free plan, 1 request/second) or Google Programmable Search (100 queries/day free).
 * Only the official APIs: no scraping of search result pages.
 */
export interface WebResult {
  url: string;
  title: string;
  snippet: string;
}

export interface WebSearchAdapter {
  provider: "brave" | "google";
  /** Minimum ms between calls (Brave free plan: 1 request per second). */
  minIntervalMs: number;
  search(q: string): Promise<{ results: WebResult[]; latencyMs: number }>;
}

export class WebSearchError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "WebSearchError";
  }
}

const TIMEOUT_MS = 8000;

async function getJson(url: string, headers: Record<string, string>): Promise<{ data: unknown; latencyMs: number }> {
  const t0 = Date.now();
  const res = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new WebSearchError(`HTTP ${res.status} de la búsqueda web`, res.status);
  return { data: await res.json(), latencyMs: Date.now() - t0 };
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const stripTags = (s: string) => s.replace(/<[^>]+>/g, "");

export function createBraveSearch(key: string): WebSearchAdapter {
  return {
    provider: "brave",
    minIntervalMs: 1100,
    async search(q) {
      const u = new URL("https://api.search.brave.com/res/v1/web/search");
      u.searchParams.set("q", q);
      // Brave has no "CO" market (422): the query already carries the city, which is enough to localise it.
      u.searchParams.set("search_lang", "es");
      u.searchParams.set("count", "10");
      const { data, latencyMs } = await getJson(u.href, { "X-Subscription-Token": key });
      const items = ((data as { web?: { results?: unknown[] } }).web?.results ?? []) as Array<Record<string, unknown>>;
      const results = items.map((r) => ({
        url: str(r.url),
        title: stripTags(str(r.title)),
        snippet: stripTags([str(r.description), ...((r.extra_snippets as unknown[]) ?? []).map(str)].join(" ")),
      }));
      return { results: results.filter((r) => r.url), latencyMs };
    },
  };
}

export function createGoogleSearch(key: string, cx: string): WebSearchAdapter {
  return {
    provider: "google",
    minIntervalMs: 0,
    async search(q) {
      const u = new URL("https://www.googleapis.com/customsearch/v1");
      u.searchParams.set("key", key);
      u.searchParams.set("cx", cx);
      u.searchParams.set("q", q);
      u.searchParams.set("gl", "co");
      u.searchParams.set("num", "10");
      const { data, latencyMs } = await getJson(u.href, {});
      const items = ((data as { items?: unknown[] }).items ?? []) as Array<Record<string, unknown>>;
      return { results: items.map((r) => ({ url: str(r.link), title: str(r.title), snippet: str(r.snippet) })).filter((r) => r.url), latencyMs };
    },
  };
}

/** The configured free search, or null (then only the free domain guess runs). Brave wins when both are set. */
export function getWebSearch(env: Env = getEnv()): WebSearchAdapter | null {
  if (env.BRAVE_SEARCH_API_KEY) return createBraveSearch(env.BRAVE_SEARCH_API_KEY);
  if (env.GOOGLE_CSE_KEY && env.GOOGLE_CSE_CX) return createGoogleSearch(env.GOOGLE_CSE_KEY, env.GOOGLE_CSE_CX);
  return null;
}
