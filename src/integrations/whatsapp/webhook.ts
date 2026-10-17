import { and, eq, inArray, sql } from "drizzle-orm";
import { seedCostRates } from "@/db/seed";
import { z } from "zod";
import { contactPoints, costEntries, costRates, events, leads, messages } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { safeEqual } from "@/lib/app-access";
import { normalizeSuppressionValue, suppress } from "@/features/compliance/suppression";

const optStr = z.string().trim().min(1).max(500).optional().nullable();

export const whatsappWebhookSchema = z
  .object({
    event: z.enum(["sent", "delivered", "reply", "opt_out"]),
    lead_id: z.string().uuid().optional().nullable(),
    slug: optStr,
    phone: optStr,
    message_id: optStr,
    text: z.string().max(4000).optional().nullable(),
  })
  .passthrough()
  .refine((p) => p.lead_id || p.slug || p.phone, { message: "lead_id, slug or phone is required" });

export type WhatsappWebhookPayload = z.infer<typeof whatsappWebhookSchema>;

/** Shared secret in `x-whatsapp-secret` or Bearer, constant time. Fail-closed when unconfigured. */
export function verifyWhatsappSecret(req: Request, env: Record<string, string | undefined> = process.env): boolean {
  const secret = env.WHATSAPP_WEBHOOK_SECRET;
  if (!secret) return false;
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const given = req.headers.get("x-whatsapp-secret") ?? bearer;
  return !!given && safeEqual(given, secret);
}

/** "BAJA" / "STOP" (also "unsubscribe") as a whole word: errs on the side of suppressing. */
export const isStopText = (text: string | null | undefined): boolean =>
  !!text && /(^|[^\p{L}])(baja|stop|unsubscribe)([^\p{L}]|$)/iu.test(text);

async function findLead(db: AppDb, p: WhatsappWebhookPayload) {
  if (p.lead_id) {
    const [l] = await db.select().from(leads).where(eq(leads.id, p.lead_id)).limit(1);
    if (l) return l;
  }
  if (p.slug) {
    const [l] = await db.select().from(leads).where(eq(leads.slug, p.slug)).limit(1);
    if (l) return l;
  }
  if (p.phone) {
    const phone = normalizeSuppressionValue(p.phone).value;
    const [r] = await db
      .select({ lead: leads })
      .from(contactPoints)
      .innerJoin(leads, eq(leads.companyId, contactPoints.companyId))
      .where(and(inArray(contactPoints.type, ["phone", "whatsapp"]), eq(contactPoints.value, phone)))
      .limit(1);
    if (r) return r.lead;
  }
  return undefined;
}

export type WhatsappOutcome =
  | { ok: true; duplicate: boolean; leadId: string | null; event: string; optedOut: boolean; costUsd: number }
  | { ok: false; status: 404; error: "lead_not_found" };

/** The template rate lives only in cost_rates (seeded on demand if the row is missing). */
async function templateRate(db: AppDb): Promise<number> {
  const read = async () => (await db.select().from(costRates).where(eq(costRates.key, "whatsapp_template")).limit(1))[0];
  const r = (await read()) ?? (await seedCostRates(db), await read());
  if (!r) throw new Error("cost_rates.whatsapp_template missing");
  return r.usd;
}

async function optOut(db: AppDb, lead: typeof leads.$inferSelect, phone: string | null | undefined): Promise<void> {
  const cps = await db.select().from(contactPoints).where(eq(contactPoints.companyId, lead.companyId));
  const values = new Set(cps.filter((c) => c.type === "phone" || c.type === "whatsapp").map((c) => c.value));
  if (phone) values.add(phone);
  for (const v of values) await suppress(db, v, "opt-out de WhatsApp (BAJA/STOP)");
  if (lead.status !== "opted_out") {
    await db.update(leads).set({ status: "opted_out" }).where(eq(leads.id, lead.id));
    await db.insert(events).values({ leadId: lead.id, type: "opt_out", payload: { via: "whatsapp" }, isDemo: lead.isDemo });
  }
}

/** Applies one WhatsApp event reported by Dapta/Meta. `sent` is idempotent by `message_id`. */
export async function processWhatsappWebhook(db: AppDb, p: WhatsappWebhookPayload): Promise<WhatsappOutcome> {
  const lead = await findLead(db, p);
  const phone = p.phone ? normalizeSuppressionValue(p.phone).value : null;
  if (!lead) {
    // An opt-out is fail-safe: suppress the phone even when no lead matches.
    if (phone && (p.event === "opt_out" || (p.event === "reply" && isStopText(p.text)))) {
      await suppress(db, phone, "opt-out de WhatsApp (BAJA/STOP)");
      return { ok: true, duplicate: false, leadId: null, event: p.event, optedOut: true, costUsd: 0 };
    }
    return { ok: false, status: 404, error: "lead_not_found" };
  }
  const base = { leadId: lead.id, event: p.event };
  const payload = { channel: "whatsapp", ...(p.message_id ? { message_id: p.message_id } : {}) };

  if (p.event === "sent") {
    const rate = await templateRate(db);
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"wa:" + lead.id}))`);
      const msgId = p.message_id ?? null;
      if (msgId) {
        const [dup] = await tx
          .select({ id: messages.id })
          .from(messages)
          .where(and(eq(messages.contactChannel, "whatsapp"), eq(messages.providerId, msgId), inArray(messages.status, ["sent", "delivered"])))
          .limit(1);
        if (dup) return { ok: true as const, duplicate: true, optedOut: false, costUsd: 0, ...base };
      }
      // Claim the export reservation (queued -> sent); otherwise record a fresh message.
      const claimed = await tx
        .update(messages)
        .set({ status: "sent", sentAt: new Date(), ...(msgId ? { providerId: msgId } : {}), ...(phone ? { recipient: phone } : {}) })
        .where(and(eq(messages.leadId, lead.id), eq(messages.contactChannel, "whatsapp"), eq(messages.status, "queued")))
        .returning({ id: messages.id });
      if (!claimed.length) {
        await tx.insert(messages).values({
          leadId: lead.id, contactChannel: "whatsapp", body: "Plantilla de WhatsApp (Dapta)", status: "sent", providerId: msgId,
          recipient: phone, sentAt: new Date(),
        });
      }
      await tx.insert(events).values({ leadId: lead.id, type: "sent", payload, isDemo: lead.isDemo });
      await tx.insert(costEntries).values({
        leadId: lead.id, huntId: lead.huntId, sourceChannel: lead.primarySource, contactChannel: "whatsapp", category: "whatsapp",
        quantity: 1, unit: "template", rate, usd: rate, evidence: `whatsapp template ${msgId ?? "sent"}`, isDemo: lead.isDemo, isMock: false,
      });
      if (["found", "fit"].includes(lead.status)) await tx.update(leads).set({ status: "contacted" }).where(eq(leads.id, lead.id));
      return { ok: true as const, duplicate: false, optedOut: false, costUsd: rate, ...base };
    });
  }

  if (p.event === "delivered") {
    if (p.message_id) {
      await db.update(messages).set({ status: "delivered" }).where(and(eq(messages.contactChannel, "whatsapp"), eq(messages.providerId, p.message_id)));
    }
    await db.insert(events).values({ leadId: lead.id, type: "delivered", payload, isDemo: lead.isDemo });
    return { ok: true, duplicate: false, optedOut: false, costUsd: 0, ...base };
  }

  if (p.event === "reply") {
    await db.insert(events).values({ leadId: lead.id, type: "reply", payload: { ...payload, text: (p.text ?? "").slice(0, 500) }, isDemo: lead.isDemo });
    if (["found", "fit", "contacted"].includes(lead.status)) await db.update(leads).set({ status: "responded" }).where(eq(leads.id, lead.id));
    if (isStopText(p.text)) {
      await optOut(db, lead, phone);
      return { ok: true, duplicate: false, optedOut: true, costUsd: 0, ...base };
    }
    return { ok: true, duplicate: false, optedOut: false, costUsd: 0, ...base };
  }

  await optOut(db, lead, phone);
  return { ok: true, duplicate: false, optedOut: true, costUsd: 0, ...base };
}
