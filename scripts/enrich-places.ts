import "./load-env";
import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { getReadyDb } from "../src/db/client";
import { companies, companySources, contactPoints, hunts, icpProfiles, leads, messages } from "../src/db/schema";
import type { AppDb } from "../src/db/types";
import { ownEmailDomain } from "../src/features/compliance/email";
import { enrichCompany } from "../src/features/enrichment";
import { ownSiteRoot } from "../src/features/enrichment/discover";
import { enrichFromPlaces, placesCallLogger } from "../src/features/enrichment/places-match";
import { isNotABuyer, segmentFor } from "../src/features/offer/fit";
import { createRealPlaces, getGooglePlaces } from "../src/integrations/google-places";
import { getWebsiteFetch } from "../src/integrations/website-fetch";
import { getEnv } from "../src/lib/env";

// F49 · Usage: npm run enrich:places -- [--limit 50] [--dry] [--real] [--mail-only]
// F50 · Step 1 always runs first: companies without website whose generic mailbox has its own domain get that site.
// --real uses the Places API (needs GOOGLE_PLACES_API_KEY; free tier covers ~1.000 calls/month). Without it: GOOGLE_PLACES_MODE.
const arg = (k: string) => process.argv.includes(k);
const limitIdx = process.argv.indexOf("--limit");
const limit = limitIdx > 0 ? Number(process.argv[limitIdx + 1]) : 50;
const dry = arg("--dry");

/** Companies worth completing: fit lead, legal entity, generic mailbox, sector with an offer, never contacted, never searched. */
async function candidates(db: AppDb) {
  const touched = db.select({ companyId: leads.companyId }).from(messages).innerJoin(leads, eq(leads.id, messages.leadId)).where(notInArray(messages.status, ["simulated", "draft"]));
  const searched = db.select({ companyId: companySources.companyId }).from(companySources).where(eq(companySources.sourceChannel, "google_places"));
  const rows = await db
    .selectDistinct({ companyId: companies.id, name: companies.name, city: companies.city, website: companies.website, criteria: icpProfiles.criteria })
    .from(leads)
    .innerJoin(companies, eq(companies.id, leads.companyId))
    .innerJoin(hunts, eq(hunts.id, leads.huntId))
    .innerJoin(icpProfiles, eq(icpProfiles.id, hunts.icpProfileId))
    .innerJoin(contactPoints, and(eq(contactPoints.companyId, companies.id), eq(contactPoints.type, "email"), eq(contactPoints.isGeneric, true)))
    .where(and(eq(leads.status, "fit"), eq(leads.isDemo, false), eq(companies.isDemo, false), eq(companies.isLegalEntity, true), notInArray(companies.id, touched), notInArray(companies.id, searched)));
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.companyId)) return false;
    seen.add(r.companyId);
    return !isNotABuyer(r.name) && !!segmentFor(typeof r.criteria.sector === "string" ? r.criteria.sector : null);
  });
}

/**
 * F50 · Companies with no website but a generic mailbox on their own domain: that domain is their site.
 * Independent of Places (a matched listing without website does not beat info@empresa.co).
 */
async function emailDomainCandidates(db: AppDb) {
  const touched = db.select({ companyId: leads.companyId }).from(messages).innerJoin(leads, eq(leads.id, messages.leadId)).where(notInArray(messages.status, ["simulated", "draft"]));
  const rows = await db
    .selectDistinct({ companyId: companies.id, name: companies.name, email: contactPoints.value })
    .from(leads)
    .innerJoin(companies, eq(companies.id, leads.companyId))
    .innerJoin(contactPoints, and(eq(contactPoints.companyId, companies.id), eq(contactPoints.type, "email"), eq(contactPoints.isGeneric, true)))
    .where(and(eq(leads.status, "fit"), eq(leads.isDemo, false), eq(companies.isDemo, false), eq(companies.isLegalEntity, true), isNull(companies.website), notInArray(companies.id, touched)));
  const out = new Map<string, { companyId: string; name: string; domain: string }>();
  for (const r of rows) {
    const domain = ownEmailDomain(r.email);
    if (domain && !out.has(r.companyId)) out.set(r.companyId, { companyId: r.companyId, name: r.name, domain });
  }
  return [...out.values()];
}

/** The live root of a domain when it answers with a page on that same site; null otherwise. */
async function liveSite(domain: string): Promise<string | null> {
  for (const url of [`https://${domain}`, `https://www.${domain}`]) {
    try {
      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "Mozilla/5.0 (compatible; MokubBot/1.0)" } });
      if (res.status >= 400) continue;
      const root = ownSiteRoot(res.url);
      if (root && new URL(root).hostname.replace(/^www\./, "").endsWith(domain)) return root;
    } catch {
      /* try the next form */
    }
  }
  return null;
}

async function reviewed(db: AppDb, companyId: string) {
  const rows = await db.select({ raw: companySources.raw }).from(companySources).where(and(eq(companySources.companyId, companyId), inArray(companySources.sourceChannel, ["website"])));
  return rows.some((r) => Number((r.raw as { fetchedPages?: number }).fetchedPages ?? 0) > 0);
}

async function main() {
  const { db, close } = await (async () => {
    const d = (await getReadyDb()) as unknown as AppDb;
    return { db: d, close: async () => {} };
  })();
  const env = getEnv();
  const fetch = getWebsiteFetch();
  // F50 · Step 1: the mailbox's own domain.
  const byMail = await emailDomainCandidates(db);
  console.log(`Con correo de dominio propio y sin web: ${byMail.length}${dry ? " · DRY" : ""}`);
  const m = { conSitio: 0, sinRespuesta: 0, revisadas: 0 };
  for (const c of byMail) {
    if (dry) {
      console.log(` - ${c.name} · ${c.domain}`);
      continue;
    }
    const root = await liveSite(c.domain);
    if (!root) {
      m.sinRespuesta++;
      console.log(`sin_sitio        ${c.name} · ${c.domain}`);
      continue;
    }
    m.conSitio++;
    await db.update(companies).set({ website: root }).where(and(eq(companies.id, c.companyId), isNull(companies.website)));
    if (!(await reviewed(db, c.companyId)) && (await enrichCompany(db, c.companyId, { fetch })).status === "enriched") m.revisadas++;
    console.log(`sitio_del_correo ${c.name} → ${root}`);
  }
  if (!dry) console.log("Dominio del correo:", JSON.stringify(m));

  if (arg("--mail-only")) return close();
  // Step 2: Google Places for the rest.
  const list = (await candidates(db)).slice(0, limit);
  console.log(`Candidatas: ${list.length} (límite ${limit})${dry ? " · DRY: no se llama a la API ni se escribe" : ""}`);
  if (dry) {
    for (const c of list) console.log(` - ${c.name} · ${c.city ?? "sin ciudad"} · web: ${c.website ?? "—"}`);
    return close();
  }
  const real = arg("--real");
  if (real && !env.GOOGLE_PLACES_API_KEY) throw new Error("--real necesita GOOGLE_PLACES_API_KEY");
  const places = real ? createRealPlaces({ apiKey: env.GOOGLE_PLACES_API_KEY!, onApiCall: placesCallLogger(db) }) : getGooglePlaces(env, placesCallLogger(db));
  console.log(real ? "Places: API real" : "Places: según GOOGLE_PLACES_MODE (mock no escribe webs)");
  const t = { buscadas: 0, llamadas: 0, emparejadas: 0, sinCoincidencia: 0, websEncontradas: 0, sinWebConfirmada: 0, websRevisadas: 0, errores: 0 };
  for (const c of list) {
    try {
      const r = await enrichFromPlaces(db, c.companyId, places);
      t.buscadas++;
      t.llamadas += r.calls;
      if (r.status === "matched") {
        t.emparejadas++;
        if (!c.website && r.websiteFound) t.websEncontradas++;
        if (!c.website && !r.websiteFound) t.sinWebConfirmada++;
      } else if (r.status === "no_match") t.sinCoincidencia++;
      const [now] = await db.select({ website: companies.website }).from(companies).where(eq(companies.id, c.companyId));
      if (now?.website && !(await reviewed(db, c.companyId))) {
        const e = await enrichCompany(db, c.companyId, { fetch });
        if (e.status === "enriched") t.websRevisadas++;
      }
      console.log(`${r.status.padEnd(16)} ${c.name}${r.websiteFound ? ` → ${r.websiteFound}` : ""}`);
    } catch (e) {
      t.errores++;
      console.error(`error ${c.name}: ${e instanceof Error ? e.message : e}`);
      if (t.errores >= 3 && t.buscadas === 0) break;
    }
  }
  console.log("Total:", JSON.stringify(t));
  await close();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
