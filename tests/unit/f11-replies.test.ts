import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { companies, companySources, contactPoints, events, hunts, icpProfiles, leads, messages, suppression, workspaces } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { getChannelMetrics } from "@/features/metrics/channels";
import { isUnsubscribeText, markManualReply, processEmailEvent } from "@/features/replies/service";
import { signSvix, verifySvix } from "@/features/replies/signature";
import { POST as webhookPost } from "@/app/api/webhooks/email/route";
import { POST as replyPost } from "@/app/api/leads/[id]/reply/route";
import { createTestDb } from "../helpers/test-db";

process.env.OPTOUT_SECRET = "f11-test-secret";

const holder: { conn?: unknown } = {};
vi.mock("@/db/client", async (orig) => {
  const real = await orig<typeof import("@/db/client")>();
  return { ...real, getDb: () => holder.conn as ReturnType<typeof real.getDb> };
});
const SECRET = `whsec_${Buffer.from("f11-webhook-secret-bytes").toString("base64")}`;

let conn: Awaited<ReturnType<typeof createTestDb>>;
let db: AppDb;
let huntId: string;
let n = 0;

beforeAll(async () => {
  conn = await createTestDb();
  db = conn.db as unknown as AppDb;
  holder.conn = conn;
  const [ws] = await db.insert(workspaces).values({ name: "Pyme", offerDescription: "x", country: "CO" }).returning();
  const [icp] = await db.insert(icpProfiles).values({ workspaceId: ws!.id, prompt: "p", criteria: { sector: "x" }, threshold: 60 }).returning();
  const [h] = await db.insert(hunts).values({ icpProfileId: icp!.id }).returning();
  huntId = h!.id;
});
afterAll(async () => {
  await conn.close();
});

async function mkLead(status: "fit" | "contacted" | "qualified" = "contacted") {
  n++;
  const [c] = await db.insert(companies).values({ name: `Empresa ${n} SAS`, normalizedName: `empresa ${n}`, city: "Bogota", isLegalEntity: true, website: `https://e${n}.example` }).returning();
  await db.insert(companySources).values({ companyId: c!.id, sourceChannel: "osm", externalId: `x-${n}`, isMock: false });
  await db.insert(contactPoints).values({ companyId: c!.id, type: "email", value: `info@e${n}.example`, isGeneric: true });
  const [lead] = await db.insert(leads).values({ companyId: c!.id, huntId, status, primarySource: "osm", fitScore: 80, slug: `s11-${n}` }).returning();
  const [msg] = await db
    .insert(messages)
    .values({ leadId: lead!.id, contactChannel: "email", body: "hola", status: "sent", providerId: `prov-${n}`, recipient: `info@e${n}.example`, sentAt: new Date() })
    .returning();
  return { lead: lead!, msg: msg!, email: `info@e${n}.example` };
}
const status = async (id: string) => (await db.select().from(leads).where(eq(leads.id, id)))[0]!.status;
const evs = (id: string, type: "reply" | "delivered" | "click" | "opt_out") => db.select().from(events).where(eq(events.leadId, id)).then((r) => r.filter((e) => e.type === type));

function req(body: unknown, headers: Record<string, string>) {
  return new Request("http://x/api/webhooks/email", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers });
}

describe("svix signature", () => {
  const body = '{"type":"email.delivered"}';
  const now = Date.now();
  const ts = Math.floor(now / 1000);
  it("accepts a valid signature", () => {
    const h = new Headers(signSvix(body, SECRET, "msg_1", ts));
    expect(verifySvix(body, h, SECRET, now)).toEqual({ ok: true, id: "msg_1" });
  });
  it("accepts when one of several signatures matches", () => {
    const s = signSvix(body, SECRET, "msg_1", ts);
    const h = new Headers({ ...s, "svix-signature": `v1,AAAA ${s["svix-signature"]}` });
    expect(verifySvix(body, h, SECRET, now).ok).toBe(true);
  });
  it("rejects invalid, tampered, expired, future, missing and no-secret", () => {
    const good = signSvix(body, SECRET, "msg_1", ts);
    expect(verifySvix(body + " ", new Headers(good), SECRET, now)).toMatchObject({ ok: false, reason: "bad_signature" });
    expect(verifySvix(body, new Headers({ ...good, "svix-signature": "v1,AAAA" }), SECRET, now)).toMatchObject({ ok: false, reason: "bad_signature" });
    expect(verifySvix(body, new Headers(signSvix(body, SECRET, "msg_1", ts - 301)), SECRET, now)).toMatchObject({ ok: false, reason: "expired" });
    expect(verifySvix(body, new Headers(signSvix(body, SECRET, "msg_1", ts + 301)), SECRET, now)).toMatchObject({ ok: false, reason: "expired" });
    expect(verifySvix(body, new Headers(), SECRET, now)).toMatchObject({ ok: false, reason: "missing_headers" });
    expect(verifySvix(body, new Headers(good), undefined, now)).toMatchObject({ ok: false, reason: "no_secret" });
    expect(verifySvix(body, new Headers(good), "", now)).toMatchObject({ ok: false, reason: "no_secret" });
  });
});

describe("POST /api/webhooks/email", () => {
  it("returns 401 without a configured secret even with a plausible signature", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const body = JSON.stringify({ type: "email.delivered", data: {} });
    const res = await webhookPost(req(body, signSvix(body, SECRET, "m", Math.floor(Date.now() / 1000))));
    expect(res.status).toBe(401);
  });
  it("401 on bad signature, 200 on valid, and reply is idempotent per svix-id", async () => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    try {
      const { lead } = await mkLead("contacted");
      const body = JSON.stringify({ type: "email.received", data: { email_id: "prov-" + n, from: "Alguien <x@y.co>", subject: "Re: hola", text: "Nos interesa, llamen" } });
      const ts = Math.floor(Date.now() / 1000);
      expect((await webhookPost(req(body, { "svix-id": "a", "svix-timestamp": String(ts), "svix-signature": "v1,AAAA" }))).status).toBe(401);
      const h = signSvix(body, SECRET, "evt_reply_1", ts);
      const r1 = await webhookPost(req(body, h));
      expect(r1.status).toBe(200);
      expect(await r1.json()).toMatchObject({ ok: true, handled: "reply", matched: true });
      const r2 = await webhookPost(req(body, h));
      expect(await r2.json()).toMatchObject({ duplicate: true });
      expect(await evs(lead.id, "reply")).toHaveLength(1);
      expect(await status(lead.id)).toBe("responded");
    } finally {
      delete process.env.RESEND_WEBHOOK_SECRET;
    }
  });
});

describe("event processing", () => {
  const ev = (type: string, data: Record<string, unknown>) => ({ type, data });

  it("reply by In-Reply-To advances to responded and stores no sender/body", async () => {
    const { lead, msg } = await mkLead("contacted");
    const out = await processEmailEvent(db, ev("email.received", { from: "Persona Real <p@q.co>", in_reply_to: `<${msg.providerId}@send.resend.dev>`, subject: "Re", text: "Gracias, hablemos" }), "svix-r1");
    expect(out).toMatchObject({ handled: "reply", matched: true, leadId: lead.id });
    expect(await status(lead.id)).toBe("responded");
    const [e] = await evs(lead.id, "reply");
    expect(JSON.stringify(e!.payload)).not.toMatch(/Persona|hablemos|p@q\.co/);
  });

  it("reply by sender address matches the lead and does not move qualified back", async () => {
    const { lead, email } = await mkLead("qualified");
    const out = await processEmailEvent(db, ev("email.received", { from: `<${email.toUpperCase()}>`, text: "ok" }), "svix-r2");
    expect(out.matched).toBe(true);
    expect(await status(lead.id)).toBe("qualified");
    expect(await evs(lead.id, "reply")).toHaveLength(1);
  });

  it("unmatched reply is acknowledged without side effects", async () => {
    const out = await processEmailEvent(db, ev("email.received", { from: "nadie@zz.co", text: "hola" }), "svix-r3");
    expect(out).toMatchObject({ matched: false });
  });

  it("unsubscribe text -> opt-out and suppression, no reply event", async () => {
    const { lead, msg, email } = await mkLead("contacted");
    const out = await processEmailEvent(db, ev("email.received", { email_id: msg.providerId, from: email, subject: "Re", text: "Por favor, quiero darme de baja." }), "svix-u1");
    expect(out.handled).toBe("unsubscribe");
    expect(await status(lead.id)).toBe("opted_out");
    expect(await evs(lead.id, "reply")).toHaveLength(0);
    const sup = await db.select().from(suppression).where(eq(suppression.value, email));
    expect(sup).toHaveLength(1);
  });

  it("unsubscribe phrases", () => {
    for (const t of ["Darme de baja", "UNSUBSCRIBE", "no me interesa gracias", "favor desuscribirme", "No nos interesa"]) expect(isUnsubscribeText(t)).toBe(true);
    for (const t of ["Me interesa, cuanto cuesta?", "Gracias por escribir"]) expect(isUnsubscribeText(t)).toBe(false);
  });

  it("delivered updates message and is idempotent; click records event", async () => {
    const { lead, msg } = await mkLead("contacted");
    await processEmailEvent(db, ev("email.delivered", { email_id: msg.providerId }), "svix-d1");
    const dup = await processEmailEvent(db, ev("email.delivered", { email_id: msg.providerId }), "svix-d1");
    expect(dup.duplicate).toBe(true);
    expect(await evs(lead.id, "delivered")).toHaveLength(1);
    expect((await db.select().from(messages).where(eq(messages.id, msg.id)))[0]!.status).toBe("delivered");
    await processEmailEvent(db, ev("email.clicked", { email_id: msg.providerId }), "svix-c1");
    expect(await evs(lead.id, "click")).toHaveLength(1);
    expect((await processEmailEvent(db, ev("email.opened", { email_id: msg.providerId }), "svix-o1")).handled).toBe("ignored_open");
  });

  it("hard bounce suppresses; soft bounce does not", async () => {
    const soft = await mkLead();
    await processEmailEvent(db, ev("email.bounced", { email_id: soft.msg.providerId, to: [soft.email], bounce: { type: "Transient" } }), "svix-b0");
    expect(await db.select().from(suppression).where(eq(suppression.value, soft.email))).toHaveLength(0);
    const hard = await mkLead();
    await processEmailEvent(db, ev("email.bounced", { email_id: hard.msg.providerId, to: [hard.email], bounce: { type: "Permanent" } }), "svix-b1");
    expect(await db.select().from(suppression).where(eq(suppression.value, hard.email))).toHaveLength(1);
    expect((await db.select().from(messages).where(eq(messages.id, hard.msg.id)))[0]!.status).toBe("failed");
  });

  it("complaint suppresses and opts the lead out", async () => {
    const { lead, msg, email } = await mkLead();
    await processEmailEvent(db, ev("email.complained", { email_id: msg.providerId, to: [email] }), "svix-k1");
    expect(await status(lead.id)).toBe("opted_out");
    expect((await db.select().from(suppression).where(eq(suppression.value, email))).length).toBe(1);
  });
});

describe("manual audited reply", () => {
  it("creates an audited event and advances status", async () => {
    const { lead } = await mkLead("contacted");
    const at = new Date(Date.now() - 3600_000).toISOString();
    const r = await markManualReply(db, lead.id, { note: "Respondieron por el correo de contacto", channel: "email", at });
    expect(r).toMatchObject({ ok: true, status: "responded" });
    const [e] = await evs(lead.id, "reply");
    expect(e!.payload).toEqual({ manual: true, note: "Respondieron por el correo de contacto", actor: "app", channel: "email" });
    expect(e!.at.toISOString()).toBe(at);
    expect(await status(lead.id)).toBe("responded");
  });
  it("requires note, valid channel, not-future date and an existing lead; keeps qualified", async () => {
    const { lead } = await mkLead("qualified");
    expect(await markManualReply(db, lead.id, { channel: "email" })).toMatchObject({ ok: false, status: 400 });
    expect(await markManualReply(db, lead.id, { note: "   ", channel: "email" })).toMatchObject({ ok: false, status: 400 });
    expect(await markManualReply(db, lead.id, { note: "x".repeat(281), channel: "email" })).toMatchObject({ ok: false, status: 400 });
    expect(await markManualReply(db, lead.id, { note: "ok nota", channel: "sms" })).toMatchObject({ ok: false, status: 400 });
    expect(await markManualReply(db, lead.id, { note: "ok nota", channel: "email", at: new Date(Date.now() + 86400_000).toISOString() })).toMatchObject({ ok: false, status: 400 });
    expect(await markManualReply(db, "00000000-0000-4000-8000-000000000000", { note: "ok nota", channel: "email" })).toMatchObject({ ok: false, status: 404 });
    expect(await markManualReply(db, lead.id, { note: "ok nota", channel: "whatsapp" })).toMatchObject({ ok: true, status: "qualified" });
  });
  it("route is gated by app access in production", async () => {
    const env = process.env as Record<string, string | undefined>;
    const prev = [env.NODE_ENV, env.APP_ACCESS_KEY];
    env.NODE_ENV = "production";
    env.APP_ACCESS_KEY = "k11";
    try {
      const r = await replyPost(new Request("http://x", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "x" }) });
      expect(r.status).toBe(401);
    } finally {
      env.NODE_ENV = prev[0];
      if (prev[1] === undefined) delete env.APP_ACCESS_KEY;
      else env.APP_ACCESS_KEY = prev[1];
    }
  });
});

describe("metrics", () => {
  it("a reply event counts in 'respondieron' of getChannelMetrics", async () => {
    const before = await getChannelMetrics(db);
    const { lead } = await mkLead("contacted");
    const mid = await getChannelMetrics(db);
    expect(mid.real.totals.responded).toBe(before.real.totals.responded);
    await markManualReply(db, lead.id, { note: "respondieron", channel: "email" });
    const after = await getChannelMetrics(db);
    expect(after.real.totals.responded).toBe(before.real.totals.responded + 1);
    const email = after.real.byContact.find((r) => r.contact === "email")!;
    const emailBefore = before.real.byContact.find((r) => r.contact === "email");
    expect(email.responded).toBe((emailBefore?.responded ?? 0) + 1);
  });
});
