import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { contactPoints, costEntries, costRates, events, leads, messages } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { safeEqual } from "@/lib/app-access";
import { normalizeSuppressionValue, suppress } from "@/features/compliance/suppression";

export const DEFAULT_TEMPLATE_USD = 0.0125;
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
  | { ok: true; duplicate: boolean; leadId: string; event: string; optedOut: boolean; costUsd: number }
  | { ok: false; status: 404; error: "lead_not_found" };

async function templateRate(db: AppDb): Promise<number> {
  const [r] = await db.select().from(costRates).where(eq(costRates.key, "whatsapp_template")).limit(1);
  return r?.usd ?? DEFAULT_TEMPLATE_USD;
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
  if (!lead) return { ok: false, status: 404, error: "lead_not_found" };
  const phone = p.phone ? normalizeSuppressionValue(p.phone).value : null;
  const base = { leadId: lead.id, event: p.event };
  const payload = { channel: "whatsapp", ...(p.message_id ? { message_id: p.message_id } : {}) };

  if (p.event === "sent") {
    if (p.message_id) {
      const [dup] = await db
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.contactChannel, "whatsapp"), eq(messages.providerId, p.message_id)))
        .limit(1);
      if (dup) return { ok: true, duplicate: true, optedOut: false, costUsd: 0, ...base };
    }
    const rate = await templateRate(db);
    await db.insert(messages).values({
      leadId: lead.id, contactChannel: "whatsapp", body: "Plantilla de WhatsApp (Dapta)", status: "sent", providerId: p.message_id ?? null,
      recipient: phone, sentAt: new Date(),
    });
    await db.insert(events).values({ leadId: lead.id, type: "sent", payload, isDemo: lead.isDemo });
    await db.insert(costEntries).values({
      leadId: lead.id, huntId: lead.huntId, sourceChannel: lead.primarySource, contactChannel: "whatsapp", category: "whatsapp",
      quantity: 1, unit: "template", rate, usd: rate, evidence: `whatsapp template ${p.message_id ?? "sent"}`, isDemo: lead.isDemo, isMock: false,
    });
    if (["found", "fit"].includes(lead.status)) await db.update(leads).set({ status: "contacted" }).where(eq(leads.id, lead.id));
    return { ok: true, duplicate: false, optedOut: false, costUsd: rate, ...base };
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
