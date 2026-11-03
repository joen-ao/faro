import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Env } from "@/lib/env";
import { createMockCapi } from "@/integrations/meta-capi/mock";
import { createRealCapi } from "@/integrations/meta-capi/real";
import { getCapi } from "@/integrations/meta-capi";
import { buildUserData, eventIdOr, fbcFromFbclid, normPhone, trackLead, trackQualifiedLead } from "@/features/tracking/meta";
import { parsePublicLead, recordPublicLead } from "@/features/inbound/public-lead";
import { createTestDb } from "../helpers/test-db";

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const env = { META_PIXEL_ID: "1234567890" } as Env;
const noPixel = {} as Env;
let t: Awaited<ReturnType<typeof createTestDb>>;

vi.mock("@/db/client", async (orig) => {
  const real = await orig<typeof import("@/db/client")>();
  return { ...real, getReadyDb: async () => t.db };
});
const scheduled = vi.hoisted(() => ({ n: 0 }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => void scheduled.n++ }));

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

describe("user data", () => {
  it("hashes normalised email and phone, never sends them in clear, and links events by the hashed lead id", () => {
    const u = buildUserData({ leadId: "L1", emails: [" Info@Uno.CO ", "info@uno.co", null], phones: ["300 123 4567", "12"], ip: "1.2.3.4", userAgent: "UA" });
    expect(u.em).toEqual([sha("info@uno.co")]);
    expect(u.ph).toEqual([sha("573001234567")]);
    expect(u.external_id).toEqual([sha("L1")]);
    expect(JSON.stringify(u)).not.toMatch(/uno\.co|3001234567/);
    expect(u).toMatchObject({ client_ip_address: "1.2.3.4", client_user_agent: "UA" });
  });

  it("builds fbc from fbclid only when no valid _fbc cookie, and drops malformed cookies", () => {
    expect(fbcFromFbclid("IwAR-abcdefghij", 1700000000000)).toBe("fb.1.1700000000000.IwAR-abcdefghij");
    expect(fbcFromFbclid("x")).toBeUndefined();
    expect(buildUserData({ leadId: "L", fbc: "fb.1.1700000000000.COOKIE", fbclid: "IwAR-abcdefghij" }).fbc).toBe("fb.1.1700000000000.COOKIE");
    expect(buildUserData({ leadId: "L", fbc: "<script>", fbp: "nope" })).not.toHaveProperty("fbp");
    expect(normPhone("+57 (300) 123-4567")).toBe("573001234567");
  });

  it("keeps a valid client event id and replaces anything else", () => {
    expect(eventIdOr("0b8f6f1e-1111-4222-8333-444455556666")).toBe("0b8f6f1e-1111-4222-8333-444455556666");
    expect(eventIdOr("<bad id>")).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("events", () => {
  it("sends nothing without META_PIXEL_ID", async () => {
    const capi = createMockCapi();
    expect(await trackLead(t.db, { leadId: "L", eventId: "evt-12345678", emails: ["info@x.co"] }, { env: noPixel, capi })).toBeNull();
    expect(capi.sent).toHaveLength(0);
  });

  it("Lead carries the browser event id; QualifiedLead uses the lead's stored contacts and a stable id per conversation", async () => {
    const tracking = parsePublicLead({ company: "Clínica Uno SAS", email: "info@uno.co", phone: "3001234567", consent: true, utm_source: "facebook" });
    if (tracking.kind !== "ok") throw new Error("parse");
    const leadId = await recordPublicLead(t.db, tracking.data, tracking.tracking);
    const capi = createMockCapi();
    await trackLead(t.db, { leadId, eventId: "evt-12345678", emails: ["info@uno.co"], sourceUrl: "https://mokub.co/?fbclid=x" }, { env, capi, now: 1_700_000_000_000 });
    expect(capi.sent[0]).toMatchObject({ event_name: "Lead", event_id: "evt-12345678", event_time: 1_700_000_000, action_source: "website" });

    await trackQualifiedLead(t.db, { leadId, conversationId: "conv-1", score: 82.4 }, { env, capi });
    await trackQualifiedLead(t.db, { leadId, conversationId: "conv-1" }, { env, capi });
    const [q1, q2] = capi.sent.slice(1);
    expect(q1).toMatchObject({ event_name: "QualifiedLead", action_source: "system_generated", custom_data: { score: 82 } });
    expect(q1!.user_data.em).toEqual([sha("info@uno.co")]);
    expect(q1!.user_data.ph).toEqual([sha("573001234567")]);
    expect(q1!.user_data.external_id).toEqual(capi.sent[0]!.user_data.external_id);
    expect(q2!.event_id).toBe(q1!.event_id);
  });

  it("real adapter posts to the pixel, redacts the token on errors and never throws", async () => {
    const calls: { url: string; body: string }[] = [];
    const logged: { error: string | null }[] = [];
    const ok = createRealCapi({
      pixelId: "999",
      token: "EAAsecret",
      apiVersion: "v25.0",
      testEventCode: "TEST1",
      fetchImpl: (async (url: string, init: RequestInit) => {
        calls.push({ url, body: String(init.body) });
        return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
      }) as typeof fetch,
    });
    expect(await ok.send([{ event_name: "Lead", event_time: 1, event_id: "e", action_source: "website", user_data: {} }])).toMatchObject({ ok: true, received: 1 });
    expect(calls[0]!.url).toBe("https://graph.facebook.com/v25.0/999/events");
    expect(calls[0]!.body).toContain("test_event_code=TEST1");

    const bad = createRealCapi({
      pixelId: "999",
      token: "EAAsecret",
      apiVersion: "v25.0",
      fetchImpl: (async () => { throw new Error("boom access_token=EAAsecret"); }) as unknown as typeof fetch,
      onCall: async (c) => void logged.push({ error: c.error }),
    });
    const r = await bad.send([{ event_name: "Lead", event_time: 1, event_id: "e", action_source: "website", user_data: {} }]);
    expect(r.ok).toBe(false);
    expect(JSON.stringify([r, logged])).not.toContain("EAAsecret");
  });

  it("uses the real adapter only with pixel, token and META_ADS_MODE=real", () => {
    expect(getCapi({ META_PIXEL_ID: "1", META_ACCESS_TOKEN: "t", META_ADS_MODE: "real" } as Env).isMock).toBe(false);
    expect(getCapi({ META_PIXEL_ID: "1", META_ACCESS_TOKEN: "t", META_ADS_MODE: "mock" } as Env).isMock).toBe(true);
    expect(getCapi({ META_ACCESS_TOKEN: "t", META_ADS_MODE: "real" } as Env).isMock).toBe(true);
  });
});

describe("public lead (mokub.co form)", () => {
  it("validates, honours the honeypot and attributes Meta visits to meta_ads", async () => {
    expect(parsePublicLead({ company: "X SAS", consent: true, hp: "bot" }).kind).toBe("bot");
    expect(parsePublicLead({ company: "X SAS", consent: true, email: "" })).toMatchObject({ kind: "invalid", errors: { email: expect.any(String) } });
    const p = parsePublicLead({ company: "Dental Dos SAS", email: "citas@dos.co", consent: true, fbclid: "IwAR-abcdefghij", utm: { utm_campaign: "c-9" } });
    if (p.kind !== "ok") throw new Error("parse");
    const leadId = await recordPublicLead(t.db, p.data, p.tracking);
    const again = await recordPublicLead(t.db, p.data, p.tracking);
    expect(again).toBe(leadId);
    const [lead] = await t.db.select().from(s.leads).where(eq(s.leads.id, leadId));
    expect(lead).toMatchObject({ primarySource: "meta_ads", status: "responded" });
    const evs = await t.db.select().from(s.events).where(eq(s.events.leadId, leadId));
    expect(evs).toHaveLength(2);
    expect(evs[0]!.utm).toMatchObject({ utm_source: "meta", utm_campaign: "c-9", origin: "mokub.co" });

    const w = parsePublicLead({ company: "Web Tres SAS", phone: "+57 310 000 0000", consent: true });
    if (w.kind !== "ok") throw new Error("parse");
    const [wl] = await t.db.select().from(s.leads).where(eq(s.leads.id, await recordPublicLead(t.db, w.data, w.tracking)));
    expect(wl!.primarySource).toBe("website");
  });

  describe("route", () => {
    beforeEach(() => vi.resetModules());
    const post = (origin: string | null, body: unknown, ip = "5.5.5.5") =>
      new Request("https://faro.test/api/public/lead", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json", "x-real-ip": ip, ...(origin ? { origin } : {}) },
      });

    it("rejects other origins, answers CORS for mokub.co and rate-limits bursts", async () => {
      const { POST, OPTIONS } = await import("@/app/api/public/lead/route");
      expect((await POST(post("https://evil.co", {}))).status).toBe(403);
      expect((await POST(post(null, {}))).status).toBe(403);
      const pre = OPTIONS(new Request("https://faro.test/api/public/lead", { method: "OPTIONS", headers: { origin: "https://www.mokub.co" } }));
      expect(pre.headers.get("access-control-allow-origin")).toBe("https://www.mokub.co");
      const ok = await POST(post("https://mokub.co", { company: "Cuatro SAS", email: "info@cuatro.co", consent: true, adConsent: true, eventId: "evt-abcdef12" }));
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ ok: true, eventId: "evt-abcdef12" });
      expect(ok.headers.get("access-control-allow-origin")).toBe("https://mokub.co");
      let last: Response | null = null;
      for (let i = 0; i < 6; i++) last = await POST(post("https://mokub.co", { company: "Cinco SAS", email: "info@cinco.co", consent: true }, "6.6.6.6"));
      expect(last!.status).toBe(429);
    });

    it("sends the Lead to Meta only with adConsent: true, and records the choice", async () => {
      const { POST } = await import("@/app/api/public/lead/route");
      const before = scheduled.n;
      await POST(post("https://web.mokub.co", { company: "Seis SAS", email: "info@seis.co", consent: true }, "7.7.7.1"));
      await POST(post("https://web.mokub.co", { company: "Siete SAS", email: "info@siete.co", consent: true, adConsent: "true" }, "7.7.7.2"));
      expect(scheduled.n).toBe(before);
      await POST(post("https://web.mokub.co", { company: "Ocho SAS", email: "info@ocho.co", consent: true, adConsent: true }, "7.7.7.3"));
      expect(scheduled.n).toBe(before + 1);
      const payloads = (await t.db.select({ p: s.events.payload }).from(s.events)).map((r) => r.p as { company?: string; adConsent?: boolean });
      expect(payloads.find((p) => p.company === "Seis SAS")?.adConsent).toBe(false);
      expect(payloads.find((p) => p.company === "Ocho SAS")?.adConsent).toBe(true);
    });
  });
});
