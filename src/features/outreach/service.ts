import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import {
  companies,
  companySources,
  contactPoints,
  costEntries,
  costRates,
  events,
  hunts,
  icpProfiles,
  leads,
  messages,
  workspaces,
} from "@/db/schema";
import type { AppDb, Company, CompanySource, ContactChannel, ContactPoint, Hunt, IcpProfile, Lead, Workspace } from "@/db/types";
import { evaluateOutreach, type BlockRule, type OutreachContact } from "@/features/compliance/evaluate";
import { isSuppressed } from "@/features/compliance/suppression";
import { checkSendWindow, type Country } from "@/features/compliance/windows";
import { dbCallRecorder, loadAiRates, recordAiCost } from "@/features/scoring/cost";
import { AiError, type AnthropicAdapter } from "@/integrations/anthropic";
import { EmailSendError, type EmailAdapter } from "@/integrations/email";
import { getEnv, type Env } from "@/lib/env";
import { channelOptions, optionFor, selectChannel, type ChannelOption } from "./channel";
import { buildLinks, generateMessage, textToHtml, type GeneratedMessage } from "./generate";

export type OutreachRule = BlockRule | "legal_unverified" | "missing_unsubscribe" | "no_channel" | "channel_unavailable" | "sender_incomplete";

export interface ServiceBlock {
  rule: OutreachRule;
  message: string;
  nextAllowedAt?: Date | null;
}

export interface OutreachDeps {
  ai: AnthropicAdapter;
  email: EmailAdapter;
  env?: Env;
}

export class OutreachError extends Error {
  constructor(
    message: string,
    public readonly status: 404 | 409 | 422,
  ) {
    super(message);
    this.name = "OutreachError";
  }
}

export interface LeadContext {
  lead: Lead;
  company: Company;
  hunt: Hunt | null;
  icp: IcpProfile | null;
  workspace: Workspace | null;
  contacts: ContactPoint[];
  sources: CompanySource[];
  country: Country;
  /** RUES/REPS confirm the legal nature; otherwise it is a name heuristic ("por verificar"). */
  legalVerified: boolean;
  allowUnverifiedLegal: boolean;
}

export interface Assessment {
  allowed: boolean;
  /** Nothing leaves (SEND_ENABLED != true). */
  simulated: boolean;
  blocks: ServiceBlock[];
  unverifiedLegal: boolean;
  note?: string;
  /** Only the send window blocks: it stays queued until the window opens. */
  deferrable: boolean;
  nextAllowedAt: Date | null;
}

const sendEnabled = (env: Env) => env.SEND_ENABLED === true;
const toCountry = (c: string | null | undefined): Country => (c?.toUpperCase() === "US" ? "US" : "CO");

export async function loadLeadContext(db: AppDb, leadId: string): Promise<LeadContext> {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) throw new OutreachError("Lead no encontrado", 404);
  const [company] = await db.select().from(companies).where(eq(companies.id, lead.companyId)).limit(1);
  if (!company) throw new OutreachError("Empresa del lead no encontrada", 404);
  const hunt = lead.huntId ? ((await db.select().from(hunts).where(eq(hunts.id, lead.huntId)).limit(1))[0] ?? null) : null;
  const icp = hunt ? ((await db.select().from(icpProfiles).where(eq(icpProfiles.id, hunt.icpProfileId)).limit(1))[0] ?? null) : null;
  const workspace = icp ? ((await db.select().from(workspaces).where(eq(workspaces.id, icp.workspaceId)).limit(1))[0] ?? null) : null;
  const [contacts, sources] = await Promise.all([
    db.select().from(contactPoints).where(eq(contactPoints.companyId, company.id)),
    db.select().from(companySources).where(eq(companySources.companyId, company.id)),
  ]);
  const criteria = (icp?.criteria ?? {}) as Record<string, unknown>;
  return {
    lead,
    company,
    hunt,
    icp,
    workspace,
    contacts,
    sources,
    country: toCountry(workspace?.country ?? (typeof criteria.country === "string" ? criteria.country : "CO")),
    legalVerified: sources.some((s) => s.sourceChannel === "rues" || s.sourceChannel === "reps"),
    allowUnverifiedLegal: criteria.allowUnverifiedLegal === true,
  };
}

function channelOpts(ctx: LeadContext, env: Env) {
  return { country: ctx.country, whatsappEnabled: env.WHATSAPP_ENABLED === true };
}

/** Another message of this company is queued/sent/delivered (simulated ones do not count: nothing left). */
async function companyAlreadyContacted(db: AppDb, companyId: string, excludeMessageId?: string): Promise<boolean> {
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(leads, eq(leads.id, messages.leadId))
    .where(
      and(
        eq(leads.companyId, companyId),
        inArray(messages.status, ["queued", "sending", "sent", "delivered"]),
        ...(excludeMessageId ? [ne(messages.id, excludeMessageId)] : []),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * The compliance gate: F09 `evaluateOutreach` + the F10 extras (unverified legal entity on real sends,
 * opt-out link present). Called when enqueuing AND again right before delivery.
 */
export async function assess(
  db: AppDb,
  ctx: LeadContext,
  channel: ContactChannel,
  value: string | null,
  now: Date,
  env: Env,
  extra: { excludeMessageId?: string; body?: string } = {},
): Promise<Assessment> {
  if (!value) {
    return {
      allowed: false,
      simulated: false,
      blocks: [{ rule: "no_channel", message: "El lead no tiene un contacto utilizable para este canal." }],
      unverifiedLegal: false,
      deferrable: false,
      nextAllowedAt: null,
    };
  }
  const contact: OutreachContact = { channel, value, isGeneric: ctx.contacts.find((c) => c.value === value)?.isGeneric ?? false };
  const suppressed = await isSuppressed(db, {
    ...(channel === "email" ? { email: value } : {}),
    ...(channel === "whatsapp" ? { phone: value } : {}),
    ...(ctx.company.website ? { domain: ctx.company.website } : {}),
  });
  const alreadyContacted = await companyAlreadyContacted(db, ctx.company.id, extra.excludeMessageId);
  const enabled = sendEnabled(env);
  const replyTo = env.EMAIL_REPLY_TO ?? ctx.workspace?.senderEmail ?? null;
  const ev = evaluateOutreach(
    { country: ctx.country, isLegalEntity: ctx.company.isLegalEntity, legalVerified: ctx.legalVerified, suppressed, alreadyContacted },
    contact,
    now,
    {
      sendEnabled: enabled,
      // Simulations do not need a real reply address; real sends do.
      senderIdentified: enabled ? !!replyTo : true,
      senderAddress: env.SENDER_ADDRESS ?? null,
    },
  );
  const blocks: ServiceBlock[] = ev.blocks.map((b) => ({ rule: b.rule, message: b.message, nextAllowedAt: b.nextAllowedAt ?? null }));
  if (channel === "whatsapp" && env.WHATSAPP_ENABLED !== true) {
    blocks.push({ rule: "channel_unavailable", message: "WhatsApp está desactivado (WHATSAPP_ENABLED=false)." });
  }
  if (enabled) {
    const missing = [
      ["EMAIL_FROM", env.EMAIL_FROM],
      ["SENDER_LEGAL_NAME", env.SENDER_LEGAL_NAME],
      ["SENDER_ADDRESS", env.SENDER_ADDRESS],
      ["EMAIL_REPLY_TO", replyTo],
    ].filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) {
      blocks.push({ rule: "sender_incomplete", message: `Envío real bloqueado: faltan datos del remitente (${missing.join(", ")}).` });
    }
  }
  const unverifiedLegal = ctx.company.isLegalEntity && !ctx.legalVerified;
  if (enabled && unverifiedLegal && !ctx.allowUnverifiedLegal) {
    blocks.push({
      rule: "legal_unverified",
      message: "Naturaleza jurídica por verificar (sin RUES/REPS): no se envía de verdad hasta confirmarla o permitirlo en el ICP.",
    });
  }
  if (extra.body !== undefined && channel === "email") {
    const links = buildLinks({ id: ctx.lead.id, slug: ctx.lead.slug, primarySource: ctx.lead.primarySource }, "email", value, env);
    if (!extra.body.includes(links.optOutUrl)) {
      blocks.push({ rule: "missing_unsubscribe", message: "El mensaje debe contener el enlace de baja exacto de este lead." });
    }
  }
  const timeBlock = blocks.find((b) => b.rule === "outside_window");
  const allowed = blocks.length === 0;
  const simulated = allowed && !enabled;
  return {
    allowed,
    simulated,
    blocks,
    unverifiedLegal,
    deferrable: blocks.length > 0 && blocks.every((b) => b.rule === "outside_window"),
    nextAllowedAt: timeBlock?.nextAllowedAt ?? null,
    ...(simulated ? { note: "SEND_ENABLED=false: envío simulado, no sale ningún mensaje." } : {}),
  };
}

/* ---------------------------------- preview ---------------------------------- */

export interface PreviewResult {
  leadId: string;
  company: { name: string; isDemo: boolean };
  channel: ContactChannel | null;
  recipient: string | null;
  options: ChannelOption[];
  assessment: Assessment;
  message: Pick<GeneratedMessage, "subject" | "text" | "html" | "diagnosticUrl" | "optOutUrl" | "sourceLabel" | "senderIdentified" | "replyTo"> | null;
  isMockAi: boolean;
  sendEnabled: boolean;
  window: { allowed: boolean; reason: string; nextAllowedAt: Date | null };
}

function resolveChannel(ctx: LeadContext, env: Env, wanted?: ContactChannel): { channel: ContactChannel | null; option: ChannelOption | null } {
  const opts = channelOpts(ctx, env);
  if (wanted) return { channel: wanted, option: optionFor(ctx.contacts, opts, wanted) };
  const auto = selectChannel(ctx.contacts, opts);
  if (auto) return { channel: auto.channel, option: auto };
  // No usable channel: surface the first unusable one so the block is explained.
  const first = optionFor(ctx.contacts, opts, "email") ?? null;
  return { channel: first ? first.channel : null, option: first };
}

const PREVIEW_TTL_MS = 10 * 60_000;
const previewCache = new Map<string, { at: number; message: NonNullable<PreviewResult["message"]>; isMockAi: boolean }>();
/** Test hook. */
export function clearPreviewCache() {
  previewCache.clear();
}

/** Builds the (editable) message and the live compliance verdict. `generate:false` only evaluates. */
export async function previewOutreach(
  db: AppDb,
  input: { leadId: string; channel?: ContactChannel; generate?: boolean; asOf?: string; refresh?: boolean },
  deps: OutreachDeps,
  nowArg: Date = new Date(),
): Promise<PreviewResult> {
  let now = nowArg;
  const env = deps.env ?? getEnv();
  const ctx = await loadLeadContext(db, input.leadId);
  if (input.asOf && ctx.lead.isDemo && ctx.company.isDemo) now = new Date(input.asOf);
  const { channel, option } = resolveChannel(ctx, env, input.channel);
  const options = channelOptions(ctx.contacts, channelOpts(ctx, env));
  const recipient = option?.value ?? null;
  const assessment = channel ? await assess(db, ctx, channel, recipient, now, env) : await assess(db, ctx, "email", null, now, env);

  let message: PreviewResult["message"] = null;
  let isMockAi = false;
  if (input.generate !== false && channel && recipient) {
    if (!ctx.icp || !ctx.workspace) throw new OutreachError("El lead no pertenece a una búsqueda con ICP y workspace", 422);
    // Draft cache per lead/channel/recipient: repeated previews do not spend AI again.
    const cacheKey = `${ctx.lead.id}|${channel}|${recipient}|${ctx.company.name}|${ctx.workspace.offerDescription ?? ""}`;
    const hit = previewCache.get(cacheKey);
    if (hit && !input.refresh && Date.now() - hit.at < PREVIEW_TTL_MS) {
      message = hit.message;
      isMockAi = hit.isMockAi;
    } else try {
      const g = await generateMessage(
        { id: ctx.lead.id, slug: ctx.lead.slug, primarySource: ctx.lead.primarySource },
        { name: ctx.company.name, city: ctx.company.city },
        { criteria: ctx.icp.criteria },
        { name: ctx.workspace.name, offerDescription: ctx.workspace.offerDescription, senderEmail: ctx.workspace.senderEmail, country: ctx.workspace.country },
        { ai: deps.ai, channel, recipient, env, recorder: dbCallRecorder(db, ctx.hunt?.id) },
      );
      await recordAiCost(db, {
        leadId: ctx.lead.id,
        huntId: ctx.hunt?.id ?? null,
        usage: g.usage,
        rates: await loadAiRates(db),
        isMock: g.isMock,
        evidence: `outreach_message ${g.model}`,
      });
      isMockAi = g.isMock;
      message = {
        subject: g.subject,
        text: g.text,
        html: g.html,
        diagnosticUrl: g.diagnosticUrl,
        optOutUrl: g.optOutUrl,
        sourceLabel: g.sourceLabel,
        senderIdentified: g.senderIdentified,
        replyTo: g.replyTo,
      };
      previewCache.set(cacheKey, { at: Date.now(), message, isMockAi });
    } catch (e) {
      if (e instanceof AiError) {
        // The (possibly billed) usage is never lost, even on failure.
        await recordAiCost(db, {
          leadId: ctx.lead.id,
          huntId: ctx.hunt?.id ?? null,
          usage: e.usage,
          rates: await loadAiRates(db),
          isMock: e.isMock,
          evidence: `outreach_message ${e.model} (fallo)`,
        });
      }
      throw e;
    }
  }
  return {
    leadId: ctx.lead.id,
    company: { name: ctx.company.name, isDemo: ctx.company.isDemo },
    channel,
    recipient,
    options,
    assessment,
    message,
    isMockAi,
    sendEnabled: sendEnabled(env),
    window: checkSendWindow(now, ctx.country),
  };
}

/** Re-injects what the law requires if an edit removed it: exact opt-out link, sender line and postal address. */
export function ensureCompliantBody(body: string, ctx: LeadContext, recipient: string, env: Env): string {
  const { optOutUrl } = buildLinks({ id: ctx.lead.id, slug: ctx.lead.slug, primarySource: ctx.lead.primarySource }, "email", recipient, env);
  let out = body.trimEnd();
  if (!out.includes(optOutUrl)) out += `\n\nSi no desea recibir mensajes nuestros, darse de baja toma un clic: ${optOutUrl}`;
  const who = [env.NEXT_PUBLIC_PRODUCT_NAME, "proyecto del 30X Hackathon", env.SENDER_LEGAL_NAME].filter(Boolean).join(" · ");
  const missingSender = !out.includes("30X Hackathon") || !out.includes(env.NEXT_PUBLIC_PRODUCT_NAME);
  const missingAddress = !!env.SENDER_ADDRESS && !out.includes(env.SENDER_ADDRESS);
  if (missingSender || missingAddress) out += `\n\n${[who, env.SENDER_ADDRESS].filter(Boolean).join(" · ")}`;
  return out;
}

/* ---------------------------------- enqueue ---------------------------------- */

export interface EnqueueInput {
  leadId: string;
  channel?: ContactChannel;
  subject?: string | null;
  /** Edited body from the preview. When omitted a message is generated. */
  body?: string | null;
}

export interface EnqueueResult {
  leadId: string;
  status: "queued" | "blocked";
  messageId: string | null;
  channel: ContactChannel | null;
  blocks: ServiceBlock[];
  note?: string;
}

/**
 * Compliance check #1. Outside the send window the message is still queued (it leaves when the window
 * opens); every other block stores the message as `blocked` with `bloqueado_por_regla`.
 */
export async function enqueue(db: AppDb, input: EnqueueInput, deps: OutreachDeps, now: Date = new Date()): Promise<EnqueueResult> {
  const env = deps.env ?? getEnv();
  const ctx = await loadLeadContext(db, input.leadId);
  const wanted = input.channel ?? "email";
  if (wanted !== "email") {
    // Only email goes through the queue: forms are assisted (/api/outreach/assisted), WhatsApp is F17.
    const message =
      wanted === "web_form"
        ? "El formulario web es asistido: usa el modo asistido (/api/outreach/assisted), no la cola."
        : "WhatsApp no está habilitado para la cola de envío todavía.";
    return { leadId: ctx.lead.id, status: "blocked", messageId: null, channel: wanted, blocks: [{ rule: "channel_unavailable", message }] };
  }
  const { channel, option } = resolveChannel(ctx, env, "email");
  const recipient = option?.value ?? null;

  const noChannel = (): EnqueueResult => ({
    leadId: ctx.lead.id,
    status: "blocked",
    messageId: null,
    channel,
    blocks: [{ rule: "no_channel", message: "El lead no tiene un contacto utilizable (correo genérico, formulario o WhatsApp activo)." }],
  });
  if (!channel || !recipient) return noChannel();

  const storeBlocked = async (blocks: ServiceBlock[], subject: string | null, body: string | null): Promise<EnqueueResult> => {
    // Do not litter the table with duplicates when the only reason is "ya contactada".
    if (blocks.every((b) => b.rule === "already_contacted")) return { leadId: ctx.lead.id, status: "blocked", messageId: null, channel, blocks };
    const [row] = await db
      .insert(messages)
      .values({
        leadId: ctx.lead.id,
        contactChannel: channel,
        subject,
        body: body ?? "(mensaje no generado: bloqueado por cumplimiento)",
        status: "blocked",
        recipient,
        blockedByRule: blocks.map((b) => b.rule).join(","),
        isMock: ctx.company.isDemo,
      })
      .returning({ id: messages.id });
    return { leadId: ctx.lead.id, status: "blocked", messageId: row!.id, channel, blocks };
  };

  // Gate first, so a blocked lead never costs an AI call. "Outside window" only defers.
  const pre = await assess(db, ctx, channel, recipient, now, env);
  const preBlocking = pre.blocks.filter((b) => b.rule !== "outside_window");
  if (preBlocking.length > 0) return storeBlocked(preBlocking, input.subject ?? null, input.body ?? null);

  let subject = input.subject ?? null;
  let body = input.body ?? null;
  if (!body || (channel === "email" && !subject)) {
    const p = await previewOutreach(db, { leadId: input.leadId, channel }, deps, now);
    subject = subject ?? p.message?.subject ?? null;
    body = body ?? p.message?.text ?? null;
  }
  if (!body) return storeBlocked([{ rule: "no_channel", message: "No se pudo generar el mensaje." }], subject, null);

  body = ensureCompliantBody(body, ctx, recipient, env);
  const a = await assess(db, ctx, channel, recipient, now, env, { body });
  const blocking = a.blocks.filter((b) => b.rule !== "outside_window");
  if (blocking.length > 0) return storeBlocked(blocking, subject, body);

  const [row] = await db
    .insert(messages)
    .values({
      leadId: ctx.lead.id,
      contactChannel: channel,
      subject,
      body,
      status: "queued",
      recipient,
      blockedByRule: a.deferrable ? "outside_window" : null,
      isMock: ctx.company.isDemo,
    })
    .returning({ id: messages.id });
  return {
    leadId: ctx.lead.id,
    status: "queued",
    messageId: row!.id,
    channel,
    blocks: a.blocks,
    ...(a.deferrable ? { note: `Fuera de ventana: saldrá cuando abra (${a.nextAllowedAt?.toISOString() ?? "próxima ventana"}).` } : {}),
  };
}

/* ------------------------------- process queue ------------------------------- */

export interface QueueItemResult {
  messageId: string;
  leadId: string;
  outcome: "sent" | "simulated" | "deferred" | "blocked" | "failed" | "skipped";
  detail?: string;
  nextAllowedAt?: Date | null;
}

export interface ProcessResult {
  now: Date;
  processed: number;
  sent: number;
  simulated: number;
  deferred: number;
  blocked: number;
  failed: number;
  remaining: number;
  items: QueueItemResult[];
}

export const DEFAULT_BATCH = 20;

async function emailRateUsd(db: AppDb): Promise<number> {
  const [r] = await db.select().from(costRates).where(eq(costRates.key, "email_per_message")).limit(1);
  return r?.usd ?? 0.0004;
}

/**
 * Compliance check #2 + delivery. Only email is delivered here (forms are assisted, WhatsApp is F17).
 * Nothing leaves unless `SEND_ENABLED === true` AND the window is open AND the contact is not suppressed.
 * Stops after `limit` non-deferred messages so a request stays well under 60 s.
 */
export async function processQueue(
  db: AppDb,
  deps: OutreachDeps,
  opts: { now?: Date; limit?: number; huntId?: string } = {},
): Promise<ProcessResult> {
  const env = deps.env ?? getEnv();
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? DEFAULT_BATCH;
  const queued = await db
    .select({ message: messages })
    .from(messages)
    .innerJoin(leads, eq(leads.id, messages.leadId))
    .where(and(eq(messages.status, "queued"), eq(messages.contactChannel, "email"), ...(opts.huntId ? [eq(leads.huntId, opts.huntId)] : [])))
    .orderBy(asc(messages.createdAt))
    .limit(500);

  const result: ProcessResult = { now, processed: 0, sent: 0, simulated: 0, deferred: 0, blocked: 0, failed: 0, remaining: 0, items: [] };
  const rate = await emailRateUsd(db);
  let worked = 0;
  for (const { message: m } of queued) {
    if (worked >= limit) {
      result.remaining++;
      continue;
    }
    const ctx = await loadLeadContext(db, m.leadId);
    const a = await assess(db, ctx, "email", m.recipient, now, env, { excludeMessageId: m.id, body: m.body });
    if (!a.allowed && a.deferrable) {
      await db.update(messages).set({ blockedByRule: "outside_window" }).where(eq(messages.id, m.id));
      result.deferred++;
      result.items.push({ messageId: m.id, leadId: m.leadId, outcome: "deferred", detail: a.blocks[0]?.message ?? "", nextAllowedAt: a.nextAllowedAt });
      continue;
    }
    // Atomic claim: only one worker can move queued -> sending (double click, retry, cron + UI).
    const claimed = await db.update(messages).set({ status: "sending", blockedByRule: null }).where(and(eq(messages.id, m.id), eq(messages.status, "queued"))).returning({ id: messages.id });
    if (claimed.length === 0) {
      result.items.push({ messageId: m.id, leadId: m.leadId, outcome: "skipped", detail: "Otro proceso ya reclamó este mensaje." });
      continue;
    }
    worked++;
    result.processed++;
    if (!a.allowed) {
      await db
        .update(messages)
        .set({ status: "blocked", blockedByRule: a.blocks.filter((b) => b.rule !== "outside_window").map((b) => b.rule).join(",") })
        .where(eq(messages.id, m.id));
      result.blocked++;
      result.items.push({ messageId: m.id, leadId: m.leadId, outcome: "blocked", detail: a.blocks.map((b) => b.message).join(" ") });
      continue;
    }

    if (!sendEnabled(env)) {
      // SEND_ENABLED != true: the adapter is never touched.
      await db.update(messages).set({ status: "simulated", blockedByRule: null, isMock: true }).where(eq(messages.id, m.id));
      await db.insert(events).values({
        leadId: m.leadId,
        type: "sent",
        payload: { simulated: true, messageId: m.id, channel: "email" },
        isDemo: ctx.lead.isDemo,
        isMock: true,
      });
      result.simulated++;
      result.items.push({ messageId: m.id, leadId: m.leadId, outcome: "simulated", detail: "SEND_ENABLED=false: simulado, no salió nada." });
      continue;
    }

    try {
      const links = buildLinks(
        { id: ctx.lead.id, slug: ctx.lead.slug, primarySource: ctx.lead.primarySource },
        "email",
        m.recipient,
        env,
      );
      const replyTo = env.EMAIL_REPLY_TO ?? ctx.workspace?.senderEmail ?? undefined;
      const sent = await deps.email.send({
        to: m.recipient!,
        from: env.EMAIL_FROM ?? "",
        ...(replyTo ? { replyTo } : {}),
        subject: (m.subject ?? "").replace(/[\r\n]+/g, " "),
        text: m.body,
        html: textToHtml(m.body),
        idempotencyKey: `faro-msg-${m.id}`,
        headers: {
          "List-Unsubscribe": [`<${links.oneClickUrl}>`, ...(replyTo ? [`<mailto:${replyTo}?subject=baja>`] : [])].join(", "),
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      const mock = deps.email.isMock;
      await db.update(messages).set({ status: "sent", providerId: sent.id, sentAt: now, blockedByRule: null, isMock: mock || ctx.company.isDemo }).where(eq(messages.id, m.id));
      await db.insert(events).values({
        leadId: m.leadId,
        type: "sent",
        payload: { messageId: m.id, providerId: sent.id, channel: "email" },
        isDemo: ctx.lead.isDemo,
        isMock: mock,
      });
      await db.insert(costEntries).values({
        leadId: m.leadId,
        huntId: ctx.lead.huntId,
        sourceChannel: ctx.lead.primarySource,
        contactChannel: "email",
        category: "email",
        quantity: 1,
        unit: "email",
        rate,
        usd: rate,
        evidence: `Correo ${sent.id}`,
        isDemo: ctx.lead.isDemo,
        isMock: mock,
      });
      if (ctx.lead.status === "found" || ctx.lead.status === "fit") {
        await db.update(leads).set({ status: "contacted" }).where(eq(leads.id, m.leadId));
      }
      result.sent++;
      result.items.push({ messageId: m.id, leadId: m.leadId, outcome: "sent", detail: sent.id });
    } catch (e) {
      // A definitive provider rejection is `failed`. Anything else (timeout, crash) may have been delivered:
      // the message stays `sending` for manual review and is never retried automatically.
      const definitive = e instanceof EmailSendError && e.status >= 400 && e.status < 500;
      if (definitive) await db.update(messages).set({ status: "failed" }).where(eq(messages.id, m.id));
      result.failed++;
      result.items.push({
        messageId: m.id,
        leadId: m.leadId,
        outcome: "failed",
        detail: `${e instanceof Error ? e.message : String(e)}${definitive ? "" : " (queda en 'sending' para revisión manual)"}`,
      });
    }
  }
  return result;
}

/* ------------------------------ assisted form ------------------------------ */

export interface AssistedInput {
  leadId: string;
  subject?: string | null;
  body: string;
  /** Minutes the person spent (copy text, open the form, submit). */
  minutes: number;
  note?: string | null;
}

export interface AssistedResult {
  status: "sent" | "simulated" | "blocked";
  messageId: string | null;
  blocks: ServiceBlock[];
  costUsd: number;
}

/**
 * "Marcar enviado" for the assisted web form: the person submitted the form themselves. Records the
 * message, the `sent` event and the human cost (minutes x HUMAN_MINUTE_RATE_USD, category `human`).
 * While SEND_ENABLED != true it is a practice run: status `simulated`, rows flagged mock.
 */
export async function recordAssistedSend(db: AppDb, input: AssistedInput, deps: OutreachDeps, now: Date = new Date()): Promise<AssistedResult> {
  const env = deps.env ?? getEnv();
  const ctx = await loadLeadContext(db, input.leadId);
  const form = ctx.contacts.find((c) => c.type === "web_form");
  const a = await assess(db, ctx, "web_form", form?.value ?? null, now, env);
  if (!a.allowed) return { status: "blocked", messageId: null, blocks: a.blocks, costUsd: 0 };

  const simulated = !sendEnabled(env);
  const [msg] = await db
    .insert(messages)
    .values({
      leadId: ctx.lead.id,
      contactChannel: "web_form",
      subject: input.subject ?? null,
      body: input.body,
      status: simulated ? "simulated" : "sent",
      recipient: form!.value,
      sentAt: simulated ? null : now,
      isMock: simulated || ctx.company.isDemo,
    })
    .returning({ id: messages.id });
  await db.insert(events).values({
    leadId: ctx.lead.id,
    type: "sent",
    payload: { assisted: true, simulated, minutes: input.minutes, note: input.note ?? null, messageId: msg!.id, channel: "web_form" },
    isDemo: ctx.lead.isDemo,
    isMock: simulated,
  });
  const rate = env.HUMAN_MINUTE_RATE_USD;
  const usd = Math.round(input.minutes * rate * 1e6) / 1e6;
  await db.insert(costEntries).values({
    leadId: ctx.lead.id,
    huntId: ctx.lead.huntId,
    sourceChannel: ctx.lead.primarySource,
    contactChannel: "web_form",
    category: "human",
    quantity: input.minutes,
    unit: "minute",
    rate,
    usd,
    evidence: `Formulario asistido: ${input.minutes} min × ${rate} USD/min`,
    isDemo: ctx.lead.isDemo,
    isMock: simulated,
  });
  if (!simulated && (ctx.lead.status === "found" || ctx.lead.status === "fit")) {
    await db.update(leads).set({ status: "contacted" }).where(eq(leads.id, ctx.lead.id));
  }
  return { status: simulated ? "simulated" : "sent", messageId: msg!.id, blocks: [], costUsd: usd };
}

/* --------------------------------- page data --------------------------------- */

export interface OutreachRow {
  leadId: string;
  name: string;
  city: string | null;
  isDemo: boolean;
  source: string;
  fitScore: number | null;
  status: string;
  options: ChannelOption[];
  suggested: ContactChannel | null;
  recipient: string | null;
  assessment: Assessment;
  latest: { status: string; channel: string; blockedByRule: string | null; subject: string | null; recipient: string | null; id: string } | null;
  formUrl: string | null;
}

export async function listOutreachRows(db: AppDb, huntId: string, env: Env, now: Date): Promise<OutreachRow[]> {
  // Profile leads (and anything already contacted) first; a short tail of the best "found" ones for context.
  // Each row costs several queries, so the list stays small enough to render well under the 60 s function limit.
  const rows = await db
    .select({ lead: leads.id })
    .from(leads)
    .where(eq(leads.huntId, huntId))
    .orderBy(sql`case when ${leads.status} = 'found' then 1 else 0 end`, desc(leads.fitScore))
    .limit(60);
  const out: OutreachRow[] = [];
  for (const { lead: leadId } of rows) {
    const ctx = await loadLeadContext(db, leadId);
    const opts = channelOpts(ctx, env);
    const options = channelOptions(ctx.contacts, opts);
    const { channel, option } = resolveChannel(ctx, env);
    const [latest] = await db.select().from(messages).where(eq(messages.leadId, leadId)).orderBy(desc(messages.createdAt)).limit(1);
    out.push({
      leadId,
      name: ctx.company.name,
      city: ctx.company.city,
      isDemo: ctx.company.isDemo || ctx.lead.isDemo,
      source: ctx.lead.primarySource,
      fitScore: ctx.lead.fitScore,
      status: ctx.lead.status,
      options,
      suggested: channel,
      recipient: option?.value ?? null,
      assessment: await assess(db, ctx, channel ?? "email", option?.value ?? null, now, env),
      latest: latest
        ? { id: latest.id, status: latest.status, channel: latest.contactChannel, blockedByRule: latest.blockedByRule, subject: latest.subject, recipient: latest.recipient }
        : null,
      formUrl: ctx.contacts.find((c) => c.type === "web_form")?.value ?? null,
    });
  }
  return out;
}
