import { promises as dns } from "node:dns";
import { isGenericEmail } from "@/features/compliance/email";
import { normalizePhone } from "@/integrations/overpass/phone";
import type { WebResult, WebSearchAdapter } from "@/integrations/web-search";
import type { ExtractedContact, WebsiteFetchAdapter } from "@/integrations/website-fetch";
import { socialProfileUrls } from "@/integrations/website-fetch/extract";
import { nameTokens, pickCompanyWebsite } from "./discover";

/**
 * Free discovery (F22): find a company's own site and its social pages without paying for Apify.
 * 1) Guess the domain from the name (contablex -> contablex.com.co) and keep it only if it resolves and its page names
 *    the company. 2) With a free search API (Brave / Google Programmable Search), one query per company: the own site
 *    (same strict picker as before) plus the company's Instagram/Facebook/LinkedIn/TikTok page, and the generic
 *    contacts those public results show (company mailbox, business phone, WhatsApp link). Nothing is scraped from the
 *    social networks themselves.
 */
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const TLDS = [".com.co", ".com", ".co"];
const PARKED = /(dominio|domain)[^.]{0,40}(en venta|for sale|a la venta|is for sale)|parked (free|domain)|hugedomains|sedo\.com|dan\.com|buy this domain|compra este dominio/i;

const LEGAL = new Set(["sas", "ltda", "limitada", "sa", "s", "a", "de", "del", "la", "las", "el", "los", "y", "e", "en", "cia", "compania", "sociedad", "liquidacion", "zomac", "bic", "eu", "ips", "sigla", "and", "the", "co"]);

/**
 * Up to 9 candidate domains from the company name: all its words joined ("alfadental"), its distinctive words joined
 * ("ortodonciarafaelmartinez"), the first two of them, and the most distinctive one; each with .com.co, .com and .co.
 */
export function guessDomains(name: string): string[] {
  const tokens = nameTokens(name);
  if (!tokens.length) return [];
  const words = fold(name)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !LEGAL.has(w));
  const distinct = words.filter((w) => tokens.includes(w));
  const bases = [words.slice(0, 3).join(""), distinct.slice(0, 3).join(""), distinct.slice(0, 2).join(""), tokens[0]!];
  const ok = [...new Set(bases)].filter((b) => b.length >= 4 && b.length <= 40);
  return ok.flatMap((b) => TLDS.map((t) => `${b}${t}`)).slice(0, 9);
}

async function resolves(host: string, timeoutMs = 2500): Promise<boolean> {
  try {
    const r = await Promise.race([dns.lookup(host), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs))]);
    return !!r?.address;
  } catch {
    return false;
  }
}

const words = (s: string) =>
  fold(s)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/**
 * The page must exist, not be a parked domain, carry the company's name as a phrase (its first words without legal
 * forms: "profesionales consultores", "alfa dental") and show it is Colombian (the city, "Colombia" or a +57 number).
 * Guessed domains are often someone else's: a same-named firm in Paraguay or Spain must never pass.
 */
export function pageNamesCompany(text: string, name: string, opts: { city?: string | null; phones?: readonly string[] } = {}): boolean {
  const t = words(text).join(" ");
  if (!t || PARKED.test(fold(text))) return false;
  const phrase = words(name)
    .filter((w) => !LEGAL.has(w))
    .slice(0, 3)
    .join(" ");
  if (!phrase || nameTokens(name).length === 0 || !` ${t} `.includes(` ${phrase} `)) return false;
  const city = opts.city ? words(opts.city).join(" ") : "";
  return /\bcolombia\b/.test(t) || (!!city && ` ${t} `.includes(` ${city} `)) || (opts.phones ?? []).some((p) => p.startsWith("+57"));
}

export interface GuessResult {
  website?: string;
  contacts: ExtractedContact[];
  tried: number;
}

/** Domain guess: DNS first (cheap), then one robots-aware fetch of the home page to confirm it is the company. */
export async function guessWebsite(name: string, fetcher: WebsiteFetchAdapter, opts: { resolve?: (host: string) => Promise<boolean>; city?: string | null } = {}): Promise<GuessResult> {
  const resolve = opts.resolve ?? resolves;
  let tried = 0;
  for (const host of guessDomains(name)) {
    tried++;
    if (!(await resolve(host))) continue;
    const site = await fetcher.fetchSite(`https://${host}`);
    if (!site.pages.length) continue;
    const phones = site.extraction.contacts.filter((c) => c.type === "phone" || c.type === "whatsapp").map((c) => c.value);
    if (!pageNamesCompany(site.extraction.websiteText, name, { city: opts.city, phones })) continue;
    return { website: `https://${host}`, contacts: site.extraction.contacts, tried };
  }
  return { contacts: [], tried };
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
const PHONE_RE = /(?:\+?57[\s.-]?)?(?:3\d{2}|60\d|\(?60\d\)?)[\s.-]?\d{3}[\s.-]?\d{4}/g;
const WA_RE = /wa\.me\/\+?(\d{7,15})/gi;

/** Generic contacts a public search result shows for the company: company mailbox, business phone, WhatsApp link. */
export function contactsFromResult(r: WebResult, country = "CO"): ExtractedContact[] {
  const text = `${r.title} ${r.snippet}`;
  const out: ExtractedContact[] = [];
  for (const m of text.matchAll(EMAIL_RE)) {
    const e = m[0].toLowerCase();
    if (isGenericEmail(e)) out.push({ type: "email", value: e, isGeneric: true, evidenceUrl: r.url });
  }
  for (const m of text.replace(WA_RE, " ").matchAll(PHONE_RE)) {
    const p = normalizePhone(m[0], country);
    if (p) out.push({ type: "phone", value: p, isGeneric: true, evidenceUrl: r.url });
  }
  for (const m of text.matchAll(WA_RE)) {
    const p = normalizePhone(`+${m[1]}`, country);
    if (p) out.push({ type: "whatsapp", value: p, isGeneric: false, evidenceUrl: r.url });
  }
  return out;
}

/** A social result is the company's page only when its handle or its title carries the company's distinctive word. */
export function companySocialPages(name: string, results: readonly WebResult[]): Array<{ url: string; result: WebResult }> {
  const key = nameTokens(name)[0];
  if (!key) return [];
  const out: Array<{ url: string; result: WebResult }> = [];
  for (const r of results) {
    const [url] = socialProfileUrls([r.url]);
    if (!url) continue;
    // Every distinctive word (up to two) must be in the handle or the title: "Iglesia Plenitud de Vida" is not "Plenitud Vital".
    const hay = `${fold(url.split("/").pop() ?? "").replace(/[^a-z0-9]/g, "")} ${words(r.title).join(" ")} ${words(r.title).join("")}`;
    if (!nameTokens(name).slice(0, 2).every((t) => hay.includes(t))) continue;
    if (!out.some((o) => o.url === url)) out.push({ url, result: r });
  }
  return out.slice(0, 3);
}

export interface SearchDiscovery {
  website?: string;
  social: string[];
  contacts: ExtractedContact[];
  latencyMs: number;
}

/** Name without legal forms or quotes: "ORTODONCIA RAFAEL MARTINEZ S.A.S" -> "ortodoncia rafael martinez". */
export function searchName(name: string): string {
  return words(name.replace(/\b(s\.?\s?a\.?\s?s\.?|ltda\.?|s\.?\s?a\.?|e\.?\s?u\.?)(?=\s|$|-)/gi, " "))
    .filter((w) => !LEGAL.has(w) && w !== "liquidacion")
    .join(" ");
}

/**
 * Own site among the results: the strict picker first (its most distinctive word in the domain); otherwise a domain
 * carrying another distinctive word, but only when that result's title names the company (britek.com.co for
 * "Britek Tributo SAS", titled "Britek / Tributo").
 */
export function pickSiteFromResults(name: string, results: readonly WebResult[]): string | undefined {
  const strict = pickCompanyWebsite(name, results.map((r) => r.url));
  if (strict) return strict;
  const tokens = nameTokens(name);
  const named = results.filter((r) => tokens.slice(0, 2).every((t) => fold(r.title).includes(t)));
  for (const t of tokens.filter((x) => x.length >= 5)) {
    const hit = pickCompanyWebsite(t, named.map((r) => r.url));
    if (hit) return hit;
  }
  return undefined;
}

/** One search per company (name without legal forms + city); own site, company social pages and their public contacts. */
export async function searchCompany(name: string, city: string | null, search: WebSearchAdapter, fetcher?: WebsiteFetchAdapter): Promise<SearchDiscovery> {
  const q = `${searchName(name)} ${city ?? ""}`.trim();
  const { results, latencyMs } = await search.search(q);
  let website = pickSiteFromResults(name, results);
  // Same check as the domain guess: the page must name the company and be Colombian, or the site is not kept.
  if (website && fetcher) {
    const site = await fetcher.fetchSite(website).catch(() => null);
    const phones = site?.extraction.contacts.filter((c) => c.type === "phone" || c.type === "whatsapp").map((c) => c.value) ?? [];
    if (!site?.pages.length || !pageNamesCompany(site.extraction.websiteText, name, { city, phones })) website = undefined;
  }
  const social = companySocialPages(name, results);
  const contacts: ExtractedContact[] = [];
  const siteResult = website ? results.find((r) => r.url.includes(new URL(website).hostname)) : undefined;
  for (const r of [...(siteResult ? [siteResult] : []), ...social.map((s) => s.result)]) contacts.push(...contactsFromResult(r));
  for (const s of social) contacts.push({ type: "social", value: s.url, isGeneric: false, evidenceUrl: s.url });
  return { website, social: social.map((s) => s.url), contacts, latencyMs };
}
