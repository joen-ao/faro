import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { companies, companySources, contactPoints, events, leads } from "@/db/schema";
import { seedDiagnosticDemo } from "@/db/seed";
import { ready as readyConn } from "@/features/compliance/handle";
import { normalizeName } from "./normalize";
import type { ContactInput } from "./contact";
import type { Tracking } from "./params";
import type { CompanyInput, SourceInput } from "./findings";

const g = globalThis as unknown as { __faroDiagReady?: Promise<Awaited<ReturnType<typeof readyConn>>> };

/** Shared migrated connection; the demo lead is seeded only when FARO_SEED_DEMO=1 (dev/e2e), never in production. */
async function conn() {
  return (g.__faroDiagReady ??= (async () => {
    const c = await readyConn();
    if (process.env.FARO_SEED_DEMO === "1") await seedDiagnosticDemo(c.db);
    return c;
  })());
}

export interface Diagnostic {
  leadId: string;
  isDemo: boolean;
  company: CompanyInput & { id: string };
  sources: SourceInput[];
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
  const sources = await db.select().from(companySources).where(eq(companySources.companyId, row.company.id));
  return {
    leadId: row.lead.id,
    isDemo: row.lead.isDemo || row.company.isDemo,
    company: { id: row.company.id, name: row.company.name, address: row.company.address, city: row.company.city, website: row.company.website },
    sources: sources.map((s) => ({ sourceChannel: s.sourceChannel, sourceUrl: s.sourceUrl, license: s.license, isMock: s.isMock, raw: s.raw })),
  };
}

function eventUtm(t: Tracking): Record<string, string> | null {
  const u: Record<string, string> = { ...(t.utm ?? {}) };
  if (t.c) u.c = t.c;
  if (t.s) u.s = t.s;
  return Object.keys(u).length ? u : null;
}

/** Page open -> `widget_open` (the Dapta widget lives on this page). Unknown slug -> not recorded. */
export async function recordOpen(slug: string, tracking: Tracking): Promise<boolean> {
  const d = await getDiagnostic(slug);
  if (!d) return false;
  const { db } = await conn();
  await db.insert(events).values({
    leadId: d.leadId,
    type: "widget_open",
    payload: { page: "diagnostic" },
    utm: eventUtm(tracking),
    isDemo: d.isDemo,
  });
  return true;
}

/** Form submit -> `form_submit`. Stores company, generic mailbox/role and message only. */
export async function recordContact(input: ContactInput, tracking: Tracking, icpSlug?: string): Promise<boolean> {
  const { db } = await conn();
  const payload = { company: input.company, email: input.email, role: input.role ?? null, message: input.message, consent: true };
  let leadId: string;
  let isDemo = false;
  if (icpSlug) {
    // Inbound from paid media: a new lead from `meta_ads` (no person data, only what the company typed).
    const [company] = await db
      .insert(companies)
      .values({ name: input.company, normalizedName: normalizeName(input.company), isLegalEntity: true })
      .returning();
    await db.insert(contactPoints).values({ companyId: company.id, type: "email", value: input.email, isGeneric: true, sourceChannel: "meta_ads" });
    const [lead] = await db
      .insert(leads)
      .values({ companyId: company.id, status: "responded", primarySource: "meta_ads", slug: `in-${randomBytes(6).toString("hex")}` })
      .returning();
    leadId = lead.id;
  } else {
    const d = await getDiagnostic(input.slug);
    if (!d) return false;
    leadId = d.leadId;
    isDemo = d.isDemo;
    const [cur] = await db.select({ status: leads.status }).from(leads).where(eq(leads.id, leadId));
    if (cur && ["found", "fit", "contacted"].includes(cur.status)) await db.update(leads).set({ status: "responded" }).where(eq(leads.id, leadId));
  }
  await db.insert(events).values({ leadId, type: "form_submit", payload: icpSlug ? { ...payload, icp: icpSlug } : payload, utm: eventUtm(tracking), isDemo });
  return true;
}

/** Test/e2e helper: events of a lead by slug. */
export async function eventsForSlug(slug: string) {
  const { db } = await conn();
  const [lead] = await db.select({ id: leads.id }).from(leads).where(eq(leads.slug, slug));
  if (!lead) return [];
  return db.select().from(events).where(eq(events.leadId, lead.id));
}
