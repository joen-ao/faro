import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { companies, companySources, contactPoints, hunts, icpProfiles, leads, messages, workspaces } from "@/db/schema";
import { seedCostRates } from "@/db/seed";
import type { AppDb } from "@/db/types";
import { cronAuthorized } from "@/features/outreach/cron";
import { dailyCandidates, getDailyOutreach, runDailyOutreach, saveDailyOutreach } from "@/features/outreach/daily";
import { renderEmailHtml } from "@/features/outreach/email-html";
import { improvementBlocks } from "@/features/outreach/generate";
import { clearPreviewCache } from "@/features/outreach/service";
import { createMockAnthropic } from "@/integrations/anthropic";
import { createMockEmail } from "@/integrations/email";
import { parseEnv } from "@/lib/env";
import { createTestDb } from "../helpers/test-db";

const SAT_10 = new Date("2026-10-24T15:00:00Z");
const SUN_10 = new Date("2026-10-25T15:00:00Z");
const env = parseEnv({ NEXT_PUBLIC_APP_URL: "https://faro.test", EMAIL_FROM: "Faro <hola@faro.test>", EMAIL_REPLY_TO: "hola@faro.test", SENDER_ADDRESS: "Calle 1", SEND_ENABLED: "false" } as never);

describe("F25 · email with improvements", () => {
  it("renders findings and services as cards, escaped", () => {
    const blocks = improvementBlocks([
      { fact: "Su sitio no tiene un botón de WhatsApp", help: "Para que le escriban: Agente de WhatsApp. Resultado: respuestas 24/7." },
      { fact: "No encontramos un sitio web <propio>", help: null },
    ]);
    expect(blocks[0]).toBe("Lo que vimos:\n• Su sitio no tiene un botón de WhatsApp.\n• No encontramos un sitio web.");
    expect(blocks[1]).toContain("Cómo le ayudamos:\n• Para que le escriban");
    const html = renderEmailHtml(["Hola, equipo de X:", "Abrimos con algo.", ...blocks, "Si no desea recibir mensajes nuestros, darse de baja toma un clic: https://faro.test/baja/t"].join("\n\n"));
    expect(html).toContain("Lo que vimos en su presencia digital");
    expect(html).toContain("Cómo le ayudamos");
    expect(html).toContain("&#10003;");
    expect(html).not.toContain("<propio>");
  });
});

describe("F25 · cron auth", () => {
  it("needs the exact bearer secret", () => {
    const r = (h?: string) => new Request("https://faro.test/api/cron/daily-outreach", { headers: h ? { authorization: h } : {} });
    expect(cronAuthorized(r("Bearer s3cret"), "s3cret")).toBe(true);
    expect(cronAuthorized(r("Bearer nope"), "s3cret")).toBe(false);
    expect(cronAuthorized(r(), "s3cret")).toBe(false);
    expect(cronAuthorized(r("Bearer x"), undefined)).toBe(false);
  });
});

describe("F25 · daily run", () => {
  let conn: Awaited<ReturnType<typeof createTestDb>>;
  let db: AppDb;
  let huntId: string;
  let n = 0;
  const mk = async (o: { email?: string | null; legal?: boolean; score?: number } = {}) => {
    n++;
    const [c] = await db.insert(companies).values({ name: `Empresa ${n} SAS`, normalizedName: `empresa ${n}`, city: "Bogota", isLegalEntity: o.legal ?? true, website: `https://e${n}.example` }).returning();
    await db.insert(companySources).values({ companyId: c!.id, sourceChannel: "rues", externalId: `d-${n}`, isMock: false });
    if (o.email !== null) await db.insert(contactPoints).values({ companyId: c!.id, type: "email", value: o.email ?? `info@e${n}.example`, isGeneric: true });
    const [l] = await db.insert(leads).values({ companyId: c!.id, huntId, status: "fit", primarySource: "rues", fitScore: o.score ?? 70, slug: `d-${n}` }).returning();
    return l!.id;
  };

  beforeAll(async () => {
    conn = await createTestDb();
    db = conn.db as unknown as AppDb;
    await seedCostRates(db as never);
    const [ws] = await db.insert(workspaces).values({ name: "Mokub", country: "CO", offerDescription: "Sitios y agentes de WhatsApp" }).returning();
    const [icp] = await db.insert(icpProfiles).values({ workspaceId: ws!.id, prompt: "x", criteria: { sector: "contabilidad", city: "Bogota" } }).returning();
    const [h] = await db.insert(hunts).values({ icpProfileId: icp!.id }).returning();
    huntId = h!.id;
    clearPreviewCache();
  }, 60_000);
  afterAll(async () => {
    await conn.close();
  });

  it("is off by default and the cron does nothing", async () => {
    expect((await getDailyOutreach(db)).setting).toEqual({ enabled: false, emailsPerDay: 30, huntIds: null });
    const s = await runDailyOutreach(db, { ai: createMockAnthropic(), email: createMockEmail(), env }, { now: SAT_10, trigger: "cron" });
    expect(s.skipped).toBe("disabled");
  });

  it("picks best-scored companies with a generic mailbox, never contacted ones or independents", async () => {
    const top = await mk({ score: 95 });
    const mid = await mk({ score: 80 });
    await mk({ email: null, score: 99 });
    await mk({ legal: false, score: 98 });
    const done = await mk({ score: 97 });
    await db.insert(messages).values({ leadId: done, contactChannel: "email", body: "x", status: "sent", createdAt: new Date("2026-10-01T15:00:00Z") });
    expect(await dailyCandidates(db, { enabled: true, emailsPerDay: 5, huntIds: null }, 5)).toEqual([top, mid]);
  });

  it("sends at most emailsPerDay per Bogotá day and respects the window", async () => {
    await saveDailyOutreach(db, { enabled: true, emailsPerDay: 1, huntIds: null });
    const deps = { ai: createMockAnthropic(), email: createMockEmail(), env };
    expect((await runDailyOutreach(db, deps, { now: SUN_10 })).skipped).toBe("outside_window");
    const first = await runDailyOutreach(db, deps, { now: SAT_10 });
    expect(first).toMatchObject({ enqueued: 1, simulated: 1 });
    // Messages get the DB clock; pin them to the simulated day so the quota sees them.
    await db.update(messages).set({ createdAt: SAT_10 }).where(eq(messages.status, "simulated"));
    const second = await runDailyOutreach(db, deps, { now: new Date(SAT_10.getTime() + 3600_000) });
    expect(second.skipped).toBe("quota_reached");
    expect((await getDailyOutreach(db)).lastRun?.skipped).toBe("quota_reached");
  }, 30_000);
});
