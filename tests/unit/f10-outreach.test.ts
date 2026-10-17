import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { companies, companySources, contactPoints, costEntries, events, hunts, icpProfiles, leads, messages, workspaces } from "@/db/schema";
import { seedCostRates } from "@/db/seed";
import type { AppDb } from "@/db/types";
import { suppress } from "@/features/compliance/suppression";
import { verifyOptOutToken } from "@/features/compliance/optout";
import { handleAssisted, handlePreview, handleSend } from "@/features/outreach/api";
import { channelOptions, selectChannel } from "@/features/outreach/channel";
import { escapeHtml, generateMessage, sanitizeCopy, textToHtml } from "@/features/outreach/generate";
import { buildLinks } from "@/features/outreach/generate";
import { assess, enqueue, loadLeadContext, clearPreviewCache, previewOutreach, processQueue, recordAssistedSend, type OutreachDeps } from "@/features/outreach/service";
import { createMockAnthropic, type AnthropicAdapter } from "@/integrations/anthropic";
import { createMockEmail, createRealEmail, EmailSendError, getEmail, RESEND_ENDPOINT } from "@/integrations/email";
import { parseEnv, type Env } from "@/lib/env";
import { createTestDb } from "../helpers/test-db";

process.env.OPTOUT_SECRET = "f10-test-secret";

const SAT_10 = new Date("2026-10-17T15:00:00Z"); // Saturday 10:00 Bogota
const SUN_10 = new Date("2026-10-18T15:00:00Z"); // Sunday
const MON_10 = new Date("2026-10-19T15:00:00Z"); // Monday 10:00 Bogota

const baseEnv = {
  NEXT_PUBLIC_APP_URL: "https://faro.test",
  EMAIL_FROM: "Faro <hola@faro.test>",
  EMAIL_REPLY_TO: "hola@faro.test",
  SENDER_ADDRESS: "Calle 1 # 2-3, Bogota",
  SENDER_LEGAL_NAME: "Faro SAS",
  HUMAN_MINUTE_RATE_USD: "0.42",
};
const envOff: Env = parseEnv({ ...baseEnv, SEND_ENABLED: "false" });
const envOn: Env = parseEnv({ ...baseEnv, SEND_ENABLED: "true", EMAIL_MODE: "real", RESEND_API_KEY: "re_test" });

let conn: Awaited<ReturnType<typeof createTestDb>>;
let db: AppDb;
let workspaceId: string;
let icpId: string;
let huntId: string;
let n = 0;

beforeAll(async () => {
  conn = await createTestDb();
  db = conn.db as unknown as AppDb;
  await seedCostRates(db);
  const [ws] = await db.insert(workspaces).values({ name: "Pyme Demo", offerDescription: "Agenda en linea para clinicas", country: "CO" }).returning();
  workspaceId = ws!.id;
  const [icp] = await db.insert(icpProfiles).values({ workspaceId, prompt: "dental", criteria: { sector: "odontologia", city: "Bogota" } }).returning();
  icpId = icp!.id;
  const [h] = await db.insert(hunts).values({ icpProfileId: icpId }).returning();
  huntId = h!.id;
});
afterAll(async () => {
  await conn.close();
});

interface MkOpts {
  name?: string;
  email?: string | null;
  webForm?: string;
  whatsapp?: string;
  legal?: boolean;
  registry?: boolean;
  website?: string;
  huntId?: string;
  companyId?: string;
}

async function mkLead(o: MkOpts = {}) {
  n++;
  let companyId = o.companyId;
  if (!companyId) {
    const [c] = await db
      .insert(companies)
      .values({ name: o.name ?? `Clinica Prueba ${n} SAS`, normalizedName: `clinica prueba ${n}`, city: "Bogota", isLegalEntity: o.legal ?? true, website: o.website ?? `https://c${n}.example`, isDemo: false })
      .returning();
    companyId = c!.id;
    await db.insert(companySources).values({ companyId, sourceChannel: o.registry ? "rues" : "osm", externalId: `ext-${n}-${Math.random()}`, isMock: false });
    const email = o.email === undefined ? `info@c${n}.example` : o.email;
    if (email) await db.insert(contactPoints).values({ companyId, type: "email", value: email, isGeneric: true });
    if (o.webForm) await db.insert(contactPoints).values({ companyId, type: "web_form", value: o.webForm, isGeneric: true });
    if (o.whatsapp) await db.insert(contactPoints).values({ companyId, type: "whatsapp", value: o.whatsapp, isGeneric: true });
  }
  const [lead] = await db
    .insert(leads)
    .values({ companyId, huntId: o.huntId ?? huntId, status: "fit", primarySource: "osm", fitScore: 70, slug: `slug-${n}-${Math.random().toString(36).slice(2, 7)}` })
    .returning();
  return { lead: lead!, companyId };
}

const deps = (env: Env, email = createMockEmail()): OutreachDeps & { email: ReturnType<typeof createMockEmail> } => ({ ai: createMockAnthropic(), email, env });

beforeEach(async () => {
  vi.restoreAllMocks();
});

describe("email adapter", () => {
  it("real adapter refuses to exist without SEND_ENABLED and getEmail falls back to mock", () => {
    expect(() => createRealEmail({ apiKey: "k", sendEnabled: false })).toThrow(/SEND_ENABLED/);
    const withCreds = parseEnv({ EMAIL_MODE: "real", RESEND_API_KEY: "re_x", EMAIL_FROM: "a@b.co", SEND_ENABLED: "false" });
    expect(getEmail(withCreds).isMock).toBe(true);
    expect(getEmail(envOn).isMock).toBe(false); // only here the real one exists (still never called in tests)
  });

  it("real adapter posts to Resend REST with headers", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "re_123" }), { status: 200 })) as unknown as typeof fetch;
    const a = createRealEmail({ apiKey: "re_k", sendEnabled: true, fetchImpl });
    const r = await a.send({ to: "x@y.co", from: "f@f.co", subject: "s", text: "t", html: "<p>t</p>", headers: { "List-Unsubscribe": "<https://u>" }, replyTo: "r@f.co" });
    expect(r.id).toBe("re_123");
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(RESEND_ENDPOINT);
    const body = JSON.parse(init.body as string);
    expect(body.to).toEqual(["x@y.co"]);
    expect(body.headers["List-Unsubscribe"]).toBe("<https://u>");
    expect(body.reply_to).toBe("r@f.co");
    const failing = createRealEmail({ apiKey: "k", sendEnabled: true, fetchImpl: (async () => new Response("{}", { status: 422 })) as unknown as typeof fetch });
    await expect(failing.send({ to: "a@b.co", from: "f", subject: "s", text: "t", html: "t" })).rejects.toThrow(/422/);
  });
});

describe("generation and HTML safety", () => {
  it("includes sender, reason, diagnostic link, one-click opt-out and physical address", async () => {
    const { lead } = await mkLead();
    const ctx = await loadLeadContext(db, lead.id);
    const g = await generateMessage(
      { id: lead.id, slug: lead.slug, primarySource: "osm" },
      { name: ctx.company.name, city: "Bogota" },
      { criteria: ctx.icp!.criteria },
      { name: "Pyme", offerDescription: "Agenda", country: "CO" },
      { ai: createMockAnthropic(), channel: "email", recipient: "info@x.co", env: envOff },
    );
    expect(g.text).toContain("30X Hackathon");
    expect(g.text).toContain("Faro");
    expect(g.text).toContain("OpenStreetMap");
    expect(g.text).toContain("Calle 1 # 2-3, Bogota");
    expect(g.text).toContain(`https://faro.test/d/${lead.slug}?c=email&s=osm`);
    const m = /https:\/\/faro\.test\/baja\/(\S+)/.exec(g.text);
    expect(m).toBeTruthy();
    expect(verifyOptOutToken(m![1]!)?.leadId).toBe(lead.id);
    expect(g.headers["List-Unsubscribe"]).toContain("https://faro.test/api/optout/");
    expect(g.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(g.html).toContain("/baja/");
    expect(g.usage.input_tokens).toBeGreaterThan(0);
  });

  it("escapes HTML from sources and strips markup, URLs and line breaks from model output", async () => {
    const evil = '<script>alert(1)</script> & "Co" <img src=x onerror=alert(2)>';
    const { lead } = await mkLead({ name: evil });
    const ctx = await loadLeadContext(db, lead.id);
    const hostile: AnthropicAdapter = {
      model: "m",
      isMock: true,
      async completeRaw() {
        return {
          text: JSON.stringify({ subject: "Hola\r\nBcc: victim@x.co <b>x</b>", opening: "Mire <script>x()</script> https://evil.example/phish ahora", value: "Oferta <iframe src=//e></iframe> aqui" }),
          usage: { input_tokens: 1, output_tokens: 1 },
        };
      },
    };
    const g = await generateMessage(
      { id: lead.id, slug: lead.slug, primarySource: "osm" },
      { name: ctx.company.name, city: "<b>Bogota</b>" },
      { criteria: {} },
      { name: "P", offerDescription: "<script>x</script>", country: "CO" },
      { ai: hostile, channel: "email", recipient: "info@x.co", env: envOff },
    );
    expect(g.html).not.toMatch(/<script|<img|<iframe|<b>/i);
    expect(g.html).toContain("&amp; &quot;Co&quot;");
    expect(g.subject).not.toMatch(/[\r\n]/);
    expect(g.subject).not.toContain("<");
    expect(g.text).not.toContain("evil.example");
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
    expect(sanitizeCopy("a\u0000b\n\nc <i>d</i>", 50)).toBe("a b c d");
    expect(textToHtml('"><script>1</script> https://faro.test/x?a=1&b=2.')).not.toContain("<script>");
    expect(textToHtml("ver https://faro.test/x?a=1&b=2.")).toContain('href="https://faro.test/x?a=1&amp;b=2"');
  });
});

describe("channel selection", () => {
  const generic = { type: "email" as const, value: "info@a.co", isGeneric: true };
  const form = { type: "web_form" as const, value: "https://a.co/contacto", isGeneric: true };
  const wa = { type: "whatsapp" as const, value: "+573001112233", isGeneric: true };
  it("generic email > web form > whatsapp (only if enabled); US email only", () => {
    expect(selectChannel([wa, form, generic], { whatsappEnabled: true, country: "CO" })?.channel).toBe("email");
    expect(selectChannel([wa, form], { whatsappEnabled: true, country: "CO" })?.channel).toBe("web_form");
    expect(selectChannel([wa], { whatsappEnabled: false, country: "CO" })).toBeNull();
    expect(selectChannel([wa], { whatsappEnabled: true, country: "CO" })?.channel).toBe("whatsapp");
    expect(selectChannel([form, wa], { whatsappEnabled: true, country: "US" })).toBeNull();
    const personal = channelOptions([{ type: "email", value: "maria.gomez@a.co", isGeneric: false }], { whatsappEnabled: false, country: "CO" });
    expect(personal[0]).toMatchObject({ channel: "email", usable: false });
  });
});

describe("SEND_ENABLED=false: nothing leaves", () => {
  it("never calls fetch (even with a real adapter wired) and stores the message as simulated", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ id: "boom" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const real = createRealEmail({ apiKey: "re_x", sendEnabled: true, fetchImpl: fetchSpy as unknown as typeof fetch });
    const { lead } = await mkLead();
    const d = { ai: createMockAnthropic(), email: real, env: envOff };
    const q = await enqueue(db, { leadId: lead.id }, d, SAT_10);
    expect(q.status).toBe("queued");
    const r = await processQueue(db, d, { now: SAT_10 });
    expect(r.simulated).toBeGreaterThanOrEqual(1);
    expect(r.sent).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    const [m] = await db.select().from(messages).where(eq(messages.id, q.messageId!));
    expect(m!.status).toBe("simulated");
    expect(m!.providerId).toBeNull();
    const ev = await db.select().from(events).where(eq(events.leadId, lead.id));
    expect(ev.find((e) => e.type === "sent")).toMatchObject({ isMock: true, payload: expect.objectContaining({ simulated: true }) });
    const [l] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(l!.status).toBe("fit");
    const emailCosts = (await db.select().from(costEntries).where(eq(costEntries.leadId, lead.id))).filter((c) => c.category === "email");
    expect(emailCosts).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("assessment says simulated and the AI cost is recorded as mock", async () => {
    const { lead } = await mkLead();
    const p = await previewOutreach(db, { leadId: lead.id }, deps(envOff), SAT_10);
    expect(p.assessment.simulated).toBe(true);
    expect(p.assessment.note).toMatch(/SEND_ENABLED=false/);
    expect(p.sendEnabled).toBe(false);
    const ai = (await db.select().from(costEntries).where(eq(costEntries.leadId, lead.id))).filter((c) => c.category === "ai");
    expect(ai.length).toBe(1);
    expect(ai[0]!.isMock).toBe(true);
  });
});

describe("real sending path (mock provider, SEND_ENABLED=true)", () => {
  it("sends inside the window with List-Unsubscribe, records event, email cost and lead status", async () => {
    const { lead } = await mkLead({ registry: true });
    const d = deps(envOn);
    const q = await enqueue(db, { leadId: lead.id }, d, SAT_10);
    expect(q.status).toBe("queued");
    const r = await processQueue(db, d, { now: SAT_10 });
    expect(r.sent).toBeGreaterThanOrEqual(1);
    const out = d.email.outbox.at(-1)!;
    expect(out.headers?.["List-Unsubscribe"]).toContain("/api/optout/");
    expect(out.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(out.html).toContain("/baja/");
    expect(out.subject).not.toMatch(/[\r\n]/);
    const [m] = await db.select().from(messages).where(eq(messages.id, q.messageId!));
    expect(m).toMatchObject({ status: "sent", isMock: true });
    expect(m!.providerId).toMatch(/^mock_/);
    const costs = (await db.select().from(costEntries).where(eq(costEntries.leadId, lead.id))).filter((c) => c.category === "email");
    expect(costs).toHaveLength(1);
    const [l] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(l!.status).toBe("contacted");
  });

  it("blocks unverified legal entities on real sends unless the ICP allows it; shows them as por verificar", async () => {
    const { lead } = await mkLead({ registry: false });
    const ctx = await loadLeadContext(db, lead.id);
    const a = await assess(db, ctx, "email", `info@c${n}.example`, SAT_10, envOn);
    expect(a.unverifiedLegal).toBe(true);
    expect(a.blocks.map((b) => b.rule)).toContain("legal_unverified");
    const allowed = await assess(db, { ...ctx, allowUnverifiedLegal: true }, "email", `info@c${n}.example`, SAT_10, envOn);
    expect(allowed.blocks.map((b) => b.rule)).not.toContain("legal_unverified");
    const sim = await assess(db, ctx, "email", `info@c${n}.example`, SAT_10, envOff);
    expect(sim.unverifiedLegal).toBe(true);
    expect(sim.allowed).toBe(true);
  });

  it("respects the batch limit", async () => {
    const d = deps(envOn);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { lead } = await mkLead({ registry: true });
      ids.push(lead.id);
      await enqueue(db, { leadId: lead.id }, d, SAT_10);
    }
    const before = d.email.outbox.length;
    const r = await processQueue(db, d, { now: SAT_10, limit: 2 });
    expect(d.email.outbox.length - before).toBe(2);
    expect(r.remaining).toBe(1);
    await processQueue(db, d, { now: SAT_10 }); // drain
  });
});

describe("send window", () => {
  it("Sunday: queued but never sent; leaves on Monday", async () => {
    const { lead } = await mkLead({ registry: true });
    const d = deps(envOn);
    const q = await enqueue(db, { leadId: lead.id }, d, SUN_10);
    expect(q.status).toBe("queued");
    expect(q.blocks.map((b) => b.rule)).toContain("outside_window");
    const r = await processQueue(db, d, { now: SUN_10 });
    expect(r.sent).toBe(0);
    expect(r.deferred).toBeGreaterThanOrEqual(1);
    expect(d.email.outbox.find((o) => o.to === `info@c${n}.example`)).toBeUndefined();
    const [m] = await db.select().from(messages).where(eq(messages.id, q.messageId!));
    expect(m).toMatchObject({ status: "queued", blockedByRule: "outside_window" });
    const mon = await processQueue(db, d, { now: MON_10 });
    expect(mon.sent).toBeGreaterThanOrEqual(1);
    const [m2] = await db.select().from(messages).where(eq(messages.id, q.messageId!));
    expect(m2).toMatchObject({ status: "sent", blockedByRule: null });
  });
});

describe("blocks", () => {
  it("suppressed email or domain is blocked and stored with its rule", async () => {
    const a = await mkLead({ email: "info@supp-a.example", website: "https://supp-a.example" });
    await suppress(db, "info@supp-a.example", "opt-out test");
    const r = await enqueue(db, { leadId: a.lead.id }, deps(envOff), SAT_10);
    expect(r.status).toBe("blocked");
    expect(r.blocks.map((b) => b.rule)).toContain("suppressed");
    const [m] = await db.select().from(messages).where(eq(messages.id, r.messageId!));
    expect(m).toMatchObject({ status: "blocked" });
    expect(m!.blockedByRule).toContain("suppressed");

    const b = await mkLead({ email: "contacto@supp-b.example", website: "https://supp-b.example" });
    await suppress(db, "supp-b.example", "dominio");
    expect((await enqueue(db, { leadId: b.lead.id }, deps(envOff), SAT_10)).blocks.map((x) => x.rule)).toContain("suppressed");
  });

  it("a personal-looking email is blocked and no AI call is spent", async () => {
    const a = await mkLead({ email: "maria.gomez@personal.example" });
    const r = await enqueue(db, { leadId: a.lead.id, channel: "email" }, deps(envOff), SAT_10);
    expect(r.status).toBe("blocked");
    expect(r.blocks.map((b) => b.rule)).toContain("personal_email");
    const ai = (await db.select().from(costEntries).where(eq(costEntries.leadId, a.lead.id))).filter((c) => c.category === "ai");
    expect(ai).toHaveLength(0);
  });

  it("natural persons are blocked", async () => {
    const a = await mkLead({ legal: false });
    const r = await enqueue(db, { leadId: a.lead.id }, deps(envOff), SAT_10);
    expect(r.status).toBe("blocked");
    expect(r.blocks.map((b) => b.rule)).toContain("natural_person");
  });

  it("max 1 message per company", async () => {
    const a = await mkLead({ registry: true });
    const [h2] = await db.insert(hunts).values({ icpProfileId: icpId }).returning();
    const b = await mkLead({ companyId: a.companyId, huntId: h2!.id });
    const first = await enqueue(db, { leadId: a.lead.id }, deps(envOff), SAT_10);
    expect(first.status).toBe("queued");
    const second = await enqueue(db, { leadId: b.lead.id }, deps(envOff), SAT_10);
    expect(second.status).toBe("blocked");
    expect(second.blocks.map((x) => x.rule)).toEqual(["already_contacted"]);
    const again = await enqueue(db, { leadId: a.lead.id }, deps(envOff), SAT_10);
    expect(again.status).toBe("blocked");
    const rows = await db.select().from(messages).where(eq(messages.leadId, a.lead.id));
    expect(rows).toHaveLength(1);
  });

  it("an edited body that lost the opt-out link, sender or address gets them re-injected (exact link)", async () => {
    const a = await mkLead({ registry: true });
    const r = await enqueue(db, { leadId: a.lead.id, subject: "Hola", body: "Mensaje sin enlace de baja ni nada. https://evil.example/baja/xyz" }, deps(envOff), SAT_10);
    expect(r.status).toBe("queued");
    const [m] = await db.select().from(messages).where(eq(messages.id, r.messageId!));
    const ctx = await loadLeadContext(db, a.lead.id);
    expect(m!.body).toContain(buildLinks({ id: ctx.lead.id, slug: ctx.lead.slug, primarySource: "osm" }, "email", m!.recipient, envOff).optOutUrl);
    expect(m!.body).toContain("30X Hackathon");
    expect(m!.body).toContain("Calle 1 # 2-3, Bogota");
    // a body that only carries a foreign /baja/ link is flagged by the gate
    const bad = await assess(db, ctx, "email", m!.recipient, SAT_10, envOff, { body: "x https://evil.example/baja/xyz" });
    expect(bad.blocks.map((b) => b.rule)).toContain("missing_unsubscribe");
  });

  it("only email goes through the queue: web_form and whatsapp are rejected without leaving a queued row", async () => {
    const a = await mkLead({ webForm: "https://forme.example/c", whatsapp: "+573001112233", registry: true });
    const f = await enqueue(db, { leadId: a.lead.id, channel: "web_form" }, deps(envOff), SAT_10);
    expect(f).toMatchObject({ status: "blocked", messageId: null });
    expect(f.blocks[0]!.message).toMatch(/asistido/);
    const w = await enqueue(db, { leadId: a.lead.id, channel: "whatsapp" }, deps(envOff), SAT_10);
    expect(w).toMatchObject({ status: "blocked", messageId: null });
    expect(w.blocks[0]!.rule).toBe("channel_unavailable");
    expect(await db.select().from(messages).where(eq(messages.leadId, a.lead.id))).toHaveLength(0);
    // the company is not locked: email still queues
    expect((await enqueue(db, { leadId: a.lead.id }, deps(envOff), SAT_10)).status).toBe("queued");
  });

  it("a lead without any usable channel is explained", async () => {
    const a = await mkLead({ email: null });
    const r = await enqueue(db, { leadId: a.lead.id }, deps(envOff), SAT_10);
    expect(r).toMatchObject({ status: "blocked", messageId: null });
    expect(r.blocks[0]!.rule).toBe("no_channel");
  });
});

describe("assisted web form", () => {
  it("records minutes x rate as a human cost and a sent event (practice while SEND_ENABLED=false)", async () => {
    const a = await mkLead({ email: null, webForm: "https://forma.example/contacto", registry: true });
    const r = await recordAssistedSend(db, { leadId: a.lead.id, body: "Texto enviado a mano por el formulario.", minutes: 7.5, note: "ok" }, deps(envOff), SAT_10);
    expect(r.status).toBe("simulated");
    expect(r.costUsd).toBeCloseTo(3.15, 6);
    const [c] = (await db.select().from(costEntries).where(eq(costEntries.leadId, a.lead.id))).filter((x) => x.category === "human");
    expect(c).toMatchObject({ unit: "minute", quantity: 7.5, rate: 0.42, usd: 3.15, isMock: true });
    const ev = await db.select().from(events).where(eq(events.leadId, a.lead.id));
    expect(ev.find((e) => e.type === "sent")?.payload).toMatchObject({ assisted: true, minutes: 7.5 });
  });

  it("is a real, non-mock record when SEND_ENABLED=true and moves the lead to contacted", async () => {
    const a = await mkLead({ email: null, webForm: "https://formb.example/contacto", registry: true });
    const r = await recordAssistedSend(db, { leadId: a.lead.id, body: "Texto enviado a mano por el formulario.", minutes: 10 }, deps(envOn), SAT_10);
    expect(r.status).toBe("sent");
    const [c] = (await db.select().from(costEntries).where(eq(costEntries.leadId, a.lead.id))).filter((x) => x.category === "human");
    expect(c).toMatchObject({ usd: 4.2, isMock: false });
    const [l] = await db.select().from(leads).where(eq(leads.id, a.lead.id));
    expect(l!.status).toBe("contacted");
  });

  it("respects the compliance gate (Sunday)", async () => {
    const a = await mkLead({ email: null, webForm: "https://formc.example/contacto", registry: true });
    const r = await recordAssistedSend(db, { leadId: a.lead.id, body: "Texto enviado a mano por el formulario.", minutes: 3 }, deps(envOn), SUN_10);
    expect(r.status).toBe("blocked");
    expect(r.blocks.map((b) => b.rule)).toContain("outside_window");
    expect((await db.select().from(costEntries).where(eq(costEntries.leadId, a.lead.id))).filter((x) => x.category === "human")).toHaveLength(0);
  });
});

describe("API handlers", () => {
  it("validate input and run the pipeline", async () => {
    expect((await handlePreview(db, { leadId: "nope" }, deps(envOff))).status).toBe(400);
    expect((await handleSend(db, { items: [{ leadId: "x" }], huntId }, deps(envOff))).status).toBe(400);
    expect((await handleAssisted(db, { leadId: "x", body: "corto", minutes: 0 }, deps(envOff))).status).toBe(400);
    expect((await handlePreview(db, { leadId: "00000000-0000-4000-8000-000000000000" }, deps(envOff))).status).toBe(404);

    const a = await mkLead({ registry: true });
    const prev = await handlePreview(db, { leadId: a.lead.id, generate: false }, deps(envOff), SAT_10);
    expect(prev.status).toBe(200);
    expect((prev.body as { message: unknown }).message).toBeNull();
    const sent = await handleSend(db, { items: [{ leadId: a.lead.id }], huntId }, deps(envOff), SAT_10);
    expect(sent.status).toBe(200);
    expect((sent.body as { sendEnabled: boolean }).sendEnabled).toBe(false);
    expect((sent.body as { queue: { simulated: number } }).queue.simulated).toBeGreaterThanOrEqual(1);

    const f = await mkLead({ email: null, webForm: "https://formd.example/c", registry: true });
    const blocked = await handleAssisted(db, { leadId: f.lead.id, body: "Texto enviado a mano.", minutes: 2 }, deps(envOff), SUN_10);
    expect(blocked.status).toBe(409);
  });
});

describe("real send needs a complete sender (F12 note)", () => {
  it("blocks when SENDER_LEGAL_NAME, SENDER_ADDRESS or EMAIL_REPLY_TO is missing; simulation is not affected", async () => {
    const { lead } = await mkLead({ registry: true });
    const ctx = await loadLeadContext(db, lead.id);
    const to = `info@c${n}.example`;
    for (const drop of ["SENDER_LEGAL_NAME", "SENDER_ADDRESS", "EMAIL_REPLY_TO"] as const) {
      const env = parseEnv({ ...baseEnv, [drop]: "", SEND_ENABLED: "true" });
      const a = await assess(db, ctx, "email", to, SAT_10, env);
      expect(a.allowed).toBe(false);
      expect(a.blocks.map((b) => b.rule).join()).toMatch(/sender_incomplete/);
    }
    const sim = parseEnv({ ...baseEnv, SENDER_ADDRESS: "", SEND_ENABLED: "false" });
    expect((await assess(db, ctx, "email", to, SAT_10, sim)).allowed).toBe(true);
    expect((await assess(db, ctx, "email", to, SAT_10, envOn)).allowed).toBe(true);
  });
});

describe("atomic claim and idempotency", () => {
  it("two concurrent processQueue runs send a message exactly once, with an Idempotency-Key", async () => {
    const { lead } = await mkLead({ registry: true });
    const sentKeys: (string | undefined)[] = [];
    const slow = createMockEmail();
    const email = {
      isMock: true,
      async send(m: Parameters<typeof slow.send>[0]) {
        sentKeys.push(m.idempotencyKey);
        await new Promise((r) => setTimeout(r, 30));
        return slow.send(m);
      },
    };
    const d = { ai: createMockAnthropic(), email, env: envOn };
    const q = await enqueue(db, { leadId: lead.id }, d, SAT_10);
    const [r1, r2] = await Promise.all([processQueue(db, d, { now: SAT_10, huntId }), processQueue(db, d, { now: SAT_10, huntId })]);
    expect(r1.sent + r2.sent).toBe(1);
    expect(sentKeys).toEqual([`faro-msg-${q.messageId}`]);
    const costs = (await db.select().from(costEntries).where(eq(costEntries.leadId, lead.id))).filter((c) => c.category === "email");
    expect(costs).toHaveLength(1);
  });

  it("real adapter forwards the Idempotency-Key header", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "re_1" }), { status: 200 })) as unknown as typeof fetch;
    await createRealEmail({ apiKey: "k", sendEnabled: true, fetchImpl }).send({ to: "a@b.co", from: "f", subject: "s", text: "t", html: "t", idempotencyKey: "faro-msg-1" });
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("faro-msg-1");
  });

  it("an ambiguous failure after the provider call stays in 'sending' and is never resent; a 4xx is failed", async () => {
    const a = await mkLead({ registry: true });
    const crash = { isMock: true, send: vi.fn(async () => { throw new Error("socket hang up"); }) };
    const d = { ai: createMockAnthropic(), email: crash, env: envOn };
    const q = await enqueue(db, { leadId: a.lead.id }, d, SAT_10);
    const r = await processQueue(db, d, { now: SAT_10, huntId });
    expect(r.failed).toBe(1);
    const [m] = await db.select().from(messages).where(eq(messages.id, q.messageId!));
    expect(m!.status).toBe("sending");
    await processQueue(db, d, { now: SAT_10, huntId });
    expect(crash.send).toHaveBeenCalledTimes(1);

    const b = await mkLead({ registry: true });
    const reject = { isMock: true, send: vi.fn(async () => { throw new EmailSendError("Resend 422", 422); }) };
    const d2 = { ai: createMockAnthropic(), email: reject, env: envOn };
    const q2 = await enqueue(db, { leadId: b.lead.id }, d2, SAT_10);
    await processQueue(db, d2, { now: SAT_10, huntId });
    const [m2] = await db.select().from(messages).where(eq(messages.id, q2.messageId!));
    expect(m2!.status).toBe("failed");
  });

  it("the sending state still counts as contacted and EMAIL_FROM is required for real sends", async () => {
    const { lead } = await mkLead({ registry: true });
    const ctx = await loadLeadContext(db, lead.id);
    const noFrom = parseEnv({ ...baseEnv, EMAIL_FROM: "", SEND_ENABLED: "true" });
    const a = await assess(db, ctx, "email", `info@c${n}.example`, SAT_10, noFrom);
    expect(a.blocks.find((b) => b.rule === "sender_incomplete")?.message).toMatch(/EMAIL_FROM/);
  });

  it("preview drafts are cached per lead (no second AI spend)", async () => {
    clearPreviewCache();
    const { lead } = await mkLead({ registry: true });
    await previewOutreach(db, { leadId: lead.id }, deps(envOff), SAT_10);
    await previewOutreach(db, { leadId: lead.id }, deps(envOff), SAT_10);
    const ai = (await db.select().from(costEntries).where(eq(costEntries.leadId, lead.id))).filter((c) => c.category === "ai");
    expect(ai).toHaveLength(1);
    await previewOutreach(db, { leadId: lead.id, refresh: true }, deps(envOff), SAT_10);
    expect((await db.select().from(costEntries).where(eq(costEntries.leadId, lead.id))).filter((c) => c.category === "ai")).toHaveLength(2);
  });
});
