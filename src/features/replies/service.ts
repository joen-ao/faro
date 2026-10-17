import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { companies, contactPoints, events, leads, messages } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { applyOptOut, createOptOutToken } from "@/features/compliance/optout";
import { suppress } from "@/features/compliance/suppression";

const ADVANCE_FROM = ["found", "fit", "contacted"] as const;

/** Explicit unsubscribe intent (accent-insensitive). */
const UNSUB = /\b(darme de baja|darnos de baja|dame de baja|dar de baja|desuscrib\w*|unsubscribe|no deseo recibir|no quiero recibir|quitar\w* de (la|su) lista|remove me|opt[- ]?out)\b/;
/** "Not interested" only counts as unsubscribe when the message is short (a long reply may be commercial). */
const NOT_INTERESTED = /\bno (me|nos) interesa\b/;
export const NOT_INTERESTED_MAX_CHARS = 120;
export function isUnsubscribeText(text: string): boolean {
  const t = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return UNSUB.test(t) || (t.length <= NOT_INTERESTED_MAX_CHARS && NOT_INTERESTED.test(t));
}

async function hasSvixEvent(db: AppDb, svixId: string): Promise<boolean> {
  const r = await db.select({ id: events.id }).from(events).where(sql`${events.payload}->>'svix_id' = ${svixId}`).limit(1);
  return r.length > 0;
}

/** Inserts a `reply` event and advances the lead (never backwards). Returns the event id and new status. */
export async function recordReply(
  db: AppDb,
  lead: { id: string; status: string; isDemo: boolean },
  payload: Record<string, unknown>,
  opts: { at?: Date; isMock?: boolean } = {},
): Promise<{ status: string; eventId: string }> {
  const [ev] = await db
    .insert(events)
    .values({ leadId: lead.id, type: "reply", payload, isDemo: lead.isDemo, isMock: opts.isMock ?? false, ...(opts.at ? { at: opts.at } : {}) })
    .returning({ id: events.id });
  if ((ADVANCE_FROM as readonly string[]).includes(lead.status)) {
    await db.update(leads).set({ status: "responded" }).where(eq(leads.id, lead.id));
    return { status: "responded", eventId: ev!.id };
  }
  return { status: lead.status, eventId: ev!.id };
}

// ---------- manual, audited ----------

export const manualReplySchema = z.object({
  note: z.string().trim().min(3, "La nota es obligatoria (mín. 3 caracteres).").max(280, "La nota admite máximo 280 caracteres."),
  channel: z.enum(["email", "web_form", "whatsapp", "dapta_widget"]),
  at: z.string().datetime({ offset: true }).optional(),
});

export type ManualReplyResult = { ok: true; status: string; eventId: string } | { ok: false; status: 400 | 404 | 409; error: string };

export async function markManualReply(db: AppDb, leadId: string, input: unknown, now = new Date()): Promise<ManualReplyResult> {
  const parsed = manualReplySchema.safeParse(input);
  if (!parsed.success) return { ok: false, status: 400, error: parsed.error.issues[0]?.message ?? "invalid_payload" };
  const at = parsed.data.at ? new Date(parsed.data.at) : now;
  if (at.getTime() > now.getTime() + 60_000) return { ok: false, status: 400, error: "La fecha no puede estar en el futuro." };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId)) return { ok: false, status: 404, error: "lead_not_found" };
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) return { ok: false, status: 404, error: "lead_not_found" };
  if (lead.status === "opted_out") return { ok: false, status: 409, error: "El lead se dio de baja: no se registran respuestas." };
  const sent = (await db.select().from(messages).where(eq(messages.leadId, lead.id))).filter((m) => ["sent", "delivered", "simulated"].includes(m.status));
  if (!sent.length) return { ok: false, status: 409, error: "El lead no tiene ningún mensaje enviado: contáctalo primero." };
  const isMock = sent.every((m) => m.isMock || m.status === "simulated");
  const r = await recordReply(db, lead, { manual: true, note: parsed.data.note, actor: "app", channel: parsed.data.channel }, { at, isMock });
  return { ok: true, status: r.status, eventId: r.eventId };
}

// ---------- provider webhook ----------

const addr = (v: unknown): string | null => {
  const s = Array.isArray(v) ? v[0] : v;
  if (typeof s !== "string") return null;
  const m = s.match(/<([^>]+)>/);
  return (m?.[1] ?? s).trim().toLowerCase() || null;
};
const str = (v: unknown, max = 20_000): string => (typeof v === "string" ? v.slice(0, max) : "");

export const emailEventSchema = z.object({
  type: z.string().min(1).max(80),
  created_at: z.string().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
});

export interface WebhookOutcome {
  handled: string;
  matched: boolean;
  duplicate?: boolean;
  leadId?: string;
}

function collectIds(text: string, into: Set<string>) {
  for (const m of text.matchAll(/<?([^<>\s@,]+)(?:@[^<>\s,]*)?>?/g)) if (m[1]) into.add(m[1]);
}

async function messageByProvider(db: AppDb, data: Record<string, unknown>) {
  const ids = new Set<string>();
  if (typeof data.email_id === "string") ids.add(data.email_id);
  collectIds(`${str(data.in_reply_to, 2000)} ${str(data.references, 4000)}`, ids);
  const h = data.headers;
  if (h && typeof h === "object") {
    const hv = h as Record<string, unknown>;
    collectIds(`${str(hv["in-reply-to"] ?? hv["In-Reply-To"], 2000)} ${str(hv["references"] ?? hv["References"], 4000)}`, ids);
  }
  if (!ids.size) return undefined;
  const [m] = await db.select().from(messages).where(inArray(messages.providerId, [...ids].slice(0, 30))).limit(1);
  return m;
}

async function leadBySender(db: AppDb, from: string | null) {
  if (!from) return undefined;
  const rows = await db
    .select({ lead: leads })
    .from(contactPoints)
    .innerJoin(companies, eq(contactPoints.companyId, companies.id))
    .innerJoin(leads, eq(leads.companyId, companies.id))
    .innerJoin(messages, eq(messages.leadId, leads.id))
    .where(and(eq(contactPoints.type, "email"), eq(contactPoints.value, from), inArray(messages.status, ["sent", "delivered"])))
    .orderBy(desc(leads.createdAt))
    .limit(1);
  return rows[0]?.lead;
}

async function leadById(db: AppDb, id: string | undefined) {
  if (!id) return undefined;
  return (await db.select().from(leads).where(eq(leads.id, id)).limit(1))[0];
}

/** Processes one verified provider event. `svixId` makes reply/click/delivered writes idempotent. */
export async function processEmailEvent(db: AppDb, event: z.infer<typeof emailEventSchema>, svixId: string): Promise<WebhookOutcome> {
  // Serialize deliveries of the same svix-id (advisory lock) so check-then-insert is atomic without a migration.
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${svixId}))`);
    return processEmailEventLocked(tx as unknown as AppDb, event, svixId);
  });
}

async function processEmailEventLocked(db: AppDb, event: z.infer<typeof emailEventSchema>, svixId: string): Promise<WebhookOutcome> {
  const type = event.type.toLowerCase();
  const data = event.data;
  const recipient = addr(data.to);

  if (type === "email.opened") return { handled: "ignored_open", matched: false };

  if (type === "email.received" || type === "reply" || type === "email.reply") {
    if (await hasSvixEvent(db, svixId)) return { handled: "reply", matched: true, duplicate: true };
    const from = addr(data.from);
    const msg = await messageByProvider(db, data);
    const lead = (await leadById(db, msg?.leadId)) ?? (await leadBySender(db, from));
    if (isUnsubscribeText(`${str(data.subject, 500)}\n${str(data.text, 5000)}`)) {
      // Suppress the sender even when no lead matches (alias / forward).
      if (from) await suppress(db, from, "baja por respuesta");
      if (lead) await applyOptOut(db, createOptOutToken(lead.id), undefined, "reply_text");
      return { handled: "unsubscribe", matched: !!lead, ...(lead ? { leadId: lead.id } : {}) };
    }
    if (!lead) return { handled: "reply", matched: false };
    // Only ids are stored: no sender names, no body (SPEC §8).
    await recordReply(db, lead, { manual: false, via: "email_inbound", svix_id: svixId, messageId: msg?.id ?? null }, { isMock: msg?.isMock ?? false });
    return { handled: "reply", matched: true, leadId: lead.id };
  }

  const msg = await messageByProvider(db, { email_id: data.email_id });
  const lead = await leadById(db, msg?.leadId);

  if (type === "email.bounced") {
    const hard = String(((data.bounce ?? {}) as Record<string, unknown>).type ?? "").toLowerCase() === "permanent";
    if (!hard) return { handled: "soft_bounce", matched: !!msg };
    const target = recipient ?? msg?.recipient ?? null;
    if (target) await suppress(db, target, "rebote duro");
    if (msg) await db.update(messages).set({ status: "failed" }).where(eq(messages.id, msg.id));
    return { handled: "hard_bounce", matched: !!msg, ...(lead ? { leadId: lead.id } : {}) };
  }

  if (type === "email.complained") {
    const target = recipient ?? msg?.recipient ?? null;
    if (target) await suppress(db, target, "queja de spam");
    if (lead) await applyOptOut(db, createOptOutToken(lead.id));
    return { handled: "complaint", matched: !!lead, ...(lead ? { leadId: lead.id } : {}) };
  }

  if (!msg || !lead) return { handled: type, matched: false };

  if (type === "email.delivered") {
    if (await hasSvixEvent(db, svixId)) return { handled: "delivered", matched: true, duplicate: true, leadId: lead.id };
    if (msg.status === "sent") await db.update(messages).set({ status: "delivered" }).where(eq(messages.id, msg.id));
    await db.insert(events).values({ leadId: lead.id, type: "delivered", payload: { messageId: msg.id, svix_id: svixId }, isDemo: lead.isDemo, isMock: msg.isMock });
    return { handled: "delivered", matched: true, leadId: lead.id };
  }

  if (type === "email.clicked") {
    if (await hasSvixEvent(db, svixId)) return { handled: "click", matched: true, duplicate: true, leadId: lead.id };
    await db.insert(events).values({ leadId: lead.id, type: "click", payload: { kind: "email_click", messageId: msg.id, svix_id: svixId }, isDemo: lead.isDemo, isMock: msg.isMock });
    return { handled: "click", matched: true, leadId: lead.id };
  }

  return { handled: type, matched: true, leadId: lead.id };
}
