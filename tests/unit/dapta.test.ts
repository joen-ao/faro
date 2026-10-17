import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { companies, contactPoints, costEntries, events, leads, qualifications, suppression } from "@/db/schema";
import { parseEnv } from "@/lib/env";
import { requireAppAccess } from "@/lib/app-access";
import { buildCsv, csvCell } from "@/integrations/dapta/csv";
import { assertSafePushUrl, assertSafePushUrlResolved } from "@/integrations/dapta/ssrf";
import { getDaptaAdapter } from "@/integrations/dapta";
import { createRealDaptaAdapter } from "@/integrations/dapta/real";
import { selectLeadsForDapta } from "@/integrations/dapta/leads";
import { fallbackQualify, recordFallbackQualification } from "@/integrations/dapta/fallback";
import { daptaWebhookSchema, processDaptaWebhook, verifyWebhookSecret } from "@/integrations/dapta/webhook";
import type { DaptaLeadRecord } from "@/integrations/dapta/types";
import { createTestDb } from "../helpers/test-db";

const rec = (o: Partial<DaptaLeadRecord> = {}): DaptaLeadRecord => ({
  leadId: "l1", slug: "s1", company: "Clinica Uno", phone: "+573001112233", email: "info@uno.co", city: "Bogota",
  source: "osm", diagnosticUrl: "https://faro.test/d/s1", notes: "", isDemo: false, ...o,
});

const req = (headers: Record<string, string>) => new Request("http://x/api", { method: "POST", headers });

describe("webhook secret", () => {
  const env = { DAPTA_WEBHOOK_SECRET: "s3cret" };
  it("accepts x-dapta-secret and Bearer", () => {
    expect(verifyWebhookSecret(req({ "x-dapta-secret": "s3cret" }), env)).toBe(true);
    expect(verifyWebhookSecret(req({ authorization: "Bearer s3cret" }), env)).toBe(true);
  });
  it("rejects wrong, missing, and unconfigured", () => {
    expect(verifyWebhookSecret(req({ "x-dapta-secret": "nope" }), env)).toBe(false);
    expect(verifyWebhookSecret(req({}), env)).toBe(false);
    expect(verifyWebhookSecret(req({ "x-dapta-secret": "" }), { DAPTA_WEBHOOK_SECRET: "" })).toBe(false);
    expect(verifyWebhookSecret(req({ "x-dapta-secret": "x" }), { NODE_ENV: "production" })).toBe(false);
  });
});

describe("webhook processing", () => {
  let conn: Awaited<ReturnType<typeof createTestDb>>;
  let leadId: string;
  const env = parseEnv({});
  beforeAll(async () => {
    conn = await createTestDb();
    const [c] = await conn.db.insert(companies).values({ name: "Clinica Uno", normalizedName: "clinica uno", city: "Bogota", website: "https://uno.co" }).returning();
    await conn.db.insert(contactPoints).values([
      { companyId: c!.id, type: "phone", value: "+573001112233", sourceChannel: "osm" },
      { companyId: c!.id, type: "email", value: "info@uno.co", isGeneric: true },
    ]);
    const [l] = await conn.db.insert(leads).values({ companyId: c!.id, primarySource: "osm", slug: "clinica-uno-1a2b", fitScore: 80 }).returning();
    leadId = l!.id;
  });
  afterAll(() => conn.close());

  const payload = { conversation_id: "conv_1", slug: "clinica-uno-1a2b", qualified: true, score: 82, bant: { budget: "300" }, summary: "ok", ai_replies: 3 };

  it("creates qualification, events and the 0.12 USD cost; is idempotent", async () => {
    const r = await processDaptaWebhook(conn.db, daptaWebhookSchema.parse(payload), env);
    expect(r).toMatchObject({ ok: true, duplicate: false, qualified: true, costUsd: 0.12, credits: 120 });
    const q = await conn.db.select().from(qualifications).where(eq(qualifications.leadId, leadId));
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ origin: "dapta", qualified: true, isMock: false, creditsUsed: 120, conversationId: "conv_1" });
    const ev = (await conn.db.select().from(events).where(eq(events.leadId, leadId))).map((e) => e.type).sort();
    expect(ev).toEqual(["qualified", "widget_chat"]);
    const [lead] = await conn.db.select().from(leads).where(eq(leads.id, leadId));
    expect(lead!.status).toBe("qualified");
    const cost = await conn.db.select().from(costEntries).where(eq(costEntries.leadId, leadId));
    expect(cost).toHaveLength(1);
    expect(cost[0]).toMatchObject({ category: "dapta", quantity: 3, usd: 0.12, isMock: false, contactChannel: "dapta_widget" });

    const again = await processDaptaWebhook(conn.db, daptaWebhookSchema.parse(payload), env);
    expect(again).toMatchObject({ ok: true, duplicate: true });
    expect(await conn.db.select().from(qualifications).where(eq(qualifications.leadId, leadId))).toHaveLength(1);
    expect(await conn.db.select().from(costEntries).where(eq(costEntries.leadId, leadId))).toHaveLength(1);
  });

  it("matches by phone/email, uses credits_used and score threshold", async () => {
    const r = await processDaptaWebhook(conn.db, daptaWebhookSchema.parse({ conversation_id: "conv_2", phone: "+57 300 111 2233", score: 30, credits_used: "200" }), env);
    expect(r).toMatchObject({ ok: true, qualified: false, costUsd: 0.2 });
    const e = await processDaptaWebhook(conn.db, daptaWebhookSchema.parse({ conversation_id: "conv_3", email: "INFO@uno.co", qualified: "true" }), env);
    expect(e).toMatchObject({ ok: true, qualified: true, costUsd: 0 });
    expect(await conn.db.select().from(costEntries).where(eq(costEntries.leadId, leadId))).toHaveLength(2);
  });

  it("matches by lead_id, reports unknown leads, validates payloads", async () => {
    expect(await processDaptaWebhook(conn.db, daptaWebhookSchema.parse({ conversation_id: "c4", lead_id: leadId, qualified: false }), env)).toMatchObject({ ok: true, qualified: false });
    expect(await processDaptaWebhook(conn.db, daptaWebhookSchema.parse({ conversation_id: "c5", slug: "nope", qualified: true }), env)).toMatchObject({ ok: false, status: 404 });
    expect(daptaWebhookSchema.safeParse({ conversation_id: "c6", qualified: true }).success).toBe(false);
    expect(daptaWebhookSchema.safeParse({ conversation_id: "c6", slug: "a" }).success).toBe(false);
  });

  it("uses credits_used when ai_replies is 0", async () => {
    const r = await processDaptaWebhook(conn.db, daptaWebhookSchema.parse({ conversation_id: "c8", slug: "clinica-uno-1a2b", qualified: true, ai_replies: 0, credits_used: 50 }), env);
    expect(r).toMatchObject({ costUsd: 0.05, credits: 50 });
  });
  it("does not resurrect an opted-out lead", async () => {
    await conn.db.update(leads).set({ status: "opted_out" }).where(eq(leads.id, leadId));
    await processDaptaWebhook(conn.db, daptaWebhookSchema.parse({ conversation_id: "c7", slug: "clinica-uno-1a2b", qualified: true }), env);
    const [lead] = await conn.db.select().from(leads).where(eq(leads.id, leadId));
    expect(lead!.status).toBe("opted_out");
  });

  it("fallback is always origin fallback + is_mock", async () => {
    expect(fallbackQualify({ fitScore: 90, hasGenericContact: true, hasWebsite: true })).toEqual({ qualified: true, score: 92 });
    expect(fallbackQualify({ fitScore: null, hasGenericContact: false, hasWebsite: false }).qualified).toBe(false);
    expect(await recordFallbackQualification(conn.db, "00000000-0000-0000-0000-000000000000", { fitScore: 1, hasGenericContact: false, hasWebsite: false })).toBeUndefined();
    await recordFallbackQualification(conn.db, leadId, { fitScore: 90, hasGenericContact: true, hasWebsite: true });
    const fb = (await conn.db.select().from(qualifications).where(eq(qualifications.leadId, leadId))).filter((q) => q.origin === "fallback");
    expect(fb).toHaveLength(1);
    expect(fb[0]!.isMock).toBe(true);
  });

  it("selects exportable leads, excluding suppressed and opted-out", async () => {
    await conn.db.update(leads).set({ status: "found" }).where(eq(leads.id, leadId));
    const list = await selectLeadsForDapta(conn.db, { appUrl: "https://faro.test/" });
    expect(list).toHaveLength(1);
    expect(list[0]!.phone).toBe("+573001112233");
    expect(list[0]).toMatchObject({ slug: "clinica-uno-1a2b", email: "info@uno.co", diagnosticUrl: "https://faro.test/d/clinica-uno-1a2b" });
    await conn.db.insert(suppression).values({ kind: "domain", value: "uno.co", reason: "optout" });
    expect(await selectLeadsForDapta(conn.db, { appUrl: "https://faro.test" })).toHaveLength(0);
  });
});

describe("csv", () => {
  it("escapes and neutralises formulas", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    for (const c of ["+1", "-1", "@a", "=1"]) expect(csvCell(c).startsWith("'")).toBe(true);
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    const out = buildCsv([rec({ company: "=cmd|' /C calc'!A0", notes: "@SUM(1)" })]);
    expect(out.csv.split("\r\n")[0]).toBe("empresa,telefono,correo_generico,ciudad,fuente,slug,url_diagnostico,notas");
    expect(out.csv).toContain("'=cmd");
    expect(out.csv).toContain("'@SUM(1)");
    expect(out.csv).not.toMatch(/(^|,)=cmd/m);
  });
  it("keeps E.164 phones dialable in the telefono column", () => {
    const out = buildCsv([rec({ phone: "+573001112233" }), rec({ phone: "=1+1" })]);
    expect(out.csv).toContain("Clinica Uno,+573001112233,");
    expect(out.csv).toContain("'=1+1");
  });
  it("caps size at 5 MB", () => {
    const big = Array.from({ length: 30000 }, (_, i) => rec({ leadId: `${i}`, notes: "x".repeat(300) }));
    const out = buildCsv(big);
    expect(out.truncated).toBe(true);
    expect(out.bytes).toBeLessThanOrEqual(5 * 1024 * 1024);
    expect(Buffer.byteLength(out.csv)).toBeLessThanOrEqual(5 * 1024 * 1024);
    expect(buildCsv([rec()]).truncated).toBe(false);
  });
});

describe("SSRF", () => {
  it.each([
    "http://127.0.0.1/x", "http://10.0.0.1/x", "http://169.254.169.254/latest", "https://127.0.0.1/", "https://localhost/",
    "https://192.168.1.5/", "https://172.16.0.1/", "https://[::1]/", "https://[::ffff:127.0.0.1]/", "https://[fd00::1]/",
    "https://svc.internal/", "https://intranet/", "https://u:p@example.com/", "https://2130706433/", "https://[64:ff9b::7f00:1]/", "https://[2002:7f00:1::]/", "ftp://example.com/", "not a url",
  ])("blocks %s", (u) => {
    expect(() => assertSafePushUrl(u)).toThrow();
  });
  it("allows a public https URL", () => {
    expect(assertSafePushUrl("https://api.dapta.ai/v1/leads").hostname).toBe("api.dapta.ai");
  });
  it("blocks hostnames that resolve to private addresses", async () => {
    await expect(assertSafePushUrlResolved("https://evil.example.com/", async () => ["10.0.0.5"])).rejects.toThrow();
    await expect(assertSafePushUrlResolved("https://evil.example.com/", async () => [])).rejects.toThrow();
    await expect(assertSafePushUrlResolved("https://evil.example.com/", async () => { throw new Error("x"); })).rejects.toThrow();
    await expect(assertSafePushUrlResolved("https://ok.example.com/", async () => ["93.184.216.34"])).resolves.toBeInstanceOf(URL);
    await expect(assertSafePushUrlResolved("https://93.184.216.34/")).resolves.toBeInstanceOf(URL);
  });
});

describe("adapters", () => {
  const pub = async () => ["93.184.216.34"];
  const base = { DAPTA_MODE: "http_push", DAPTA_PUSH_URL: "https://api.dapta.example/leads", DAPTA_PUSH_API_KEY: "k" };

  it("http_push with SEND_ENABLED=false is simulated and never fetches", async () => {
    const f = vi.fn();
    const a = createRealDaptaAdapter(parseEnv({ ...base, SEND_ENABLED: "false" }), { fetchImpl: f as unknown as typeof fetch, resolver: pub });
    expect(await a.push([rec()])).toMatchObject({ status: "simulated", count: 1, isMock: false });
    expect(f).not.toHaveBeenCalled();
  });
  it("http_push blocks private URLs even when sending is enabled", async () => {
    for (const url of ["http://127.0.0.1/x", "http://10.0.0.1/x", "http://169.254.169.254/x"]) {
      const f = vi.fn();
      const a = createRealDaptaAdapter(parseEnv({ ...base, DAPTA_PUSH_URL: url, SEND_ENABLED: "true" }), { fetchImpl: f as unknown as typeof fetch, resolver: pub });
      const r = await a.push([rec()]);
      expect(r.status).toBe("failed");
      expect(r.reason).toMatch(/blocked/);
      expect(f).not.toHaveBeenCalled();
    }
    const bad = createRealDaptaAdapter(parseEnv({ ...base, DAPTA_PUSH_URL: "nonsense", SEND_ENABLED: "true" }), { resolver: pub });
    expect((await bad.push([rec()])).reason).toBe("blocked: invalid URL");
  });
  it("http_push sends with bearer key and retries 5xx once", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("", { status: 503 })).mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const a = createRealDaptaAdapter(parseEnv({ ...base, SEND_ENABLED: "true" }), { fetchImpl: f as unknown as typeof fetch, resolver: pub, sleep: async () => {} });
    expect(await a.push([rec()])).toMatchObject({ status: "sent", httpStatus: 200 });
    expect(f).toHaveBeenCalledTimes(2);
    const init = f.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k");
    expect(init.redirect).toBe("manual");
    expect(JSON.parse(init.body as string).leads[0]).toMatchObject({ lead_id: "l1", slug: "s1", diagnostic_url: "https://faro.test/d/s1" });
  });
  it("does not retry 4xx and reports network failures", async () => {
    const f4 = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
    const a4 = createRealDaptaAdapter(parseEnv({ ...base, SEND_ENABLED: "true" }), { fetchImpl: f4 as unknown as typeof fetch, resolver: pub, sleep: async () => {} });
    expect(await a4.push([rec()])).toMatchObject({ status: "failed", httpStatus: 401 });
    expect(f4).toHaveBeenCalledTimes(1);
    const fe = vi.fn().mockRejectedValue(new Error("boom"));
    const ae = createRealDaptaAdapter(parseEnv({ ...base, SEND_ENABLED: "true" }), { fetchImpl: fe as unknown as typeof fetch, resolver: pub, sleep: async () => {} });
    expect(await ae.push([rec()])).toMatchObject({ status: "failed", reason: "Error" });
    expect(fe).toHaveBeenCalledTimes(2);
  });
  it("widget_only and csv_export never push; missing credentials fall back to mock", async () => {
    for (const m of ["widget_only", "csv_export"]) {
      const a = getDaptaAdapter(parseEnv({ DAPTA_MODE: m }));
      expect(a.isMock).toBe(false);
      expect((await a.push([rec()])).status).toBe("skipped");
      expect(a.exportCsv([rec()]).rows).toBe(1);
    }
    const m = getDaptaAdapter(parseEnv({ DAPTA_MODE: "http_push" }));
    expect(m.isMock).toBe(true);
    expect(await m.push([rec()])).toMatchObject({ status: "simulated", isMock: true });
    expect(m.exportCsv([rec()]).rows).toBe(1);
    expect(getDaptaAdapter(parseEnv({ ...base })).isMock).toBe(false);
    const nokey = createRealDaptaAdapter(parseEnv({ DAPTA_MODE: "http_push" }));
    expect((await nokey.push([rec()])).status).toBe("skipped");
  });
});

describe("requireAppAccess", () => {
  const r = (h: Record<string, string> = {}) => new Request("http://x/api", { headers: h });
  it("checks header and cookie, fails closed in production", async () => {
    const env = { APP_ACCESS_KEY: "abc" };
    expect(requireAppAccess(r({ "x-app-key": "abc" }), env)).toBeNull();
    expect(requireAppAccess(r({ cookie: "a=1; faro_key=abc" }), env)).toBeNull();
    expect(requireAppAccess(r({ "x-app-key": "bad" }), env)?.status).toBe(401);
    expect(requireAppAccess(r({ cookie: "faro_key=%E0%A4%A" }), env)?.status).toBe(401);
    expect(requireAppAccess(r(), env)?.status).toBe(401);
    expect(requireAppAccess(r(), {})).toBeNull();
    expect(requireAppAccess(r(), { NODE_ENV: "production" })?.status).toBe(401);
  });
});
