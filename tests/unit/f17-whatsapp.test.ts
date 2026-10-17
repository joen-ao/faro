import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { companies, contactPoints, costEntries, costRates, events, hunts, icpProfiles, leads, messages, suppression, workspaces } from "@/db/schema";
import { seedCostRates } from "@/db/seed";
import { getWhatsappAdapter, selectWhatsappRows, buildWhatsappCsv, type WhatsappRow } from "@/integrations/whatsapp";
import { isStopText, processWhatsappWebhook, verifyWhatsappSecret, whatsappWebhookSchema } from "@/integrations/whatsapp/webhook";
import { evaluateOutreachForLead } from "@/features/compliance/evaluate";
import { parseEnv } from "@/lib/env";
import { createTestDb } from "../helpers/test-db";

const WEEKDAY = new Date("2026-10-14T15:00:00Z"); // Wed 10:00 Bogota
const SUNDAY = new Date("2026-10-18T15:00:00Z");
const APP = "https://faro.test";

describe("disabled by default", () => {
  it("WHATSAPP_ENABLED defaults to false and the adapter exports nothing", () => {
    const env = parseEnv({});
    expect(env.WHATSAPP_ENABLED).toBe(false);
    const a = getWhatsappAdapter(env);
    expect(a.enabled).toBe(false);
    expect(a.isMock).toBe(true);
    expect(a.exportCsv([]).rows).toBe(0);
    expect(getWhatsappAdapter(parseEnv({ WHATSAPP_ENABLED: "true" })).enabled).toBe(true);
  });
});

describe("csv", () => {
  const row = (o: Partial<WhatsappRow> = {}): WhatsappRow => ({
    leadId: "l", slug: "s", company: "=HYPERLINK(\"x\")", phone: "+573001112233", diagnosticUrl: `${APP}/d/s?c=whatsapp`, optOutUrl: `${APP}/baja/t`, isDemo: false, ...o,
  });
  it("neutralises formulas, keeps E.164 and drops invalid phones", () => {
    const out = buildWhatsappCsv([row(), row({ phone: "3001112233" })]);
    expect(out.rows).toBe(1);
    expect(out.csv).toContain("'=HYPERLINK");
    expect(out.csv).toContain("+573001112233");
    expect(out.csv).toContain("c=whatsapp");
    expect(out.csv).toContain("{{enlace_baja}}");
  });
});

describe("selection", () => {
  let conn: Awaited<ReturnType<typeof createTestDb>>;
  const mk = async (name: string, phones: { value: string; isGeneric?: boolean; src?: "osm" | "google_places" | null }[], extra: { legal?: boolean; website?: string; huntId?: string } = {}) => {
    const [c] = await conn.db
      .insert(companies)
      .values({ name, normalizedName: name.toLowerCase(), city: "Bogota", isLegalEntity: extra.legal ?? true, website: extra.website ?? null })
      .returning();
    for (const p of phones) {
      await conn.db.insert(contactPoints).values({ companyId: c!.id, type: "phone", value: p.value, isGeneric: p.isGeneric ?? false, sourceChannel: p.src ?? null });
    }
    const [l] = await conn.db.insert(leads).values({ companyId: c!.id, primarySource: "osm", slug: name.toLowerCase().replace(/\s/g, "-") + "-1a2b", fitScore: 70, huntId: extra.huntId ?? null }).returning();
    return { company: c!, lead: l! };
  };
  beforeAll(async () => {
    conn = await createTestDb();
    await mk("Empresa Ok", [{ value: "+573011110001", src: "google_places" }]);
    await mk("Celular Osm", [{ value: "+573011110006", src: "osm" }]); // unverified OSM mobile
    const [ws] = await conn.db.insert(workspaces).values({ name: "US", country: "US" }).returning();
    const [icp] = await conn.db.insert(icpProfiles).values({ workspaceId: ws!.id, prompt: "x" }).returning();
    const [h] = await conn.db.insert(hunts).values({ icpProfileId: icp!.id }).returning();
    await mk("Empresa Us", [{ value: "+12125550100", src: "google_places" }], { huntId: h!.id });
    await mk("Celular Personal", [{ value: "+573011110002" }]); // not generic, no company source
    await mk("Suprimida", [{ value: "+573011110003", src: "google_places" }]);
    await conn.db.insert(suppression).values({ kind: "phone", value: "+573011110003", reason: "test" });
    const c = await mk("Ya Correo", [{ value: "+573011110004", src: "google_places" }]);
    await conn.db.insert(messages).values({ leadId: c.lead.id, contactChannel: "email", body: "hola", status: "sent" });
    await mk("Persona Natural", [{ value: "+573011110005", src: "google_places" }], { legal: false });
  });
  afterAll(() => conn.close());

  it("exports only company phones, excluding suppressed, emailed and natural persons", async () => {
    const sel = await selectWhatsappRows(conn.db, { appUrl: APP, now: WEEKDAY });
    expect(sel.rows.map((r) => r.company)).toEqual(["Empresa Ok"]);
    expect(sel.rows[0]!.diagnosticUrl).toContain("c=whatsapp");
    expect(sel.rows[0]!.optOutUrl).toContain("/baja/");
    const rules = sel.skipped.map((s) => s.rule).sort();
    expect(rules).toEqual(["already_contacted", "channel_not_allowed", "natural_person", "suppressed"]);
  });

  it("reserves exported companies so a later email sees them as contacted; re-export is stable", async () => {
    const a = await selectWhatsappRows(conn.db, { appUrl: APP, now: WEEKDAY, reserve: true });
    expect(a.rows).toHaveLength(1);
    const ev = await evaluateOutreachForLead(conn.db, a.rows[0]!.leadId, { channel: "email", value: "info@x.co", isGeneric: true }, WEEKDAY);
    expect(ev.blocks.map((b) => b.rule)).toContain("already_contacted");
    const b = await selectWhatsappRows(conn.db, { appUrl: APP, now: WEEKDAY, reserve: true });
    expect(b.rows).toHaveLength(1);
    const reservations = await conn.db.select().from(messages).where(eq(messages.contactChannel, "whatsapp"));
    expect(reservations).toHaveLength(1);
  });

  it("exports nothing on Sunday (Ley 2300 window)", async () => {
    const sel = await selectWhatsappRows(conn.db, { appUrl: APP, now: SUNDAY });
    expect(sel.rows).toHaveLength(0);
    expect(sel.nextAllowedAt).toBeInstanceOf(Date);
  });
});

describe("webhook", () => {
  const req = (h: Record<string, string>) => new Request("http://x/api", { method: "POST", headers: h });
  it("verifies the shared secret", () => {
    const env = { WHATSAPP_WEBHOOK_SECRET: "s3" };
    expect(verifyWhatsappSecret(req({ "x-whatsapp-secret": "s3" }), env)).toBe(true);
    expect(verifyWhatsappSecret(req({ authorization: "Bearer s3" }), env)).toBe(true);
    expect(verifyWhatsappSecret(req({ "x-whatsapp-secret": "bad" }), env)).toBe(false);
    expect(verifyWhatsappSecret(req({}), env)).toBe(false);
    expect(verifyWhatsappSecret(req({ "x-whatsapp-secret": "" }), {})).toBe(false);
  });

  it("detects BAJA/STOP", () => {
    expect(isStopText("STOP")).toBe(true);
    expect(isStopText("Por favor, baja!")).toBe(true);
    expect(isStopText("me interesa")).toBe(false);
    expect(isStopText("bajamos el precio?")).toBe(false);
  });

  describe("processing", () => {
    let conn: Awaited<ReturnType<typeof createTestDb>>;
    let leadId: string;
    let companyId: string;
    beforeAll(async () => {
      conn = await createTestDb();
      await seedCostRates(conn.db);
      const [c] = await conn.db.insert(companies).values({ name: "Wa Co", normalizedName: "wa co" }).returning();
      companyId = c!.id;
      await conn.db.insert(contactPoints).values({ companyId, type: "phone", value: "+573021110000", sourceChannel: "osm" });
      const [l] = await conn.db.insert(leads).values({ companyId, primarySource: "osm", slug: "wa-co-1a2b" }).returning();
      leadId = l!.id;
    });
    afterAll(() => conn.close());

    it("sent records message, event and a template cost from cost_rates (idempotent)", async () => {
      await conn.db.update(costRates).set({ usd: 0.02 }).where(eq(costRates.key, "whatsapp_template"));
      const p = whatsappWebhookSchema.parse({ event: "sent", slug: "wa-co-1a2b", message_id: "m1", phone: "+57 302 111 0000" });
      const r = await processWhatsappWebhook(conn.db, p);
      expect(r).toMatchObject({ ok: true, duplicate: false, costUsd: 0.02 });
      const again = await processWhatsappWebhook(conn.db, p);
      expect(again).toMatchObject({ ok: true, duplicate: true, costUsd: 0 });
      const cost = await conn.db.select().from(costEntries).where(eq(costEntries.leadId, leadId));
      expect(cost).toHaveLength(1);
      expect(cost[0]).toMatchObject({ category: "whatsapp", contactChannel: "whatsapp", quantity: 1, usd: 0.02 });
      const msgs = await conn.db.select().from(messages).where(eq(messages.leadId, leadId));
      expect(msgs[0]).toMatchObject({ contactChannel: "whatsapp", status: "sent", recipient: "+573021110000" });
      const [lead] = await conn.db.select().from(leads).where(eq(leads.id, leadId));
      expect(lead!.status).toBe("contacted");
    });

    it("delivered and reply are logged", async () => {
      await processWhatsappWebhook(conn.db, whatsappWebhookSchema.parse({ event: "delivered", lead_id: leadId, message_id: "m1" }));
      await processWhatsappWebhook(conn.db, whatsappWebhookSchema.parse({ event: "reply", lead_id: leadId, text: "me interesa" }));
      const ev = await conn.db.select().from(events).where(eq(events.leadId, leadId));
      expect(ev.map((e) => e.type).sort()).toEqual(["delivered", "reply", "sent"]);
      const [m] = await conn.db.select().from(messages).where(eq(messages.leadId, leadId));
      expect(m!.status).toBe("delivered");
    });

    it("opt_out / STOP with no resolvable lead still suppresses the normalized phone", async () => {
      const r = await processWhatsappWebhook(conn.db, whatsappWebhookSchema.parse({ event: "opt_out", phone: "+57 601 555 0000" }));
      expect(r).toMatchObject({ ok: true, leadId: null, optedOut: true });
      const r2 = await processWhatsappWebhook(conn.db, whatsappWebhookSchema.parse({ event: "reply", phone: "+57 601 555 0001", text: "stop" }));
      expect(r2).toMatchObject({ ok: true, leadId: null, optedOut: true });
      const sup = await conn.db.select().from(suppression);
      expect(sup.map((s) => s.value)).toEqual(expect.arrayContaining(["+576015550000", "+576015550001"]));
    });

    it("unknown lead -> 404 result", async () => {
      const r = await processWhatsappWebhook(conn.db, whatsappWebhookSchema.parse({ event: "reply", phone: "+570000000000" }));
      expect(r).toMatchObject({ ok: false, status: 404 });
    });

    it("STOP reply suppresses the phone and opts the lead out", async () => {
      const r = await processWhatsappWebhook(conn.db, whatsappWebhookSchema.parse({ event: "reply", lead_id: leadId, text: "STOP" }));
      expect(r).toMatchObject({ ok: true, optedOut: true });
      const sup = await conn.db.select().from(suppression).where(eq(suppression.value, "+573021110000"));
      expect(sup).toHaveLength(1);
      const [lead] = await conn.db.select().from(leads).where(eq(leads.id, leadId));
      expect(lead!.status).toBe("opted_out");
      const ev = await conn.db.select().from(events).where(eq(events.leadId, leadId));
      expect(ev.filter((e) => e.type === "opt_out")).toHaveLength(1);
      // idempotent
      await processWhatsappWebhook(conn.db, whatsappWebhookSchema.parse({ event: "opt_out", lead_id: leadId }));
      const ev2 = await conn.db.select().from(events).where(eq(events.leadId, leadId));
      expect(ev2.filter((e) => e.type === "opt_out")).toHaveLength(1);
    });
  });
});
