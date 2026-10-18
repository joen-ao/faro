import { desc, eq, ne, and, inArray } from "drizzle-orm";
import { companies, companySources, contactPoints, hunts, icpProfiles, leads, suppression } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { suggestionLine, type Recommendation } from "@/features/offer/match";
import { loadEffectiveOffer, recommendForLead, type EffectiveOffer } from "@/features/offer/resolve";
import type { DaptaLeadRecord } from "./types";

/** "Agentes de IA — menos trabajo manual… · Llamada de descubrimiento gratuita…": the offer as agent context. */
export function offerContext(r: Recommendation | null): string {
  if (!r) return "";
  return [`${r.service.name} — ${r.service.outcome}`, r.service.entryOffer].filter(Boolean).join(" · ");
}

const MAX_LEADS = 500;

/**
 * Leads that may be handed to Dapta: not opted out, no suppressed email/domain/phone.
 * Only generic company contacts are included (SPEC §8).
 */
export async function selectLeadsForDapta(
  db: AppDb,
  opts: { huntId?: string; appUrl: string; includeDemo?: boolean; limit?: number },
): Promise<DaptaLeadRecord[]> {
  const where = opts.huntId
    ? and(ne(leads.status, "opted_out"), eq(leads.huntId, opts.huntId))
    : ne(leads.status, "opted_out");
  const rows = await db
    .select({ lead: leads, company: companies })
    .from(leads)
    .innerJoin(companies, eq(leads.companyId, companies.id))
    .where(where)
    .orderBy(desc(leads.fitScore), leads.createdAt)
    .limit(Math.min(opts.limit ?? MAX_LEADS, MAX_LEADS));

  const suppressed = new Set((await db.select({ v: suppression.value }).from(suppression)).map((r) => r.v));
  const contacts = await db.select().from(contactPoints);
  const byCompany = new Map<string, typeof contacts>();
  for (const c of contacts) byCompany.set(c.companyId, [...(byCompany.get(c.companyId) ?? []), c]);

  const companyIds = [...new Set(rows.map((r) => r.company.id))];
  const sources = companyIds.length ? await db.select().from(companySources).where(inArray(companySources.companyId, companyIds)) : [];
  const huntIds = [...new Set(rows.map((r) => r.lead.huntId).filter((h): h is string => !!h))];
  const huntOffers = huntIds.length
    ? await db.select({ huntId: hunts.id, offer: icpProfiles.offer }).from(hunts).innerJoin(icpProfiles, eq(icpProfiles.id, hunts.icpProfileId)).where(inArray(hunts.id, huntIds))
    : [];
  const offers = new Map<string, EffectiveOffer>();
  const offerOf = async (huntId: string | null) => {
    const key = huntId ?? "-";
    if (!offers.has(key)) offers.set(key, await loadEffectiveOffer(db, huntOffers.find((h) => h.huntId === huntId)?.offer ?? null));
    return offers.get(key)!;
  };

  const base = opts.appUrl.replace(/\/$/, "");
  const out: DaptaLeadRecord[] = [];
  for (const { lead, company } of rows) {
    if (lead.isDemo && !opts.includeDemo) continue;
    const cps = byCompany.get(company.id) ?? [];
    const email = cps.find((c) => c.type === "email" && c.isGeneric)?.value ?? "";
    const phone = // Only company phones: flagged generic or coming from a company source (SPEC §8).
    cps.find((c) => (c.type === "phone" || c.type === "whatsapp") && (c.isGeneric || c.sourceChannel !== null))?.value ?? "";
    const domain = company.website?.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]?.toLowerCase();
    const isBlocked =
      (email && (suppressed.has(email.toLowerCase()) || suppressed.has(email.split("@")[1]?.toLowerCase() ?? "-"))) ||
      (phone && suppressed.has(phone)) ||
      (domain && suppressed.has(domain));
    if (isBlocked) continue;
    const rec = recommendForLead(
      company,
      sources.filter((x) => x.companyId === company.id).map((x) => ({ sourceChannel: x.sourceChannel, sourceUrl: x.sourceUrl, license: x.license, isMock: x.isMock, raw: x.raw as Record<string, unknown> })),
      cps.map((c) => ({ type: c.type, sourceChannel: c.sourceChannel })),
      await offerOf(lead.huntId),
    );
    out.push({
      leadId: lead.id,
      slug: lead.slug,
      company: company.name,
      phone,
      email,
      city: company.city ?? "",
      source: lead.primarySource,
      diagnosticUrl: `${base}/d/${lead.slug}`,
      notes: lead.fitScore != null ? `fit ${lead.fitScore}` : "",
      isDemo: lead.isDemo,
      suggestedService: suggestionLine(rec) ?? "",
      offer: offerContext(rec),
    });
  }
  return out;
}
