import type { AppDb } from "@/db/types";
import { buildFindings, siteFactsFrom, type CompanyInput, type SourceInput } from "@/features/diagnostic/findings";
import { getServiceCatalog } from "@/features/settings/services";
import { recommendService, type Recommendation } from "./match";
import { parseHuntOffer, type Angle, type Service } from "./schema";

/** Services that apply to a hunt: its own offer, else the team's whole catalog (older hunts have no offer). */
export interface EffectiveOffer {
  services: Service[];
  angles: Angle[];
  origin: "hunt" | "catalog";
  /** The team's company that provides the services (signs the email). */
  company?: string;
}

export function effectiveOffer(huntOfferRaw: unknown, catalog: Service[]): EffectiveOffer {
  const hunt = parseHuntOffer(huntOfferRaw);
  if (hunt) return { services: hunt.services, angles: hunt.angles, origin: "hunt" };
  return { services: catalog, angles: [], origin: "catalog" };
}

export async function loadEffectiveOffer(db: AppDb, huntOfferRaw: unknown): Promise<EffectiveOffer> {
  const catalog = await getServiceCatalog(db);
  const base = parseHuntOffer(huntOfferRaw) ? effectiveOffer(huntOfferRaw, []) : effectiveOffer(null, catalog.services);
  return catalog.company ? { ...base, company: catalog.company } : base;
}

/** Recommended service for one lead from its stored website facts (deterministic, no AI). */
export function recommendForLead(
  company: CompanyInput,
  sources: SourceInput[],
  contacts: { type: string; sourceChannel: string | null }[],
  offer: EffectiveOffer,
  now: Date = new Date(),
): Recommendation | null {
  if (!offer.services.length) return null;
  const findings = buildFindings(company, siteFactsFrom(sources, contacts), now);
  return recommendService(findings, offer.services, offer.angles);
}
