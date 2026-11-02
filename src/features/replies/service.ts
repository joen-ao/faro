import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { companies, contactPoints, events, leads, messages } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { applyOptOut, createOptOutToken } from "@/features/compliance/optout";
import { suppress } from "@/features/compliance/suppression";
import { slugFromReplyAddress } from "@/features/outreach/generate";
import type { ReceivedEmail } from "@/integrations/email/inbound";

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
  const list = [...ids].slice(0, 30);
  const [m] = await db.select().from(messages).where(inArray(messages.providerId, list)).limit(1);
  if (m) return m;
  // A reply's In-Reply-To carries the RFC Message-ID of our email (saved from its `email.delivered` event).
  const [ev] = await db
    .select({ messageId: sql<string>`${events.payload}->>'messageId'` })
    .from(events)
    .where(and(eq(events.type, "delivered"), inArray(sql<string>`${events.payload}->>'rfc_id'`, list)))
    .limit(1);
  if (!ev?.messageId) return undefined;
  return (await db.select().from(messages).where(eq(messages.id, ev.messageId)).limit(1))[0];
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

/** F27 · what an inbound reply needs: read its content, know our reply domain, forward it to the team. */
export interface InboundDeps {
  replyDomain?: string;
  /** Reads the received email (text/html/headers); the webhook only carries metadata. */
  fetchReceived?: (id: string) => Promise<ReceivedEmail | null>;
  /** Forwards the reply to the team mailbox; absent = no forwarding. */
  forward?: (f: ForwardInput) => Promise<void>;
}

export interface ForwardInput {
  emailId: string;
  from: string;
  subject: string;
  text: string;
  html: string | null;
  company: string | null;
  outcome: string;
  /** Original recipients: a reply that already went to the team mailbox is never forwarded again. */
  to?: string[];
}

/** Processes one verified provider event. `svixId` makes reply/click/delivered writes idempotent. */
export async function processEmailEvent(db: AppDb, event: z.infer<typeof emailEventSchema>, svixId: string, deps: InboundDeps = {}): Promise<WebhookOutcome> {
  const inbound = ["email.received", "reply", "email.reply"].includes(event.type.toLowerCase());
  let received: ReceivedEmail | null = null;
  if (inbound && deps.fetchReceived && typeof event.data.email_id === "string") received = await deps.fetchReceived(event.data.email_id);
  // The webhook has no body or headers: merge them from the received email so matching and "baja" detection see them.
  const data = received
    ? { ...event.data, text: event.data.text ?? received.text, subject: event.data.subject ?? received.subject, headers: event.data.headers ?? received.headers, from: event.data.from ?? received.from }
    : event.data;
  // Serialize deliveries of the same svix-id (advisory lock) so check-then-insert is atomic without a migration.
  const out = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${svixId}))`);
    return processEmailEventLocked(tx as unknown as AppDb, { ...event, data }, svixId, deps.replyDomain);
  });
  if (inbound && deps.forward && !out.duplicate) {
    const from = addr(data.from) ?? "";
    const company = out.leadId
      ? ((await db.select({ name: companies.name }).from(leads).innerJoin(companies, eq(companies.id, leads.companyId)).where(eq(leads.id, out.leadId)).limit(1))[0]?.name ?? null)
      : null;
    await deps
      .forward({ emailId: str(data.email_id, 100), from, subject: str(data.subject, 300), text: str(data.text, 50_000), html: received?.html ?? null, company, outcome: out.handled, to: [...(received?.to ?? []), ...(Array.isArray(data.to) ? (data.to as unknown[]).filter((x): x is string => typeof x === "string") : [])] })
      .catch((e) => console.error("[replies] forward failed:", e instanceof Error ? e.message : e));
  }
  return out;
}

/** Lead named by the reply address r.<slug>@<replyDomain> (any of the recipients). */
async function leadByReplyAddress(db: AppDb, data: Record<string, unknown>, replyDomain: string | undefined) {
  if (!replyDomain) return undefined;
  const rcpts = [data.to, data.received_for, data.cc].flatMap((v) => (Array.isArray(v) ? v : typeof v === "string" ? [v] : []));
  for (const r of rcpts) {
    const a = addr(r);
    const slug = a ? slugFromReplyAddress(a, replyDomain) : null;
    if (slug) {
      const [lead] = await db.select().from(leads).where(eq(leads.slug, slug)).limit(1);
      if (lead) return lead;
    }
  }
  return undefined;
}

async function processEmailEventLocked(db: AppDb, event: z.infer<typeof emailEventSchema>, svixId: string, replyDomain?: string): Promise<WebhookOutcome> {
  const type = event.type.toLowerCase();
  const data = event.data;
  const recipient = addr(data.to);

  if (type === "email.opened") return { handled: "ignored_open", matched: false };

  if (type === "email.received" || type === "reply" || type === "email.reply") {
    if (await hasSvixEvent(db, svixId)) return { handled: "reply", matched: true, duplicate: true };
    const from = addr(data.from);
    const msg = await messageByProvider(db, data);
    const lead = (await leadByReplyAddress(db, data, replyDomain)) ?? (await leadById(db, msg?.leadId)) ?? (await leadBySender(db, from));
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
    // Keep the local part of the RFC Message-ID so a reply from any mailbox can be traced back by In-Reply-To.
    const rfc = /<?([^<>\s@]+)@/.exec(str(data.message_id, 500))?.[1];
    await db.insert(events).values({ leadId: lead.id, type: "delivered", payload: { messageId: msg.id, svix_id: svixId, ...(rfc ? { rfc_id: rfc } : {}) }, isDemo: lead.isDemo, isMock: msg.isMock });
    return { handled: "delivered", matched: true, leadId: lead.id };
  }

  if (type === "email.clicked") {
    if (await hasSvixEvent(db, svixId)) return { handled: "click", matched: true, duplicate: true, leadId: lead.id };
    await db.insert(events).values({ leadId: lead.id, type: "click", payload: { kind: "email_click", messageId: msg.id, svix_id: svixId }, isDemo: lead.isDemo, isMock: msg.isMock });
    return { handled: "click", matched: true, leadId: lead.id };
  }

  return { handled: type, matched: true, leadId: lead.id };
}
