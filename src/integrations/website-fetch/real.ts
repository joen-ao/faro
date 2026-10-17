import { isBlockedHost } from "@/lib/scrape-guard";
import { assertSafeFetchUrl, UnsafeUrlError, type Resolver } from "@/lib/ssrf";
import { extractPage, findContactLinks, mergeExtractions, type ExtractOptions, type PageExtraction } from "./extract";
import { ALLOW_ALL, DISALLOW_ALL, isPathAllowed, parseRobots, type RobotsRules } from "./robots";
import {
  FETCH_TIMEOUT_MS,
  MAX_BODY_BYTES,
  MAX_CONTACT_PAGES,
  MAX_REDIRECTS,
  type SiteFetchResult,
  type WebsiteFetchAdapter,
} from "./types";

export interface RealWebsiteFetchDeps extends ExtractOptions {
  fetchImpl?: typeof fetch;
  resolve?: Resolver;
  /** Public URL of the app, shown in the User-Agent. */
  appUrl?: string;
  timeoutMs?: number;
  maxBytes?: number;
  /** Minimum gap between two requests to the same domain. */
  minIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Total budget for one fetchSite call. */
  deadlineMs?: number;
}

function emptyExtraction(): SiteFetchResult["extraction"] {
  const e = mergeExtractions([]);
  return { ...e, signals: { ...e.signals, noAppointmentForm: false } };
}

export class FetchSkip extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

export const userAgent = (appUrl = "http://localhost:3000") => `Faro-30XHackathon/0.1 (+${appUrl})`;

interface GetResult {
  status: number;
  url: string;
  body: string;
  truncated: boolean;
  contentType: string;
}

function withAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new FetchSkip("timeout"));
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

function decode(bytes: Uint8Array, contentType: string): string {
  const cs = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType)?.[1] ?? /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(Buffer.from(bytes.subarray(0, 2048)).toString("latin1"))?.[1];
  try {
    return new TextDecoder(cs ?? "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** Fetches public pages of a company site: robots.txt aware, SSRF-safe, bounded in time and size, GET only. */
export function createRealWebsiteFetch(deps: RealWebsiteFetchDeps = {}): WebsiteFetchAdapter {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxBytes = deps.maxBytes ?? MAX_BODY_BYTES;
  const minInterval = deps.minIntervalMs ?? 1000;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const ua = userAgent(deps.appUrl);
  const robotsCache = new Map<string, Promise<RobotsRules>>();
  const lastRequest = new Map<string, number>();
  let requests = 0;
  let deadline: number | undefined;

  async function throttle(host: string, rules?: RobotsRules): Promise<void> {
    const gap = Math.max(minInterval, Math.min(rules?.crawlDelay ?? 0, 10) * 1000);
    const wait = (lastRequest.get(host) ?? -Infinity) + gap - now();
    if (wait > 0) await sleep(wait);
    lastRequest.set(host, now());
  }

  async function rulesFor(origin: string): Promise<RobotsRules> {
    let p = robotsCache.get(origin);
    if (!p) {
      p = (async () => {
        try {
          const r = await get(`${origin}/robots.txt`, false);
          if (r.status >= 200 && r.status < 300) return parseRobots(r.body, "faro");
          return r.status >= 500 || r.status === 429 ? DISALLOW_ALL : ALLOW_ALL;
        } catch (e) {
          if (e instanceof UnsafeUrlError) throw e;
          return DISALLOW_ALL; // robots.txt unreachable: do not crawl
        }
      })();
      robotsCache.set(origin, p);
    }
    return p;
  }

  async function get(startUrl: string, checkRobots: boolean): Promise<GetResult> {
    let current = startUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (isBlockedHost(current)) throw new FetchSkip("blocked_social_or_maps");
      if (deadline !== undefined && now() > deadline) throw new FetchSkip("deadline");
      const u = await assertSafeFetchUrl(current, deps.resolve);
      let rules: RobotsRules | undefined;
      if (checkRobots) {
        rules = await rulesFor(u.origin);
        if (!isPathAllowed(rules, u.pathname + u.search)) throw new FetchSkip("robots_disallow");
      }
      await throttle(u.hostname, rules);
      requests++;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await withAbort(
          fetchImpl(u.href, { method: "GET", redirect: "manual", signal: ctrl.signal, headers: { "User-Agent": ua, Accept: "text/html,application/xhtml+xml,text/plain;q=0.8" } }),
          ctrl.signal,
        );
        if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
          current = new URL(res.headers.get("location")!, u).href;
          await res.body?.cancel().catch(() => undefined);
          continue;
        }
        const contentType = res.headers.get("content-type") ?? "";
        const chunks: Uint8Array[] = [];
        let total = 0;
        let truncated = false;
        const reader = res.body?.getReader();
        while (reader) {
          const { done, value } = await withAbort(reader.read(), ctrl.signal);
          if (done) break;
          total += value.length;
          if (total > maxBytes) {
            chunks.push(value.subarray(0, value.length - (total - maxBytes)));
            truncated = true;
            await reader.cancel().catch(() => undefined);
            break;
          }
          chunks.push(value);
        }
        const bytes = Buffer.concat(chunks);
        return { status: res.status, url: u.href, body: decode(bytes, contentType), truncated, contentType };
      } catch (e) {
        if (e instanceof FetchSkip || e instanceof UnsafeUrlError) throw e;
        throw new FetchSkip(ctrl.signal.aborted ? "timeout" : "network_error");
      } finally {
        clearTimeout(timer);
      }
    }
    throw new FetchSkip("too_many_redirects");
  }

  async function page(url: string): Promise<GetResult> {
    const r = await get(url, true);
    if (r.status < 200 || r.status >= 300) throw new FetchSkip(`http_${r.status}`);
    if (r.contentType && !/html|xml|text\/plain/i.test(r.contentType)) throw new FetchSkip("not_html");
    return r;
  }

  return {
    async allows(rawUrl: string): Promise<boolean> {
      try {
        if (isBlockedHost(rawUrl)) return false;
        const u = await assertSafeFetchUrl(/^[a-z][a-z0-9+.-]*:/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`, deps.resolve);
        return isPathAllowed(await rulesFor(u.origin), u.pathname + u.search);
      } catch {
        return false;
      }
    },
    async fetchSite(rawUrl: string): Promise<SiteFetchResult> {
      const started = now();
      deadline = started + (deps.deadlineMs ?? 45_000);
      const startRequests = requests;
      const out: SiteFetchResult = {
        url: rawUrl,
        pages: [],
        skipped: [],
        extraction: emptyExtraction(),
        requests: 0,
        latencyMs: 0,
        isMock: false,
      };
      const finish = (): SiteFetchResult => ({ ...out, requests: requests - startRequests, latencyMs: Math.max(0, now() - started) });
      const reasonOf = (e: unknown): string => (e instanceof FetchSkip ? e.reason : e instanceof UnsafeUrlError ? `unsafe_url: ${e.message}` : "network_error");

      const start = /^[a-z][a-z0-9+.-]*:/i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`;
      const extractions: PageExtraction[] = [];
      let home: GetResult;
      try {
        home = await page(start);
      } catch (e) {
        out.skipped.push({ url: start, reason: reasonOf(e) });
        out.error = reasonOf(e);
        return finish();
      }
      const base = new URL(home.url);
      out.pages.push({ url: home.url, status: home.status, truncated: home.truncated });
      extractions.push(extractPage(home.body, home.url, deps));

      const candidates = [...findContactLinks(home.body, base), new URL("/contacto", base).href, new URL("/contact", base).href].filter(
        (u, i, a) => a.indexOf(u) === i && u.replace(/\/$/, "") !== home.url.replace(/\/$/, ""),
      );
      let got = 0;
      for (const c of candidates.slice(0, 4)) {
        if (got >= MAX_CONTACT_PAGES) break;
        try {
          const r = await page(c);
          if (new URL(r.url).hostname !== base.hostname) throw new FetchSkip("cross_domain_redirect");
          out.pages.push({ url: r.url, status: r.status, truncated: r.truncated });
          extractions.push(extractPage(r.body, r.url, deps));
          got++;
        } catch (e) {
          out.skipped.push({ url: c, reason: reasonOf(e) });
        }
      }
      out.extraction = mergeExtractions(extractions);
      return finish();
    },
  };
}
