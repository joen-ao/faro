import { randomBytes } from "node:crypto";
import { and, eq, gt, inArray, ne, sql } from "drizzle-orm";
import type { AppDb } from "@/db/types";
import { companies, companySources, contactPoints, events, hunts, icpProfiles, leads } from "@/db/schema";
import { loadEffectiveOffer, type EffectiveOffer } from "@/features/offer/resolve";
import { seedDiagnosticDemo } from "@/db/seed";
import { isLegalEntity } from "@/features/compliance/email";
import { SHARED_DOMAINS } from "@/features/compliance/optout";
import { ready as readyConn } from "@/features/compliance/handle";
import { demoToolsEnabled } from "./limits";
import { normalizeName } from "./normalize";
import type { ContactInput } from "./contact";
import type { Tracking } from "./params";
import { isEnrichedSite, signalsOf, siteFactsFrom, type CompanyInput, type SiteFacts, type SourceInput } from "./findings";
import type { PeerSite } from "./benchmark";

const g = globalThis as unknown as { __faroDiagReady?: Promise<Awaited<ReturnType<typeof readyConn>>> };

/** Shared migrated connection; the demo lead is seeded only when FARO_SEED_DEMO=1 (dev/e2e), never in production. */
async function conn() {
  return (g.__faroDiagReady ??= (async () => {
    const c = await readyConn();
    if (demoToolsEnabled()) await seedDiagnosticDemo(c.db);
    return c;
  })());
}

export interface Diagnostic {
  leadId: string;
  isDemo: boolean;
  company: CompanyInput & { id: string };
  sources: SourceInput[];
  site: SiteFacts;
  /** Peers of the same hunt with an enriched website (real data only, never names). */
  peers: PeerSite[];
  /** Services the hunt offers (or the team catalog): feeds "Cómo le ayudamos" and the final block. */
  offer: EffectiveOffer;
}

/**
 * Website facts of peers from the same hunt: real leads only (never demo), real enrichment only (never mock),
 * excluding the company itself. Returns aggregates-ready rows without names.
 */
export async function peerSites(db: AppDb, huntId: string, excludeCompanyId: string): Promise<PeerSite[]> {
  const rows = await db
    .selectDistinctOn([companySources.companyId], { companyId: companySources.companyId, raw: companySources.raw })
    .from(leads)
    .innerJoin(companies, eq(companies.id, leads.companyId))
    .innerJoin(companySources, and(eq(companySources.companyId, companies.id), eq(companySources.sourceChannel, "website")))
    .where(
      and(
        eq(leads.huntId, huntId),
        eq(leads.isDemo, false),
        eq(companies.isDemo, false),
        eq(companySources.isMock, false),
        ne(companies.id, excludeCompanyId),
      ),
    );
  const enriched = rows.filter((r) => isEnrichedSite({ sourceChannel: "website", raw: r.raw }));
  if (!enriched.length) return [];
  const ids = enriched.map((r) => r.companyId);
  const cps = await db
    .select({ companyId: contactPoints.companyId, type: contactPoints.type })
    .from(contactPoints)
    .where(and(inArray(contactPoints.companyId, ids), eq(contactPoints.sourceChannel, "website"), inArray(contactPoints.type, ["whatsapp", "web_form"])));
  return enriched.map((r) => {
    const sig = signalsOf(r.raw)!;
    const mine = cps.filter((c) => c.companyId === r.companyId);
    return {
      onlineBooking: sig.onlineBooking === true,
      whatsapp: mine.some((c) => c.type === "whatsapp"),
      form: sig.hasContactForm === true || mine.some((c) => c.type === "web_form"),
      copyrightYear: typeof sig.copyrightYear === "number" ? sig.copyrightYear : null,
    };
  });
}

export async function getDiagnostic(slug: string): Promise<Diagnostic | null> {
  if (!/^[a-z0-9][a-z0-9-]{0,119}$/i.test(slug)) return null;
  const { db } = await conn();
  const [row] = await db
    .select({ lead: leads, company: companies })
    .from(leads)
    .innerJoin(companies, eq(leads.companyId, companies.id))
    .where(eq(leads.slug, slug))
    .limit(1);
  if (!row) return null;
  const sources = (await db.select().from(companySources).where(eq(companySources.companyId, row.company.id))).map((s) => ({
    sourceChannel: s.sourceChannel,
    sourceUrl: s.sourceUrl,
    license: s.license,
    isMock: s.isMock,
    raw: s.raw,
  }));
  const contacts = await db
    .select({ type: contactPoints.type, sourceChannel: contactPoints.sourceChannel })
    .from(contactPoints)
    .where(eq(contactPoints.companyId, row.company.id));
  const peers = row.lead.huntId ? await peerSites(db as unknown as AppDb, row.lead.huntId, row.company.id) : [];
  const [icp] = row.lead.huntId
    ? await db
        .select({ offer: icpProfiles.offer })
        .from(hunts)
        .innerJoin(icpProfiles, eq(icpProfiles.id, hunts.icpProfileId))
        .where(eq(hunts.id, row.lead.huntId))
        .limit(1)
    : [];
  const offer = await loadEffectiveOffer(db as unknown as AppDb, icp?.offer ?? null);
  return {
    leadId: row.lead.id,
    isDemo: row.lead.isDemo || row.company.isDemo,
    company: { id: row.company.id, name: row.company.name, address: row.company.address, city: row.company.city, website: row.company.website },
    sources,
    site: siteFactsFrom(sources, contacts),
    peers,
    offer,
  };
}

function eventUtm(t: Tracking): Record<string, string> | null {
  const u: Record<string, string> = { ...(t.utm ?? {}) };
  if (t.c) u.c = t.c;
  if (t.s) u.s = t.s;
  return Object.keys(u).length ? u : null;
}

export const OPEN_DEDUPE_MS = 30 * 60 * 1000;

/**
 * Page open. With the real Dapta widget -> `widget_open`; with the placeholder -> a `click` view event
 * (payload.kind = "page_view") so unconfigured opens never count as widget opens.
 * One event per lead + type + channel + source within 30 minutes. Unknown slug -> not recorded.
 */
export async function recordOpen(slug: string, tracking: Tracking, widgetConfigured: boolean, now: Date = new Date()): Promise<boolean> {
  const d = await getDiagnostic(slug);
  if (!d) return false;
  const { db } = await conn();
  const type = widgetConfigured ? ("widget_open" as const) : ("click" as const);
  const since = new Date(now.getTime() - OPEN_DEDUPE_MS);
  const dup = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.leadId, d.leadId),
        eq(events.type, type),
        gt(events.at, since),
        sql`coalesce(${events.utm}->>'c', '') = ${tracking.c ?? ""}`,
        sql`coalesce(${events.utm}->>'s', '') = ${tracking.s ?? ""}`,
      ),
    )
    .limit(1);
  if (dup.length) return false;
  await db.insert(events).values({
    leadId: d.leadId,
    type,
    payload: { page: "diagnostic", ...(widgetConfigured ? {} : { kind: "page_view", widget: false }) },
    utm: eventUtm(tracking),
    isDemo: d.isDemo,
  });
  return true;
}

/**
 * Form submit -> `form_submit`. Stores company, generic mailbox, a short role and a short message
 * (free text, length-capped; the form asks not to include person names).
 * ICP (paid) inbound: reuses an existing meta_ads lead with the same normalized company name or generic-mailbox domain.
 */
export async function recordContact(input: ContactInput, tracking: Tracking, icpSlug?: string, injected?: AppDb): Promise<boolean> {
  const db = injected ?? (await conn()).db;
  const payload = { company: input.company, email: input.email, role: input.role ?? null, message: input.message, consent: true };
  if (!icpSlug) {
    const d = await getDiagnostic(input.slug);
    if (!d) return false;
    await db.transaction(async (tx) => {
      const [cur] = await tx.select({ status: leads.status }).from(leads).where(eq(leads.id, d.leadId));
      if (cur && ["found", "fit", "contacted"].includes(cur.status)) await tx.update(leads).set({ status: "responded" }).where(eq(leads.id, d.leadId));
      await tx.insert(events).values({ leadId: d.leadId, type: "form_submit", payload, utm: eventUtm(tracking), isDemo: d.isDemo });
    });
    return true;
  }
  const norm = normalizeName(input.company);
  const domain = input.email.split("@")[1] ?? "";
  await db.transaction(async (tx) => {
    let leadId: string | undefined;
    const byName = await tx
      .select({ id: leads.id })
      .from(leads)
      .innerJoin(companies, eq(leads.companyId, companies.id))
      .where(and(eq(leads.primarySource, "meta_ads"), eq(companies.normalizedName, norm)))
      .limit(1);
    leadId = byName[0]?.id;
    if (!leadId && domain && !SHARED_DOMAINS.includes(domain)) {
      const byDomain = await tx
        .select({ id: leads.id })
        .from(contactPoints)
        .innerJoin(leads, eq(leads.companyId, contactPoints.companyId))
        .where(and(eq(contactPoints.sourceChannel, "meta_ads"), eq(leads.primarySource, "meta_ads"), sql`lower(${contactPoints.value}) like ${"%@" + domain}`))
        .limit(1);
      leadId = byDomain[0]?.id;
    }
    if (!leadId) {
      // Unverified inbound: assumed legal entity ("por verificar") unless the name looks like a natural person.
      const [company] = await tx.insert(companies).values({ name: input.company, normalizedName: norm, isLegalEntity: isLegalEntity(input.company).legal }).returning();
      await tx.insert(contactPoints).values({ companyId: company.id, type: "email", value: input.email, isGeneric: true, sourceChannel: "meta_ads" });
      const [lead] = await tx
        .insert(leads)
        .values({ companyId: company.id, status: "responded", primarySource: "meta_ads", slug: `in-${randomBytes(6).toString("hex")}` })
        .returning();
      leadId = lead.id;
    }
    await tx.insert(events).values({ leadId, type: "form_submit", payload: { ...payload, icp: icpSlug, unverified: true }, utm: eventUtm(tracking), isDemo: false });
  });
  return true;
}

/** Test/e2e helper: events of a lead by slug. */
export async function eventsForSlug(slug: string) {
  const { db } = await conn();
  const [lead] = await db.select({ id: leads.id }).from(leads).where(eq(leads.slug, slug));
  if (!lead) return [];
  return db.select().from(events).where(eq(events.leadId, lead.id));
}
