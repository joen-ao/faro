import { and, eq } from "drizzle-orm";
import { apiCalls, companies, companySources } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { fold } from "@/features/offer/match";
import { PLACES_ENDPOINT, PLACES_LICENSE, recordPlacesCost, type PlacesAdapter } from "@/integrations/google-places";
import type { SourceCompany } from "@/integrations/types";
import { nameTokens, ownSiteRoot } from "./discover";

/**
 * F49 · Completes an existing company with its Google Maps listing: proves "no website" or finds the website.
 * Strict on purpose: a wrong match would put someone else's facts in a cold email.
 */
/** "Medellin Para Antioquia" -> "medellin"; "Bogota, D.C" -> "bogota". */
export const cityKey = (city: string | null) => (city ? fold(city).split(/,|\s+para\s+|\s+d\.?c\.?\b/)[0]!.trim() || null : null);

export function matchPlace(company: { name: string; city: string | null }, places: readonly SourceCompany[]): SourceCompany | null {
  const key = nameTokens(company.name)[0];
  if (!key) return null;
  const city = cityKey(company.city);
  return (
    places.find((p) => {
      const words = fold(p.name).split(/[^a-z0-9]+/);
      if (!words.includes(key)) return false;
      return !city || fold(`${p.address ?? ""} ${p.city ?? ""}`).includes(city);
    }) ?? null
  );
}

export const placesQuery = (name: string, city: string | null) => `${name.replace(/["']/g, " ").replace(/\s+/g, " ").trim()} ${city ?? ""}`.trim();

export interface PlacesEnrichResult {
  companyId: string;
  status: "matched" | "no_match" | "already_checked" | "no_name_tokens";
  placeId?: string;
  websiteFound?: string | null;
  calls: number;
}

/** Already searched (matched or not): never pay for the same company twice. */
export async function placesChecked(db: AppDb, companyId: string): Promise<boolean> {
  const [row] = await db.select({ id: companySources.id }).from(companySources).where(and(eq(companySources.companyId, companyId), eq(companySources.sourceChannel, "google_places"))).limit(1);
  return !!row;
}

export async function enrichFromPlaces(db: AppDb, companyId: string, places: PlacesAdapter, opts: { isMock?: boolean } = {}): Promise<PlacesEnrichResult> {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!company) throw new Error(`company ${companyId} not found`);
  if (await placesChecked(db, companyId)) return { companyId, status: "already_checked", calls: 0 };
  if (!nameTokens(company.name).length) return { companyId, status: "no_name_tokens", calls: 0 };

  const query = placesQuery(company.name, company.city);
  // The query already carries the city; `city` only labels the normalised results.
  const res = await places.search({ businessType: query, city: undefined, pageSize: 5, maxPages: 1 });
  const isMock = opts.isMock ?? res.isMock;
  await recordPlacesCost(db, { calls: res.calls, isMock });
  const hit = matchPlace(company, res.companies);

  if (!hit) {
    await db
      .insert(companySources)
      .values({ companyId, sourceChannel: "google_places", externalId: `places-miss:${companyId}`, raw: { matched: false, query }, sourceUrl: null, license: PLACES_LICENSE, isMock })
      .onConflictDoNothing();
    return { companyId, status: "no_match", calls: res.calls };
  }

  const placeId = String(hit.raw?.place_id ?? hit.externalId.replace(/^places:/, ""));
  const website = ownSiteRoot(hit.website);
  await db
    .insert(companySources)
    .values({
      companyId,
      sourceChannel: "google_places",
      externalId: `places:${placeId}`,
      raw: { place_id: placeId, types: hit.raw?.types ?? "", website: hit.website ?? null, matched_name: hit.name },
      sourceUrl: hit.sourceUrl,
      license: PLACES_LICENSE,
      isMock,
    })
    .onConflictDoNothing();
  if (!company.website && website && !isMock) await db.update(companies).set({ website }).where(eq(companies.id, companyId));
  return { companyId, status: "matched", placeId, websiteFound: website, calls: res.calls };
}

/** One api_calls row per Places request (the adapter's onApiCall). */
export const placesCallLogger = (db: AppDb) => async (c: { status: number | null; latencyMs: number; error: string | null; isMock: boolean }) => {
  await db.insert(apiCalls).values({ service: "google_places", endpoint: PLACES_ENDPOINT, status: c.status, latencyMs: c.latencyMs, error: c.error, costUsd: 0, isMock: c.isMock });
};
