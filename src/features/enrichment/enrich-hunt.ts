import { and, asc, eq, inArray } from "drizzle-orm";
import { apiCalls, companies, companySources, contactPoints, hunts, icpProfiles, leads } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { SHARED_DOMAINS as COMPLIANCE_SHARED } from "@/features/compliance/optout";
import { domainOf, SHARED_DOMAINS as DEDUPE_SHARED } from "@/features/dedupe/normalize";
import { IcpCriteria } from "@/features/icp/schema";
import { scoreLeadsDeterministic } from "@/features/hunts/service";
import { ApifyError, assertScrapableUrl, BlockedUrlError, type ApifyAdapter } from "@/integrations/apify";
import type { WebsiteFetchAdapter } from "@/integrations/website-fetch";
import { pickCompanyWebsite, websiteQuery } from "./discover";
import { apifyContacts, enrichCompany, EnrichInputError, recordApifyCost, US_HINT } from "./enrich";

/** Free mailbox providers and platforms: a generic address there says nothing about the company's own site. */
const FREE_MAIL = ["gmail.com", "googlemail.com", "hotmail.com", "hotmail.es", "outlook.com", "outlook.es", "live.com", "msn.com", "yahoo.com", "yahoo.es", "icloud.com", "me.com", "proton.me", "protonmail.com"];
export const NON_COMPANY_DOMAINS: readonly string[] = [...new Set([...DEDUPE_SHARED, ...COMPLIANCE_SHARED, ...FREE_MAIL])];

export const ENRICH_FRESH_MS = 24 * 3600 * 1000;
export const APIFY_BATCH_SIZE = 25;
export const DIRECT_CONCURRENCY = 4;
/** Website discovery (web search) per call and per hunt: the best-scored companies without a site or company email. */
export const DISCOVER_BATCH = 15;
export const DISCOVER_RUNS = 4;
export const DISCOVER_MAX = 1000;

/** Own domain deducible from a generic company mailbox (`info@clinica.co` -> `clinica.co`); undefined for free/shared hosts. */
export function deduceWebsite(emails: readonly string[]): string | undefined {
  for (const e of emails) {
    const host = e.split("@")[1];
    const d = host ? domainOf(host, NON_COMPANY_DOMAINS) : undefined;
    if (d) return `https://${d}`;
  }
  return undefined;
}

export interface EnrichHuntOptions {
  useApify?: boolean;
  /** Max candidate leads looked at in this call (default 25). */
  limit?: number;
  concurrency?: number;
  /** Offset into the stable candidate list (the endpoint's cursor). */
  cursor?: number;
  /** Stop starting new fetches after this many ms (the Apify run only starts if enough time is left). */
  budgetMs?: number;
  fetch: WebsiteFetchAdapter;
  apify?: ApifyAdapter;
  now?: () => number;
}

export interface EnrichHuntSummary {
  revisados: number;
  enriquecidos: number;
  conAgenda: number;
  conWhatsapp: number;
  contactosNuevos: number;
  costoApifyUsd: number;
  promovidosAFit: number;
  /** Extras for the paging client. */
  omitidosRecientes: number;
  dominiosDeducidos: number;
  /** Website discovery: companies searched and own sites found in this call; `discovering` keeps the client looping. */
  sitiosBuscados: number;
  sitiosEncontrados: number;
  discovering: boolean;
  cursor: number;
  nextCursor: number;
  total: number;
  done: boolean;
  notas: string[];
}

async function pool<T>(items: readonly T[], concurrency: number, shouldStop: () => boolean, fn: (item: T) => Promise<void>): Promise<number> {
  let next = 0;
  const worker = async () => {
    while (next < items.length && !shouldStop()) {
      const item = items[next++]!;
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return next; // items are pulled in order, so the processed ones are a prefix
}

const hostKey = (url: string) => domainOf(url, []) ?? url.toLowerCase();

/**
 * Enriches the websites of a hunt's non-demo leads: direct fetch (concurrency 4) and, with `useApify`, one Apify run per
 * batch of up to 25 URLs to complete contacts. Re-scores the touched leads so new site/contacts can promote them to `fit`.
 */
export async function enrichHunt(db: AppDb, huntId: string, opts: EnrichHuntOptions): Promise<EnrichHuntSummary> {
  const now = opts.now ?? Date.now;
  const started = now();
  const limit = Math.max(1, Math.min(opts.limit ?? 25, 200));
  const cursor = Math.max(0, opts.cursor ?? 0);
  const [row] = await db
    .select({ icp: icpProfiles, progress: hunts.progress })
    .from(hunts)
    .innerJoin(icpProfiles, eq(icpProfiles.id, hunts.icpProfileId))
    .where(eq(hunts.id, huntId));
  if (!row) throw new EnrichInputError("Búsqueda no encontrada", 404);
  const criteria = IcpCriteria.safeParse(row.icp.criteria);

  const leadRows = await db
    .select({ leadId: leads.id, companyId: companies.id, name: companies.name, website: companies.website, address: companies.address, city: companies.city, fitScore: leads.fitScore, isLegal: companies.isLegalEntity })
    .from(leads)
    .innerJoin(companies, eq(companies.id, leads.companyId))
    .where(and(eq(leads.huntId, huntId), eq(leads.isDemo, false), eq(companies.isDemo, false)))
    .orderBy(asc(leads.id));
  const companyIds = [...new Set(leadRows.map((l) => l.companyId))];
  const emailRows = companyIds.length
    ? await db.select({ companyId: contactPoints.companyId, value: contactPoints.value }).from(contactPoints).where(and(inArray(contactPoints.companyId, companyIds), eq(contactPoints.type, "email"), eq(contactPoints.isGeneric, true)))
    : [];
  const emailsBy = new Map<string, string[]>();
  for (const e of emailRows) emailsBy.set(e.companyId, [...(emailsBy.get(e.companyId) ?? []), e.value]);

  // Website discovery first (real Apify only): companies with neither a site nor a company mailbox get a web search, best
  // scores first, DISCOVER_BATCH per call up to DISCOVER_MAX per hunt. A found site is kept only if its domain carries a word
  // of the company name; the regular enrichment below then reads it.
  if (opts.useApify && opts.apify?.findWebsites && !opts.apify.isMock && cursor === 0) {
    const progress = (row.progress ?? {}) as Record<string, unknown> & { websiteSearch?: { searched?: string[] } };
    const searched = new Set(progress.websiteSearch?.searched ?? []);
    if (searched.size < DISCOVER_MAX) {
      const pending = [...leadRows]
        .filter((l) => l.isLegal && !l.website && !(emailsBy.get(l.companyId)?.length) && !searched.has(l.companyId))
        .sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0))
        .filter((l, i, arr) => arr.findIndex((x) => x.companyId === l.companyId) === i)
        .slice(0, Math.min(DISCOVER_BATCH * DISCOVER_RUNS, DISCOVER_MAX - searched.size));
      if (pending.length) {
        const base: EnrichHuntSummary = { revisados: 0, enriquecidos: 0, conAgenda: 0, conWhatsapp: 0, contactosNuevos: 0, costoApifyUsd: 0, promovidosAFit: 0, omitidosRecientes: 0, dominiosDeducidos: 0, sitiosBuscados: pending.length, sitiosEncontrados: 0, discovering: true, cursor: 0, nextCursor: 0, total: 0, done: false, notas: [] };
        const budget = opts.budgetMs ?? 50_000;
        const findWebsites = opts.apify.findWebsites.bind(opts.apify);
        const waitSecs = Math.max(10, Math.min(45, Math.floor(budget / 1000) - 5));
        // DISCOVER_RUNS actor runs in parallel (DISCOVER_BATCH companies each): one call searches up to 60 companies.
        const chunks: (typeof pending)[] = [];
        for (let i = 0; i < pending.length; i += DISCOVER_BATCH) chunks.push(pending.slice(i, i + DISCOVER_BATCH));
        const settled = await Promise.allSettled(chunks.map((chunk) => findWebsites(chunk.map((l) => ({ key: l.companyId, q: websiteQuery(l.name, l.city) })), { waitSecs })));
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i]!;
          const r = settled[i]!;
          if (r.status === "fulfilled") {
            const res = r.value;
            await db.insert(apiCalls).values({ service: "apify", endpoint: "google-search", status: 200, latencyMs: res.latencyMs, error: null, costUsd: 0, isMock: res.isMock });
            const share = res.usageTotalUsd / chunk.length;
            const evidence = `Apify ${res.runId ?? "run"} búsqueda de sitio web · usageTotalUsd ${res.usageTotalUsd.toFixed(6)} · ${chunk.length} empresas`;
            for (const l of chunk) await recordApifyCost(db, l.companyId, share, evidence, { isMock: false, isDemo: false });
            base.costoApifyUsd += res.usageTotalUsd;
            const byKey = new Map(res.results.map((x) => [x.key, x.urls]));
            for (const l of chunk) {
              const site = pickCompanyWebsite(l.name, byKey.get(l.companyId) ?? []);
              if (!site) continue;
              await db.update(companies).set({ website: site }).where(eq(companies.id, l.companyId));
              base.sitiosEncontrados++;
            }
          } else {
            const e = r.reason;
            if (e instanceof ApifyError && e.usageTotalUsd) {
              const share = e.usageTotalUsd / chunk.length;
              for (const l of chunk) await recordApifyCost(db, l.companyId, share, `Apify ${e.runId ?? "run"} búsqueda fallida · usageTotalUsd ${e.usageTotalUsd.toFixed(6)}`, { isMock: false, isDemo: false });
              base.costoApifyUsd += e.usageTotalUsd;
            }
            await db.insert(apiCalls).values({ service: "apify", endpoint: "google-search", status: null, latencyMs: 0, error: e instanceof Error ? e.message : "error", costUsd: 0, isMock: false });
            base.notas.push(`Búsqueda de sitios falló: ${e instanceof Error ? e.message : "error"}`);
          }
        }
        base.costoApifyUsd = Math.round(base.costoApifyUsd * 1e6) / 1e6;
        // Remember who was searched (found or not) so the next call moves on.
        const next = { ...progress, websiteSearch: { searched: [...searched, ...pending.map((l) => l.companyId)] } };
        await db.update(hunts).set({ progress: next }).where(eq(hunts.id, huntId));
        return base;
      }
    }
  }

  // Candidates: have a website or a deducible own domain. One entry per company (a company could be in the hunt once).
  const seen = new Set<string>();
  const candidates: Array<{ leadId: string; companyId: string; website: string | null; deduced: string | null }> = [];
  for (const l of leadRows) {
    if (seen.has(l.companyId)) continue;
    const deduced = l.website ? null : (deduceWebsite(emailsBy.get(l.companyId) ?? []) ?? null);
    if (!l.website && !deduced) continue;
    seen.add(l.companyId);
    candidates.push({ leadId: l.leadId, companyId: l.companyId, website: l.website, deduced });
  }

  const total = candidates.length;
  const slice = candidates.slice(cursor, cursor + limit);
  const srcRows = slice.length
    ? await db.select({ companyId: companySources.companyId, fetchedAt: companySources.fetchedAt, isMock: companySources.isMock }).from(companySources).where(and(inArray(companySources.companyId, slice.map((c) => c.companyId)), eq(companySources.sourceChannel, "website")))
    : [];
  const fresh = new Set(srcRows.filter((s) => !s.isMock && started - s.fetchedAt.getTime() < ENRICH_FRESH_MS).map((s) => s.companyId));
  const todo = slice.filter((c) => !fresh.has(c.companyId));

  const out: EnrichHuntSummary = { revisados: 0, enriquecidos: 0, conAgenda: 0, conWhatsapp: 0, contactosNuevos: 0, costoApifyUsd: 0, promovidosAFit: 0, omitidosRecientes: slice.length - todo.length, dominiosDeducidos: 0, sitiosBuscados: 0, sitiosEncontrados: 0, discovering: false, cursor, nextCursor: cursor, total, done: false, notas: [] };

  const budget = opts.budgetMs ?? Number.POSITIVE_INFINITY;
  // With Apify, keep ~half of the budget for the run itself.
  const directBudget = opts.useApify && Number.isFinite(budget) ? budget * 0.45 : budget;
  const processed: Array<{ leadId: string; companyId: string; website: string }> = [];
  const countryOf = new Map(leadRows.map((l) => [l.companyId, US_HINT.test(`${l.address ?? ""} ${l.city ?? ""}`) ? "US" : "CO"]));

  const processedCount = await pool(todo, opts.concurrency ?? DIRECT_CONCURRENCY, () => now() - started >= directBudget, async (c) => {
    let website = c.website;
    if (!website && c.deduced) {
      website = c.deduced;
      await db.update(companies).set({ website }).where(eq(companies.id, c.companyId));
      out.dominiosDeducidos++;
    }
    if (!website) return;
    try {
      const r = await enrichCompany(db, c.companyId, { fetch: opts.fetch, useApify: false });
      out.revisados++;
      if (r.status === "enriched") out.enriquecidos++;
      if (r.signals?.onlineBooking) out.conAgenda++;
      out.contactosNuevos += r.contactsAdded;
      processed.push({ leadId: c.leadId, companyId: c.companyId, website });
    } catch (e) {
      out.notas.push(`${website}: ${e instanceof Error ? e.message : "error"}`);
      out.revisados++;
    }
  });
  out.nextCursor = cursor + (processedCount === todo.length ? slice.length : sliceIndexAfter(slice, todo, processedCount));
  out.done = out.nextCursor >= total;

  // Apify: one run per batch of up to 25 URLs.
  if (opts.useApify && opts.apify && processed.length) {
    const apify = opts.apify;
    const byUrl = new Map<string, typeof processed>();
    const skipped: string[] = [];
    for (const p of processed) {
      let url: string;
      try {
        url = assertScrapableUrl(p.website);
      } catch (e) {
        skipped.push(e instanceof BlockedUrlError ? `${p.website}: ${e.message}` : p.website);
        continue;
      }
      // robots.txt: the real actor must not crawl what the site forbids.
      if (!apify.isMock && !(await opts.fetch.allows(url))) {
        skipped.push(`${p.website}: robots.txt no permite el rastreo`);
        continue;
      }
      byUrl.set(url, [...(byUrl.get(url) ?? []), p]);
    }
    if (skipped.length) out.notas.push(...skipped.slice(0, 5));
    const urls = [...byUrl.keys()];
    for (let i = 0; i < urls.length; i += APIFY_BATCH_SIZE) {
      const chunk = urls.slice(i, i + APIFY_BATCH_SIZE);
      const remaining = budget - (now() - started);
      if (remaining < 8000) {
        out.notas.push("Sin tiempo para Apify en este lote");
        break;
      }
      const owners = chunk.flatMap((u) => byUrl.get(u)!);
      try {
        const run = await apify.scrapeContacts(chunk, { waitSecs: Math.min(50, Math.floor(remaining / 1000) - 3) });
        await db.insert(apiCalls).values({ service: "apify", endpoint: "contact-actor", status: 200, latencyMs: run.latencyMs, error: null, costUsd: 0, isMock: run.isMock });
        const evidence = `Apify ${run.runId ?? "run"} · usageTotalUsd ${run.usageTotalUsd.toFixed(6)} · ${chunk.length} URL`;
        // Prorate the run cost evenly over the companies of the batch (recordApifyCost then spreads it over their leads).
        const share = run.usageTotalUsd / owners.length;
        for (const o of owners) await recordApifyCost(db, o.companyId, share, evidence, { isMock: run.isMock, isDemo: run.isMock });
        out.costoApifyUsd += run.usageTotalUsd;
        const itemsByHost = new Map<string, typeof run.items>();
        for (const it of run.items) itemsByHost.set(hostKey(it.url), [...(itemsByHost.get(hostKey(it.url)) ?? []), it]);
        for (const u of chunk) {
          const items = itemsByHost.get(hostKey(u)) ?? [];
          for (const o of byUrl.get(u)!) {
            const a = apifyContacts(items, countryOf.get(o.companyId) ?? "CO", u);
            if (run.isMock) continue; // fictional output never becomes contact_points
            const uniq = new Map(a.contacts.map((c) => [`${c.type}|${c.value}`, c]));
            for (const c of uniq.values()) {
              const ins = await db
                .insert(contactPoints)
                .values({ companyId: o.companyId, type: c.type, value: c.value, isGeneric: c.isGeneric, sourceChannel: "website", evidenceUrl: c.evidenceUrl })
                .onConflictDoNothing()
                .returning({ id: contactPoints.id });
              out.contactosNuevos += ins.length;
            }
          }
        }
      } catch (e) {
        if (e instanceof ApifyError && e.usageTotalUsd) {
          // A failed or aborted run is still billed.
          const share = e.usageTotalUsd / owners.length;
          const evidence = `Apify ${e.runId ?? "run"} fallida · usageTotalUsd ${e.usageTotalUsd.toFixed(6)}`;
          for (const o of owners) await recordApifyCost(db, o.companyId, share, evidence, { isMock: false, isDemo: false });
          out.costoApifyUsd += e.usageTotalUsd;
        }
        await db.insert(apiCalls).values({ service: "apify", endpoint: "contact-actor", status: null, latencyMs: 0, error: e instanceof Error ? e.message : "error", costUsd: 0, isMock: false });
        out.notas.push(`Apify falló: ${e instanceof Error ? e.message : "error"}`);
      }
    }
    out.costoApifyUsd = Math.round(out.costoApifyUsd * 1e6) / 1e6;
  }

  if (processed.length) {
    const ids = processed.map((p) => p.companyId);
    const wa = await db.select({ companyId: contactPoints.companyId }).from(contactPoints).where(and(inArray(contactPoints.companyId, ids), eq(contactPoints.type, "whatsapp")));
    out.conWhatsapp = new Set(wa.map((w) => w.companyId)).size;
    if (criteria.success) out.promovidosAFit = await scoreLeadsDeterministic(db, processed.map((p) => p.leadId), criteria.data, row.icp.id, row.icp.threshold);
  }
  return out;
}

/** Index in `slice` just after the last processed `todo` item (fresh ones before it are consumed too). */
function sliceIndexAfter(slice: Array<{ companyId: string }>, todo: Array<{ companyId: string }>, processedCount: number): number {
  if (processedCount === 0) return 0;
  const last = todo[processedCount - 1]!;
  return slice.findIndex((s) => s.companyId === last.companyId) + 1;
}
