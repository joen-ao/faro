import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { companies, companySources, contactPoints, costEntries, hunts, icpProfiles, leads, messages, suppression, workspaces } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { colombianMobile, selectWhatsappTargets, sendWhatsapp, waName } from "@/features/whatsapp/send";
import { pickTemplate, waTemplates } from "@/features/whatsapp/templates";
import { daptaFlowSender, mockWaSender } from "@/integrations/whatsapp/dapta-flow";
import { parseEnv } from "@/lib/env";
import { createTestDb } from "../helpers/test-db";

const SAT_10 = new Date("2026-10-24T15:00:00Z"); // sábado 10:00 Bogotá
const SUN_10 = new Date("2026-10-25T15:00:00Z");
const base = { DATABASE_URL: undefined, WHATSAPP_SEND_MODE: "dapta_flow", DAPTA_WA_FLOW_URL: "https://flow.test/hook" };
const envSim = parseEnv({ ...base, SEND_ENABLED: "false" } as never);
const envLive = parseEnv({ ...base, SEND_ENABLED: "true", WHATSAPP_DAILY_LIMIT: "2", DAPTA_WA_TEMPLATE_INDEPENDIENTE: "tpl-ind" } as never);

describe("F24 · pure helpers", () => {
  it("keeps Colombian mobiles only", () => {
    expect(colombianMobile("300 123 4567")).toBe("+573001234567");
    expect(colombianMobile("+57 310-555-0101")).toBe("+573105550101");
    expect(colombianMobile("+5760 1 3133760")).toBeNull();
    expect(colombianMobile("6013133760")).toBeNull();
  });
  it("greets a person by first name and a company by its short name", () => {
    expect(waName("DANA LIZETH SORIANO BERMUDEZ", true)).toBe("Dana");
    expect(waName("CLINICA DENTAL SONRISAS S.A.S.", false)).toBe("Clinica Dental Sonrisas");
    expect(waName("RIE SONRISA PERFECTA SIGLA: RIE SONRISA PERFECTA", false)).toBe("Rie Sonrisa Perfecta");
    expect(waName("BURBANO DENTAL STUDIO IPS", false)).toBe("Burbano Dental Studio");
  });
  it("uses the clinic template only with a REPS source, others only when approved", () => {
    const t = waTemplates({ DAPTA_WA_TEMPLATE_EMPRESA: undefined, DAPTA_WA_TEMPLATE_INDEPENDIENTE: "x" });
    expect(pickTemplate({ hasReps: true, independent: false }, t)?.key).toBe("faro_diagnostico_clinica");
    expect(pickTemplate({ hasReps: false, independent: false }, t)).toBeNull();
    expect(pickTemplate({ hasReps: false, independent: true }, t)?.key).toBe("faro_diagnostico_independiente");
  });
});

describe("F24 · Dapta flow sender", () => {
  it("posts the template variables and reads the provider id", async () => {
    let sent: unknown;
    const s = daptaFlowSender("https://flow.test/hook", async (_u, init) => {
      sent = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ success: true, data: { message_id: "wamid.1" } }), { status: 200 });
    });
    expect(await s.send({ toNumber: "+573001234567", templateId: "t", nombre: "Dana", slug: "abc", leadId: "l" })).toEqual({ ok: true, providerId: "wamid.1" });
    expect(sent).toEqual({ to_number: "+573001234567", template_id: "t", nombre: "Dana", slug: "abc", lead_id: "l" });
    const bad = daptaFlowSender("https://flow.test/hook", async () => new Response(JSON.stringify({ success: false, error: "template paused" }), { status: 200 }));
    expect((await bad.send({ toNumber: "+573001234567", templateId: "t", nombre: "x", slug: "y", leadId: "l" })).ok).toBe(false);
  });
});

describe("F24 · selection and sending", () => {
  let conn: Awaited<ReturnType<typeof createTestDb>>;
  let db: AppDb;
  let huntId: string;
  let n = 0;
  const mk = async (o: { name?: string; legal?: boolean; reps?: boolean; phone?: string | null; generic?: boolean }) => {
    n++;
    const [c] = await db.insert(companies).values({ name: o.name ?? `Clinica ${n} SAS`, normalizedName: `clinica ${n}`, city: "Bogota", isLegalEntity: o.legal ?? true }).returning();
    await db.insert(companySources).values({ companyId: c!.id, sourceChannel: o.reps ? "reps" : "rues", externalId: `e-${n}`, isMock: false });
    if (o.phone !== null) await db.insert(contactPoints).values({ companyId: c!.id, type: "phone", value: o.phone ?? `+57300000${String(n).padStart(4, "0")}`, isGeneric: o.generic ?? false, sourceChannel: o.reps ? "reps" : "rues" });
    const [l] = await db.insert(leads).values({ companyId: c!.id, huntId, status: "fit", primarySource: o.reps ? "reps" : "rues", fitScore: 80 - n, slug: `wa-${n}` }).returning();
    return { leadId: l!.id, companyId: c!.id };
  };

  beforeAll(async () => {
    conn = await createTestDb();
    db = conn.db as unknown as AppDb;
    const [ws] = await db.insert(workspaces).values({ name: "Mokub", country: "CO" }).returning();
    const [icp] = await db.insert(icpProfiles).values({ workspaceId: ws!.id, prompt: "dental", criteria: { sector: "odontologia", city: "Bogota" } }).returning();
    const [h] = await db.insert(hunts).values({ icpProfileId: icp!.id }).returning();
    huntId = h!.id;
  }, 60_000);
  afterAll(async () => {
    await conn.close();
  });

  it("selects mobiles, skips landlines, contacted, suppressed and unapproved templates", async () => {
    const clinic = await mk({ reps: true });
    const ind = await mk({ name: "DANA LIZETH SORIANO BERMUDEZ", legal: false, reps: false });
    await mk({ reps: true, phone: "+5760 1 3133760" });
    const done = await mk({ reps: true });
    await db.insert(messages).values({ leadId: done.leadId, contactChannel: "email", body: "x", status: "sent" });
    await mk({ reps: true, phone: "+573119998877" });
    await db.insert(suppression).values({ kind: "phone", value: "+573119998877", reason: "BAJA" });
    await mk({ reps: false });

    const sim = await selectWhatsappTargets(db, envSim, { huntId, now: SAT_10 });
    expect(sim.targets.map((t) => t.leadId)).toEqual([clinic.leadId]);
    expect(sim.skipped.map((s) => s.rule).sort()).toEqual(["already_contacted", "no_mobile", "no_template", "no_template", "suppressed"]);

    const live = await selectWhatsappTargets(db, envLive, { huntId, now: SAT_10 });
    expect(live.targets.map((t) => [t.leadId, t.template.key, t.nombre])).toEqual([
      [clinic.leadId, "faro_diagnostico_clinica", "Clinica 1"],
      [ind.leadId, "faro_diagnostico_independiente", "Dana"],
    ]);
  });

  it("simulates without SEND_ENABLED and never calls Dapta", async () => {
    const s = mockWaSender();
    const r = await sendWhatsapp(db, envSim, s, { huntId, now: SAT_10 });
    expect(r.simulated).toBe(1);
    expect(s.calls).toHaveLength(0);
  });

  it("is off with WHATSAPP_SEND_MODE=off and closed on Sunday", async () => {
    const off = parseEnv({ SEND_ENABLED: "true" } as never);
    expect((await sendWhatsapp(db, off, mockWaSender(), { huntId, now: SAT_10 })).error).toBe("whatsapp_send_disabled");
    expect((await sendWhatsapp(db, envLive, mockWaSender(), { huntId, now: SUN_10 })).error).toContain("Fuera de ventana");
  });

  it("sends for real once per company, records cost and respects the daily cap", async () => {
    await mk({ reps: true, generic: true });
    const s = mockWaSender();
    const r = await sendWhatsapp(db, envLive, s, { huntId, now: SAT_10 });
    expect(r.sent).toBe(2);
    expect(r.items.filter((i) => i.outcome === "skipped")).toHaveLength(1);
    expect(s.calls[0]).toMatchObject({ templateId: "4c0206b2-ad45-43e0-9d74-c27a3b1640df", nombre: "Clinica 1" });
    const costs = await db.select().from(costEntries).where(eq(costEntries.category, "whatsapp"));
    expect(costs).toHaveLength(2);
    const again = await sendWhatsapp(db, envLive, s, { huntId, now: SAT_10 });
    expect(again.sent).toBe(0);
    expect(s.calls).toHaveLength(2);
  });
});

describe("F24 · flow response nesting", () => {
  it("reads a failure inside result", async () => {
    const s = daptaFlowSender("https://flow.test/hook", async () => new Response(JSON.stringify({ lead_id: "l", result: { success: false, error: "number not on WhatsApp" } }), { status: 200 }));
    const r = await s.send({ toNumber: "+573001234567", templateId: "t", nombre: "x", slug: "y", leadId: "l" });
    expect(r).toMatchObject({ ok: false });
    expect(r.error).toContain("not on WhatsApp");
  });
});
