import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { companies, contactPoints, events, leads, qualifications } from "@/db/schema";
import { parseEnv } from "@/lib/env";
import { normalizeDaptaNative } from "@/integrations/dapta/native";
import { daptaWebhookSchema, processDaptaWebhook } from "@/integrations/dapta/webhook";
import { adFromRef } from "@/features/inbound/agent-lead";
import { createTestDb } from "../helpers/test-db";

const env = parseEnv({});
const body = (id: string, phone: string, vars: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  data: { conversation: { id }, contact: { phone_number: phone }, analysis: { variables: vars }, ...extra },
});
const run = (db: Parameters<typeof processDaptaWebhook>[0], b: unknown) => processDaptaWebhook(db, daptaWebhookSchema.parse(normalizeDaptaNative(b)), env);

describe("F39 · contacts the agent meets first", () => {
  let conn: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    conn = await createTestDb();
  });
  afterAll(() => conn.close());

  it("reads ad references", () => {
    expect(adFromRef("meta-120245000000001")).toBe("120245000000001");
    expect(adFromRef("ig_120245000000001")).toBe("120245000000001");
    expect(adFromRef("spa-aurora-9x1")).toBeNull();
  });

  it("an unknown number with a booked call becomes a meta_ads lead credited to the ad", async () => {
    const r = await run(conn.db, body("in-1", "+57 300 111 2233", { nombre_negocio: "Ferretería El Tornillo", ref_diagnostico: "meta-120245000000001", reunion_agendada: true, fecha_reunion: "2026-11-10T15:00:00-05:00", producto_interes: "web_esencial" }));
    expect(r).toMatchObject({ ok: true, created: true, qualified: true, meetingBooked: true, adsConsent: false });
    if (!r.ok) throw new Error("expected ok");
    const [lead] = await conn.db.select().from(leads).where(eq(leads.id, r.leadId!));
    expect(lead).toMatchObject({ primarySource: "meta_ads", status: "qualified" });
    expect(lead!.slug.startsWith("wa-")).toBe(true);
    const [co] = await conn.db.select().from(companies).where(eq(companies.id, lead!.companyId));
    expect(co!.name).toBe("Ferretería El Tornillo");
    const evs = await conn.db.select().from(events).where(eq(events.leadId, lead!.id));
    expect(evs.map((e) => e.type)).toEqual(expect.arrayContaining(["form_submit", "qualified", "meeting_booked"]));
    expect(evs.find((e) => e.type === "form_submit")!.utm).toMatchObject({ utm_source: "meta", utm_content: "120245000000001" });
    // The per-ad query (F29) matches leads by utm_content = ad id.
    const perAd = await conn.db.execute(sql`select count(*)::int as n from events where utm ->> 'utm_source' = 'meta' and utm ->> 'utm_content' = '120245000000001'`);
    const rows = (perAd as unknown as { rows?: { n: number }[] }).rows ?? (perAd as unknown as { n: number }[]);
    expect(rows[0]!.n).toBe(1);
  });

  it("the second conversation of the same number reuses the lead", async () => {
    const r = await run(conn.db, body("in-2", "+573001112233", { calificado: true }));
    expect(r).toMatchObject({ ok: true, created: false, adsConsent: false });
    expect(await conn.db.select().from(contactPoints).where(eq(contactPoints.value, "+573001112233"))).toHaveLength(1);
    expect(await conn.db.select().from(qualifications).where(eq(qualifications.leadId, (r as { leadId: string }).leadId))).toHaveLength(2);
  });

  it("without a reference or name: a website lead with a masked name; a click-to-WhatsApp marker means Meta", async () => {
    const r = await run(conn.db, body("in-3", "+57 310 555 4321", { calificado: false }));
    if (!r.ok) throw new Error("expected ok");
    const [lead] = await conn.db.select({ src: leads.primarySource, name: companies.name }).from(leads).innerJoin(companies, eq(companies.id, leads.companyId)).where(eq(leads.id, r.leadId!));
    expect(lead).toEqual({ src: "website", name: "Contacto de WhatsApp ··· 4321" });
    const ad = await run(conn.db, body("in-4", "+57 311 999 0000", { calificado: true }, { referral: { source_type: "ad", ctwa_clid: "ARAkLk" } }));
    if (!ad.ok) throw new Error("expected ok");
    const [l2] = await conn.db.select().from(leads).where(eq(leads.id, ad.leadId!));
    expect(l2!.primarySource).toBe("meta_ads");
  });

  it("an opt-out from an unknown number creates nothing", async () => {
    const before = (await conn.db.select().from(leads)).length;
    const r = await run(conn.db, body("in-5", "+57 312 000 1111", { pidio_baja: true }));
    expect(r).toMatchObject({ ok: true, leadId: null });
    expect((await conn.db.select().from(leads)).length).toBe(before);
  });

  it("a diagnostic reference finds the existing lead by slug", async () => {
    const [c] = await conn.db.insert(companies).values({ name: "Spa Aurora", normalizedName: "spa aurora" }).returning();
    const [l] = await conn.db.insert(leads).values({ companyId: c!.id, primarySource: "osm", slug: "spa-aurora-9x1", status: "contacted" }).returning();
    const r = await run(conn.db, body("in-6", "+57 313 222 3333", { ref_diagnostico: "spa-aurora-9x1", calificado: true }));
    expect(r).toMatchObject({ ok: true, leadId: l!.id, created: false, adsConsent: true });
  });
});
