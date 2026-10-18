import { and, eq } from "drizzle-orm";
import { apiCalls, companies, companySources, contactPoints, leads } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { isGenericEmail } from "@/features/compliance/email";
import { prorateSharedCost, recordCost, splitEvenly } from "@/features/metrics/costs";
import { ApifyError, BlockedUrlError, createMockApify, type ApifyAdapter } from "@/integrations/apify";
import { normalizePhone } from "@/integrations/overpass/phone";
import { WEBSITE_LICENSE, type ExtractedContact, type SiteFetchResult, type WebsiteFetchAdapter } from "@/integrations/website-fetch";
import { createMockWebsiteFetch } from "@/integrations/website-fetch/mock";

export class EnrichInputError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "EnrichInputError";
  }
}

export interface EnrichDeps {
  fetch: WebsiteFetchAdapter;
  /** Only used when `useApify` is true (costs money in real mode). */
  apify?: ApifyAdapter;
  useApify?: boolean;
}

export interface EnrichSummary {
  companyId: string;
  website: string | null;
  status: "enriched" | "no_website" | "no_pages";
  pages: string[];
  skipped: Array<{ url: string; reason: string }>;
  contactsAdded: number;
  contactsFound: number;
  discardedPersonalEmails: number;
  signals: SiteFetchResult["extraction"]["signals"] | null;
  isMock: boolean;
  apify?: { used: boolean; costUsd: number; isMock: boolean; note?: string };
}

export const US_HINT = /\b(miami|florida|fl|usa|estados unidos|united states)\b/i;

function hostOf(url: string): string {
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`).hostname;
  } catch {
    return url;
  }
}

/** Apify items -> contacts, with the same rule as the direct fetch: only generic company mailboxes. */
export function apifyContacts(items: Array<{ url: string; emails: string[]; phones: string[]; whatsapps: string[] }>, country: string, evidence: string) {
  const contacts: ExtractedContact[] = [];
  let discarded = 0;
  for (const it of items) {
    for (const e of it.emails.map((x) => x.toLowerCase().trim())) {
      if (isGenericEmail(e)) contacts.push({ type: "email", value: e, isGeneric: true, evidenceUrl: it.url || evidence });
      else discarded++;
    }
    for (const p of it.phones) {
      const n = normalizePhone(p, country);
      if (n) contacts.push({ type: "phone", value: n, isGeneric: true, evidenceUrl: it.url || evidence });
    }
    for (const w of it.whatsapps) {
      const n = normalizePhone(w.startsWith("+") ? w : `+${w.replace(/\D/g, "")}`, country);
      if (n) contacts.push({ type: "whatsapp", value: n, isGeneric: false, evidenceUrl: it.url || evidence });
    }
  }
  return { contacts, discarded };
}

/** Spreads an Apify run cost over the company's leads, grouped by hunt; unattached when it has no lead. */
export async function recordApifyCost(db: AppDb, companyId: string, totalUsd: number, evidence: string, flags: { isMock: boolean; isDemo: boolean }) {
  const companyLeads = await db.select({ id: leads.id, huntId: leads.huntId }).from(leads).where(eq(leads.companyId, companyId));
  if (!companyLeads.length) {
    await recordCost(db, { sourceChannel: "website", category: "scraping", quantity: 1, unit: "run", rate: totalUsd, evidence, ...flags });
    return;
  }
  const shares = splitEvenly(totalUsd, companyLeads.length);
  const groups = new Map<string | null, { ids: string[]; usd: number }>();
  companyLeads.forEach((l, i) => {
    const g = groups.get(l.huntId) ?? { ids: [], usd: 0 };
    g.ids.push(l.id);
    g.usd += shares[i]!;
    groups.set(l.huntId, g);
  });
  for (const [huntId, g] of groups) {
    await prorateSharedCost(db, { huntId, sourceChannel: "website", category: "scraping", totalUsd: Math.round(g.usd * 1e6) / 1e6, leadIds: g.ids, evidence, ...flags });
  }
}

/**
 * Enriches one company from its public website (direct fetch, robots-aware) and optionally Apify.
 * Saves the `website` company_source, deduplicated contact_points and api_calls.
 * Mock results never create contact_points for non-demo companies.
 */
export async function enrichCompany(db: AppDb, companyId: string, deps: EnrichDeps): Promise<EnrichSummary> {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!company) throw new EnrichInputError("Empresa no encontrada", 404);
  const base: EnrichSummary = {
    companyId,
    website: company.website,
    status: "no_website",
    pages: [],
    skipped: [],
    contactsAdded: 0,
    contactsFound: 0,
    discardedPersonalEmails: 0,
    signals: null,
    isMock: false,
  };
  if (!company.website) return base;

  const country = US_HINT.test(`${company.address ?? ""} ${company.city ?? ""}`) ? "US" : "CO";
  // Demo companies point at fictional domains: never touch the network for them.
  const fetcher = company.isDemo ? createMockWebsiteFetch() : deps.fetch;
  const result = await fetcher.fetchSite(company.website);
  const host = hostOf(company.website);
  await db.insert(apiCalls).values({
    service: "website_fetch",
    endpoint: host,
    status: result.pages.length ? 200 : null,
    latencyMs: result.latencyMs,
    error: result.error ?? null,
    costUsd: 0,
    isMock: result.isMock,
  });

  let contacts: ExtractedContact[] = [...result.extraction.contacts];
  let discarded = result.extraction.discardedPersonalEmails;
  const isMock = result.isMock;
  const summary: EnrichSummary = { ...base, status: result.pages.length ? "enriched" : "no_pages", skipped: result.skipped };

  let apifyMeta: Record<string, unknown> | undefined;
  if (deps.useApify && deps.apify) {
    // Demo companies have fictional domains: never run a real (paid) actor on them.
    const apify = company.isDemo ? createMockApify() : deps.apify;
    try {
      const allowed = company.isDemo || apify.isMock === true || (await fetcher.allows(company.website));
      if (!allowed) {
        summary.apify = { used: false, costUsd: 0, isMock: false, note: "robots.txt no permite el rastreo" };
      } else {
        const run = await apify.scrapeContacts([company.website]);
        const a = apifyContacts(run.items, country, company.website);
        // Fictional Apify output only reaches contact_points of demo companies.
        if (!run.isMock || company.isDemo) contacts = [...contacts, ...a.contacts];
        discarded += a.discarded;
        await db.insert(apiCalls).values({
          service: "apify",
          endpoint: "contact-actor",
          status: 200,
          latencyMs: run.latencyMs,
          error: null,
          costUsd: 0, // the cost lives in cost_entries (SPEC §7)
          isMock: run.isMock,
        });
        const evidence = `Apify ${run.runId ?? "run"} · usageTotalUsd ${run.usageTotalUsd.toFixed(6)}`;
        await recordApifyCost(db, companyId, run.usageTotalUsd, evidence, { isMock: run.isMock, isDemo: run.isMock || company.isDemo });
        apifyMeta = { runId: run.runId, items: run.items.length, usageTotalUsd: run.usageTotalUsd };
        summary.apify = { used: true, costUsd: run.usageTotalUsd, isMock: run.isMock };
      }
    } catch (e) {
      const blocked = e instanceof BlockedUrlError;
      if (e instanceof ApifyError && e.usageTotalUsd) {
        // A failed or aborted run is still billed.
        await recordApifyCost(db, companyId, e.usageTotalUsd, `Apify ${e.runId ?? "run"} fallida · usageTotalUsd ${e.usageTotalUsd.toFixed(6)}`, { isMock: false, isDemo: company.isDemo });
      }
      summary.apify = { used: false, costUsd: 0, isMock: false, note: blocked ? e.message : "Apify falló; se conserva el resultado del fetch directo" };
      await db.insert(apiCalls).values({ service: "apify", endpoint: "contact-actor", status: null, latencyMs: 0, error: e instanceof Error ? e.message : "error", costUsd: 0, isMock: false });
    }
  }

  const sourceUrl = result.pages[0]?.url ?? company.website;
  const raw = {
    websiteText: result.extraction.websiteText,
    signals: result.extraction.signals,
    pages: result.pages.map((p) => p.url),
    skipped: result.skipped,
    discardedPersonalEmails: discarded,
    fetchedPages: result.pages.length,
    ...(apifyMeta ? { apify: apifyMeta } : {}),
  };
  const [prev] = await db.select({ id: companySources.id }).from(companySources).where(and(eq(companySources.companyId, companyId), eq(companySources.sourceChannel, "website")));
  if (!(prev && result.pages.length === 0)) await db
    .insert(companySources)
    .values({ companyId, sourceChannel: "website", externalId: `website:${companyId}`, raw, sourceUrl, license: WEBSITE_LICENSE, isMock })
    .onConflictDoUpdate({
      target: [companySources.sourceChannel, companySources.externalId],
      set: { raw, sourceUrl, license: WEBSITE_LICENSE, isMock, fetchedAt: new Date() },
    });

  // Mock output is fictional: it only becomes contact_points for demo companies.
  const persistable = isMock && !company.isDemo ? [] : contacts;
  let added = 0;
  const unique = new Map(persistable.map((c) => [`${c.type}|${c.value}`, c]));
  for (const c of unique.values()) {
    const rows = await db
      .insert(contactPoints)
      .values({ companyId, type: c.type, value: c.value, isGeneric: c.isGeneric, sourceChannel: "website", evidenceUrl: c.evidenceUrl })
      .onConflictDoNothing()
      .returning({ id: contactPoints.id });
    added += rows.length;
  }

  return {
    ...summary,
    pages: result.pages.map((p) => p.url),
    contactsAdded: added,
    contactsFound: unique.size,
    discardedPersonalEmails: discarded,
    signals: result.extraction.signals,
    isMock,
  };
}
