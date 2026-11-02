import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { companies, contactPoints, events, hunts, icpProfiles, leads, messages, suppression, workspaces } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { replyAddress, slugFromReplyAddress } from "@/features/outreach/generate";
import { createReplyForwarder } from "@/features/replies/forward";
import { processEmailEvent, type ForwardInput } from "@/features/replies/service";
import { fetchReceivedEmail } from "@/integrations/email/inbound";
import type { EmailMessage } from "@/integrations/email/types";
import { createTestDb } from "../helpers/test-db";

const DOMAIN = "respuestas.mokub.co";

describe("F27 · reply address per lead", () => {
  it("names the lead when a receiving domain is set, else the shared address", () => {
    expect(replyAddress({ EMAIL_REPLY_DOMAIN: DOMAIN, EMAIL_REPLY_TO: "equipo@mokub.co" }, "Abc123")).toBe("r.abc123@respuestas.mokub.co");
    expect(replyAddress({ EMAIL_REPLY_DOMAIN: undefined, EMAIL_REPLY_TO: "equipo@mokub.co" }, "abc")).toBe("equipo@mokub.co");
    expect(replyAddress({ EMAIL_REPLY_DOMAIN: DOMAIN, EMAIL_REPLY_TO: undefined }, "bad slug!", "x@y.co")).toBe("x@y.co");
    expect(slugFromReplyAddress("R.abc123@Respuestas.Mokub.co", DOMAIN)).toBe("abc123");
    expect(slugFromReplyAddress("r.abc123@otro.co", DOMAIN)).toBeNull();
  });
});

describe("F27 · reading a received email", () => {
  it("returns text, html and lower-cased headers; null on error or a bad id", async () => {
    const ok = await fetchReceivedEmail("56761188-7520-42d8-8898-ff6fc54ce618", "k", (async () =>
      new Response(JSON.stringify({ from: "Ana <a@x.co>", to: ["r.s1@respuestas.mokub.co"], subject: "Re: hola", text: "Me interesa", html: "<p>Me interesa</p>", headers: { "In-Reply-To": "<x@y>" }, message_id: "<m@x>" }))) as typeof fetch);
    expect(ok).toMatchObject({ from: "Ana <a@x.co>", text: "Me interesa", headers: { "in-reply-to": "<x@y>" } });
    expect(await fetchReceivedEmail("56761188-7520-42d8-8898-ff6fc54ce618", "k", (async () => new Response("{}", { status: 401 })) as typeof fetch)).toBeNull();
    expect(await fetchReceivedEmail("../etc", "k")).toBeNull();
  });
});

describe("F27 · inbound replies end to end", () => {
  let conn: Awaited<ReturnType<typeof createTestDb>>;
  let db: AppDb;
  let leadId: string;
  beforeAll(async () => {
    conn = await createTestDb();
    db = conn.db as unknown as AppDb;
    const [ws] = await db.insert(workspaces).values({ name: "Mokub", country: "CO" }).returning();
    const [icp] = await db.insert(icpProfiles).values({ workspaceId: ws!.id, prompt: "x", criteria: {} }).returning();
    const [h] = await db.insert(hunts).values({ icpProfileId: icp!.id }).returning();
    const [c] = await db.insert(companies).values({ name: "Clinica Sonrisas SAS", normalizedName: "clinica sonrisas" }).returning();
    await db.insert(contactPoints).values({ companyId: c!.id, type: "email", value: "info@sonrisas.co", isGeneric: true });
    const [l] = await db.insert(leads).values({ companyId: c!.id, huntId: h!.id, status: "contacted", primarySource: "rues", slug: "s1" }).returning();
    leadId = l!.id;
    await db.insert(messages).values({ leadId, contactChannel: "email", body: "x", status: "sent", providerId: "prov-1", recipient: "info@sonrisas.co" });
  }, 60_000);
  afterAll(async () => {
    await conn.close();
  });

  const received = (text: string, from = "gerencia@gmail.com") => async () => ({ id: "e1", from, to: ["r.s1@respuestas.mokub.co"], subject: "Re: diagnóstico", text, html: null, headers: {}, messageId: null });

  it("matches the lead by its reply address even from another mailbox, and forwards it", async () => {
    const forwarded: ForwardInput[] = [];
    const out = await processEmailEvent(
      db,
      { type: "email.received", data: { email_id: "11111111-1111-1111-1111-111111111111", from: "gerencia@gmail.com", to: ["r.s1@respuestas.mokub.co"], subject: "Re: diagnóstico" } },
      "svix-in-1",
      { replyDomain: DOMAIN, fetchReceived: received("Hola, nos interesa. ¿Cuándo hablamos?"), forward: async (f) => void forwarded.push(f) },
    );
    expect(out).toMatchObject({ handled: "reply", matched: true, leadId });
    expect((await db.select().from(leads).where(eq(leads.id, leadId)))[0]!.status).toBe("responded");
    expect(forwarded).toEqual([expect.objectContaining({ from: "gerencia@gmail.com", company: "Clinica Sonrisas SAS", text: "Hola, nos interesa. ¿Cuándo hablamos?", outcome: "reply" })]);
    // The body is never stored.
    const ev = (await db.select().from(events).where(eq(events.leadId, leadId))).find((e) => e.type === "reply")!;
    expect(JSON.stringify(ev.payload)).not.toContain("interesa");
    // Same delivery again: no second event, no second forward.
    await processEmailEvent(db, { type: "email.received", data: { email_id: "11111111-1111-1111-1111-111111111111", to: ["r.s1@respuestas.mokub.co"] } }, "svix-in-1", { replyDomain: DOMAIN, fetchReceived: received("x"), forward: async (f) => void forwarded.push(f) });
    expect(forwarded).toHaveLength(1);
  });

  it("reads 'baja' from the fetched body and suppresses the sender", async () => {
    const out = await processEmailEvent(db, { type: "email.received", data: { email_id: "22222222-2222-2222-2222-222222222222", from: "otro@gmail.com", to: ["r.s1@respuestas.mokub.co"] } }, "svix-in-2", { replyDomain: DOMAIN, fetchReceived: received("Por favor darme de baja", "otro@gmail.com") });
    expect(out.handled).toBe("unsubscribe");
    expect((await db.select().from(suppression)).map((x) => x.value)).toContain("otro@gmail.com");
  });
});

describe("F27 · forwarder", () => {
  it("sends to the team with Reply-To = client, never loops on our own addresses", async () => {
    const sent: EmailMessage[] = [];
    const spy = { isMock: true, send: async (m: EmailMessage) => (sent.push(m), { id: "x" }) };
    const fwd = createReplyForwarder({ email: spy, from: "Mokub <equipo@mokub.co>", to: "equipo@mokub.co", replyDomain: DOMAIN, appUrl: "https://faro.test" });
    await fwd({ emailId: "e1", from: "gerencia@gmail.com", subject: "Re: hola", text: "Hablemos <b>ya</b>", html: null, company: "Clinica Sonrisas SAS", outcome: "reply" });
    await fwd({ emailId: "e2", from: "equipo@mokub.co", subject: "loop", text: "x", html: null, company: null, outcome: "reply" });
    await fwd({ emailId: "e3", from: "r.s1@respuestas.mokub.co", subject: "loop", text: "x", html: null, company: null, outcome: "reply" });
    await fwd({ emailId: "e4", from: "cliente@x.co", subject: "Re", text: "x", html: null, company: null, outcome: "reply", to: ["Equipo <equipo@mokub.co>"] });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "equipo@mokub.co", replyTo: "gerencia@gmail.com", subject: "[Faro] Clinica Sonrisas SAS: Re: hola", idempotencyKey: "faro-fwd-e1" });
    expect(sent[0]!.html).toContain("Hablemos &lt;b&gt;ya&lt;/b&gt;");
  });
});

describe("F27b · replies to equipo@ copied to Faro", () => {
  let conn: Awaited<ReturnType<typeof createTestDb>>;
  let db: AppDb;
  let leadId: string;
  beforeAll(async () => {
    conn = await createTestDb();
    db = conn.db as unknown as AppDb;
    const [ws] = await db.insert(workspaces).values({ name: "Mokub", country: "CO" }).returning();
    const [icp] = await db.insert(icpProfiles).values({ workspaceId: ws!.id, prompt: "x", criteria: {} }).returning();
    const [h] = await db.insert(hunts).values({ icpProfileId: icp!.id }).returning();
    const [c] = await db.insert(companies).values({ name: "Contable Uno SAS", normalizedName: "contable uno" }).returning();
    const [l] = await db.insert(leads).values({ companyId: c!.id, huntId: h!.id, status: "contacted", primarySource: "rues", slug: "c1" }).returning();
    leadId = l!.id;
    await db.insert(messages).values({ leadId, contactChannel: "email", body: "x", status: "sent", providerId: "resend-id-1", recipient: "info@contableuno.co" });
  }, 60_000);
  afterAll(async () => {
    await conn.close();
  });

  it("saves the RFC Message-ID on delivery and matches a reply from another mailbox by In-Reply-To", async () => {
    await processEmailEvent(db, { type: "email.delivered", data: { email_id: "resend-id-1", message_id: "<0103abc-000000@sa-east-1.amazonses.com>" } }, "svix-d-1");
    const out = await processEmailEvent(
      db,
      { type: "email.received", data: { email_id: "33333333-3333-3333-3333-333333333333", from: "gerente@gmail.com", to: ["faro@izeneakua.resend.app"] } },
      "svix-r-1",
      { fetchReceived: async () => ({ id: "x", from: "gerente@gmail.com", to: ["equipo@mokub.co"], subject: "Re: hola", text: "Me interesa", html: null, headers: { "in-reply-to": "<0103abc-000000@sa-east-1.amazonses.com>" }, messageId: null }) },
    );
    expect(out).toMatchObject({ handled: "reply", matched: true, leadId });
  });
});
