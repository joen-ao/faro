import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { companies, contactPoints, events, leads, qualifications, suppression } from "@/db/schema";
import { parseEnv } from "@/lib/env";
import { normalizeDaptaNative, payloadShape, toBool } from "@/integrations/dapta/native";
import { daptaWebhookSchema, processDaptaWebhook, verifyWebhookSecret } from "@/integrations/dapta/webhook";
import { createTestDb } from "../helpers/test-db";

// Shape modelled on a post-conversation analysis export; values are synthetic.
const nativeBody = {
  event: "conversation.analyzed",
  data: {
    conversation: { id: "conv_native_1", channel: "whatsapp" },
    contact: { phone_number: "+57 300 999 8877" },
    analysis: { variables: { calificado: "true", pidio_baja: false, resumen: "Agenda en cuaderno; decide gerencia; este mes." } },
  },
};

describe("normalizeDaptaNative", () => {
  it("finds conversation id, phone and the agent variables at any depth", () => {
    expect(normalizeDaptaNative(nativeBody)).toEqual({
      conversation_id: "conv_native_1",
      phone: "+57 300 999 8877",
      email: undefined,
      qualified: true,
      opt_out: false,
      summary: "Agenda en cuaderno; decide gerencia; este mes.",
    });
  });

  it("falls back to a top-level id and reads email", () => {
    const n = normalizeDaptaNative({ id: 42, user: { email: " INFO@Clinica.co " }, variables: [{ name: "x", calificado: "no" }] });
    expect(n).toMatchObject({ conversation_id: "42", email: "info@clinica.co", qualified: false });
  });

  it("parses Spanish booleans and reports only key paths", () => {
    expect(toBool("Sí")).toBe(true);
    expect(toBool("falso")).toBe(false);
    expect(toBool("quizá")).toBeUndefined();
    const shape = payloadShape(nativeBody);
    expect(shape).toContain("data.contact.phone_number");
    expect(shape.join(" ")).not.toContain("+57");
  });
});

describe("secret via query string", () => {
  it("accepts ?secret= and still rejects a wrong one", () => {
    const env = { DAPTA_WEBHOOK_SECRET: "s3cret" };
    expect(verifyWebhookSecret(new Request("http://x/api/webhooks/dapta?secret=s3cret", { method: "POST" }), env)).toBe(true);
    expect(verifyWebhookSecret(new Request("http://x/api/webhooks/dapta?secret=nope", { method: "POST" }), env)).toBe(false);
  });
});

describe("native payload processing", () => {
  let conn: Awaited<ReturnType<typeof createTestDb>>;
  let leadId: string;
  const env = parseEnv({});
  beforeAll(async () => {
    conn = await createTestDb();
    const [c] = await conn.db.insert(companies).values({ name: "Clinica Nativa", normalizedName: "clinica nativa", city: "Bogota" }).returning();
    await conn.db.insert(contactPoints).values({ companyId: c!.id, type: "whatsapp", value: "+573009998877", isGeneric: true });
    const [l] = await conn.db.insert(leads).values({ companyId: c!.id, primarySource: "reps", slug: "clinica-nativa", status: "contacted" }).returning();
    leadId = l!.id;
  });
  afterAll(() => conn.close());

  it("qualifies the lead matched by WhatsApp phone", async () => {
    const r = await processDaptaWebhook(conn.db, daptaWebhookSchema.parse(normalizeDaptaNative(nativeBody)), env);
    expect(r).toMatchObject({ ok: true, qualified: true, leadId });
    const [q] = await conn.db.select().from(qualifications).where(eq(qualifications.leadId, leadId));
    expect(q).toMatchObject({ origin: "dapta", qualified: true, summary: "Agenda en cuaderno; decide gerencia; este mes." });
  });

  it("opt-out suppresses the phone, marks the lead opted_out and never counts as qualified", async () => {
    const body = { ...nativeBody, data: { ...nativeBody.data, conversation: { id: "conv_native_2" }, analysis: { variables: { calificado: true, pidio_baja: "true" } } } };
    const r = await processDaptaWebhook(conn.db, daptaWebhookSchema.parse(normalizeDaptaNative(body)), env);
    expect(r).toMatchObject({ ok: true, qualified: false });
    const [lead] = await conn.db.select().from(leads).where(eq(leads.id, leadId));
    expect(lead!.status).toBe("opted_out");
    expect((await conn.db.select().from(events).where(eq(events.leadId, leadId))).map((e) => e.type)).toContain("opt_out");
    expect(await conn.db.select().from(suppression).where(eq(suppression.value, "+573009998877"))).toHaveLength(1);
  });

  it("honours an opt-out from an unknown contact without a lead", async () => {
    const r = await processDaptaWebhook(conn.db, daptaWebhookSchema.parse({ conversation_id: "conv_x", phone: "+57 311 000 0000", opt_out: true }), env);
    expect(r).toMatchObject({ ok: true, leadId: null, qualified: false });
    expect(await conn.db.select().from(suppression).where(eq(suppression.value, "+573110000000"))).toHaveLength(1);
  });
});
