import type { AppDb } from "@/db/types";
import { buildFindings, siteFactsFrom, type CompanyInput, type SourceInput } from "@/features/diagnostic/findings";
import { getServiceCatalog } from "@/features/settings/services";
import { FACT, PRIORITY, howWeHelp, isFindingKind, recommendService, type Recommendation } from "./match";
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

/** One concrete improvement for the email (F25): the fact from the diagnostic and, when a service fits, how we help. */
export interface Improvement {
  fact: string;
  help: string | null;
}

/** Up to `max` open findings of the lead, highest impact first, each with the matching service (fixed templates, no AI). */
export function improvementsForLead(
  company: CompanyInput,
  sources: SourceInput[],
  contacts: { type: string; sourceChannel: string | null }[],
  offer: EffectiveOffer,
  now: Date = new Date(),
  max = 3,
): Improvement[] {
  const findings = buildFindings(company, siteFactsFrom(sources, contacts), now).filter((f) => f.status === "opportunity" && isFindingKind(f.id));
  const ordered = PRIORITY.filter((k) => findings.some((f) => f.id === k)).slice(0, max);
  const shown = new Set<string>();
  return ordered.map((kind) => {
    const help = howWeHelp(kind, offer.services, offer.angles);
    // Same service twice: the second mention stays short.
    const key = help?.split(":")[1]?.split(".")[0]?.trim() ?? "";
    const out = { fact: FACT[kind].charAt(0).toUpperCase() + FACT[kind].slice(1), help: help && shown.has(key) ? howWeHelp(kind, offer.services, offer.angles, { short: true }) : help };
    if (key) shown.add(key);
    return out;
  });
}
