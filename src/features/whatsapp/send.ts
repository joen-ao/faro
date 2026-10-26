import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { companies, companySources, contactPoints, costEntries, costRates, events, leads, messages, suppression } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { checkSendWindow } from "@/features/compliance/windows";
import { firstName, isPersonName } from "@/features/outreach/generate";
import { getSendWindow } from "@/features/settings/send-window";
import type { WaSender } from "@/integrations/whatsapp/dapta-flow";
import type { Env } from "@/lib/env";
import { pickTemplate, renderTemplate, waTemplates, type WaTemplate } from "./templates";

/**
 * F24 · WhatsApp first message through Dapta. Company WhatsApp/mobile first, then the personal mobile an
 * independent or a company registered in a public registry. One message per company in any channel, Ley 2300
 * window, suppression list, daily cap; SEND_ENABLED != true only simulates.
 */

export type PhoneKind = "whatsapp" | "empresa" | "personal";

export interface WaTarget {
  leadId: string;
  companyId: string;
  company: string;
  independent: boolean;
  phone: string;
  phoneKind: PhoneKind;
  template: WaTemplate;
  nombre: string;
  slug: string;
}

export interface WaSkip {
  leadId: string;
  company: string;
  rule: "no_mobile" | "already_contacted" | "suppressed" | "no_template";
  message: string;
}

export interface WaSelection {
  targets: WaTarget[];
  skipped: WaSkip[];
  window: { allowed: boolean; reason?: string; nextAllowedAt?: Date | null };
  dailyUsed: number;
  dailyLimit: number;
}

const SCAN_LIMIT = 3000;

/** Colombian mobile in E.164 (+573XXXXXXXXX) or null: WhatsApp never reaches a landline. */
export function colombianMobile(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("57")) d = d.slice(2);
  return /^3\d{9}$/.test(d) ? `+57${d}` : null;
}

const LEGAL_FORMS = /\b(s\.?\s?a\.?\s?s\.?|ltda\.?|s\.?\s?a\.?|e\.?\s?u\.?|en liquidacion|zomac|bic)(?=\s|$|[.,-])/gi;

/** {{nombre}}: an independent registered under their own name is greeted by first name; a company by its short name. */
export function waName(name: string, independent: boolean): string {
  if (independent && isPersonName(name)) return firstName(name);
  const short = name
    .replace(/\bsigla\b.*$/i, " ")
    .replace(LEGAL_FORMS, " ")
    .replace(/\b(ips|i\.p\.s\.?)(?=\s|$)/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/[\s.,:;-]+$/, "")
    .trim()
    .split(" ")
    .slice(0, 5)
    .join(" ");
  const title = short.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  return (title || name).slice(0, 60);
}

/** Start of today in Bogotá (UTC-5, no DST). */
export function bogotaDayStart(now: Date): Date {
  const local = new Date(now.getTime() - 5 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + 5 * 3600_000);
}

export async function whatsappSentToday(db: AppDb, now: Date): Promise<number> {
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.contactChannel, "whatsapp"), inArray(messages.status, ["sending", "sent", "delivered"]), gte(messages.createdAt, bogotaDayStart(now)), lt(messages.createdAt, new Date(bogotaDayStart(now).getTime() + 86_400_000))));
  return rows.length;
}

export interface SelectOptions {
  huntId?: string;
  leadIds?: string[];
  segment?: "empresas" | "independientes" | "all";
  limit?: number;
  now?: Date;
}

export async function selectWhatsappTargets(db: AppDb, env: Env, opts: SelectOptions = {}): Promise<WaSelection> {
  const now = opts.now ?? new Date();
  const templates = waTemplates(env);
  const conds = [eq(leads.status, "fit"), eq(leads.isDemo, false), eq(companies.isDemo, false)];
  if (opts.huntId) conds.push(eq(leads.huntId, opts.huntId));
  if (opts.leadIds?.length) conds.push(inArray(leads.id, opts.leadIds));
  if (opts.segment === "empresas") conds.push(eq(companies.isLegalEntity, true));
  if (opts.segment === "independientes") conds.push(eq(companies.isLegalEntity, false));
  const found = await db
    .select({ leadId: leads.id, slug: leads.slug, companyId: companies.id, name: companies.name, legal: companies.isLegalEntity })
    .from(leads)
    .innerJoin(companies, eq(companies.id, leads.companyId))
    .where(and(...conds))
    .orderBy(desc(leads.fitScore), leads.createdAt)
    .limit(SCAN_LIMIT);

  const ids = [...new Set(found.map((f) => f.companyId))];
  const chunks = <T,>(xs: T[], n = 500) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
  const points: { companyId: string; type: string; value: string; isGeneric: boolean }[] = [];
  const reps = new Set<string>();
  const contacted = new Set<string>();
  for (const part of chunks(ids)) {
    points.push(
      ...(await db
        .select({ companyId: contactPoints.companyId, type: contactPoints.type, value: contactPoints.value, isGeneric: contactPoints.isGeneric })
        .from(contactPoints)
        .where(and(inArray(contactPoints.companyId, part), inArray(contactPoints.type, ["whatsapp", "phone"])))),
    );
    for (const r of await db.select({ companyId: companySources.companyId }).from(companySources).where(and(inArray(companySources.companyId, part), eq(companySources.sourceChannel, "reps"))))
      reps.add(r.companyId);
    for (const r of await db
      .select({ companyId: leads.companyId })
      .from(messages)
      .innerJoin(leads, eq(leads.id, messages.leadId))
      .where(and(inArray(leads.companyId, part), inArray(messages.status, ["queued", "sending", "sent", "delivered"]))))
      contacted.add(r.companyId);
  }

  // Best mobile per company: published WhatsApp > company (generic) mobile > personal mobile from a registry.
  const best = new Map<string, { phone: string; kind: PhoneKind }>();
  const rank: Record<PhoneKind, number> = { whatsapp: 0, empresa: 1, personal: 2 };
  for (const p of points) {
    const phone = colombianMobile(p.value);
    if (!phone) continue;
    const kind: PhoneKind = p.type === "whatsapp" ? "whatsapp" : p.isGeneric ? "empresa" : "personal";
    const cur = best.get(p.companyId);
    if (!cur || rank[kind] < rank[cur.kind]) best.set(p.companyId, { phone, kind });
  }
  const phones = [...new Set([...best.values()].map((b) => b.phone))];
  const suppressed = new Set<string>();
  for (const part of chunks(phones)) for (const r of await db.select({ value: suppression.value }).from(suppression).where(inArray(suppression.value, part))) suppressed.add(r.value);

  const win = checkSendWindow(now, "CO", (await getSendWindow(db)).setting);
  const dailyLimit = Math.max(0, Math.floor(env.WHATSAPP_DAILY_LIMIT));
  const dailyUsed = await whatsappSentToday(db, now);
  const targets: WaTarget[] = [];
  const skipped: WaSkip[] = [];
  const seen = new Set<string>();
  const max = opts.limit ?? SCAN_LIMIT;
  for (const f of found) {
    if (seen.has(f.companyId)) continue;
    seen.add(f.companyId);
    const independent = !f.legal;
    const b = best.get(f.companyId);
    const skip = (rule: WaSkip["rule"], message: string) => skipped.push({ leadId: f.leadId, company: f.name, rule, message });
    if (!b) {
      skip("no_mobile", "Sin celular colombiano: WhatsApp no llega a un fijo.");
      continue;
    }
    if (contacted.has(f.companyId)) {
      skip("already_contacted", "Ya recibió un mensaje (correo o WhatsApp): máximo uno por empresa.");
      continue;
    }
    if (suppressed.has(b.phone)) {
      skip("suppressed", "El número pidió la baja: no se contacta nunca más.");
      continue;
    }
    const template = pickTemplate({ hasReps: reps.has(f.companyId), independent }, templates);
    if (!template) {
      skip("no_template", `Falta aprobar la plantilla ${independent ? "faro_diagnostico_independiente" : "faro_diagnostico_empresa"} en Dapta.`);
      continue;
    }
    if (targets.length < max) {
      targets.push({ leadId: f.leadId, companyId: f.companyId, company: f.name, independent, phone: b.phone, phoneKind: b.kind, template, nombre: waName(f.name, independent), slug: f.slug });
    }
  }
  return { targets, skipped, window: { allowed: win.allowed, reason: win.reason, nextAllowedAt: win.nextAllowedAt ?? null }, dailyUsed, dailyLimit };
}

export interface WaSendItem {
  leadId: string;
  company: string;
  outcome: "sent" | "simulated" | "failed" | "skipped";
  detail?: string;
}

export interface WaSendResult {
  ok: boolean;
  error?: string;
  sent: number;
  simulated: number;
  failed: number;
  remainingToday: number;
  items: WaSendItem[];
}

export async function sendWhatsapp(db: AppDb, env: Env, sender: WaSender | null, opts: SelectOptions & { now?: Date } = {}): Promise<WaSendResult> {
  const now = opts.now ?? new Date();
  const empty = (error: string): WaSendResult => ({ ok: false, error, sent: 0, simulated: 0, failed: 0, remainingToday: 0, items: [] });
  if (env.WHATSAPP_SEND_MODE !== "dapta_flow" || !sender) return empty("whatsapp_send_disabled");
  const sel = await selectWhatsappTargets(db, env, opts);
  if (!sel.window.allowed) return empty(`Fuera de ventana de envío: ${sel.window.reason ?? "cerrada"}.`);
  const live = env.SEND_ENABLED === true;
  let remaining = Math.max(0, sel.dailyLimit - sel.dailyUsed);
  const [rate] = await db.select().from(costRates).where(eq(costRates.key, "whatsapp_template")).limit(1);
  const usd = rate?.usd ?? 0.0125;
  const res: WaSendResult = { ok: true, sent: 0, simulated: 0, failed: 0, remainingToday: remaining, items: [] };
  for (const t of sel.targets) {
    if (live && remaining <= 0) {
      res.items.push({ leadId: t.leadId, company: t.company, outcome: "skipped", detail: `Tope diario de WhatsApp (${sel.dailyLimit}) alcanzado.` });
      continue;
    }
    const body = renderTemplate(t.template, t.nombre);
    const [lead] = await db.select({ huntId: leads.huntId, primarySource: leads.primarySource }).from(leads).where(eq(leads.id, t.leadId)).limit(1);
    if (!live) {
      await db.insert(messages).values({ leadId: t.leadId, contactChannel: "whatsapp", body, status: "simulated", recipient: t.phone, providerId: t.template.key, isMock: true, createdAt: now });
      res.simulated++;
      res.items.push({ leadId: t.leadId, company: t.company, outcome: "simulated", detail: "SEND_ENABLED=false: simulado, no salió nada." });
      continue;
    }
    // Reserve first: if the process dies after calling Dapta, the row stays in `sending` (manual review), never resent.
    const [msg] = await db
      .insert(messages)
      .values({ leadId: t.leadId, contactChannel: "whatsapp", body, status: "sending", recipient: t.phone, blockedByRule: null, createdAt: now })
      .returning({ id: messages.id });
    remaining--;
    const r = await sender.send({ toNumber: t.phone, templateId: t.template.daptaId!, nombre: t.nombre, slug: t.slug, leadId: t.leadId });
    if (!r.ok) {
      await db.update(messages).set({ status: "failed", blockedByRule: (r.error ?? "dapta_error").slice(0, 200) }).where(eq(messages.id, msg!.id));
      res.failed++;
      res.items.push({ leadId: t.leadId, company: t.company, outcome: "failed", detail: r.error });
      continue;
    }
    await db.update(messages).set({ status: "sent", sentAt: now, providerId: r.providerId ?? `dapta:${t.template.key}` }).where(eq(messages.id, msg!.id));
    await db.update(leads).set({ status: "contacted" }).where(and(eq(leads.id, t.leadId), eq(leads.status, "fit")));
    await db.insert(events).values({ leadId: t.leadId, type: "sent", payload: { messageId: msg!.id, providerId: r.providerId, channel: "whatsapp", template: t.template.key, phoneKind: t.phoneKind }, isMock: sender.isMock });
    await db.insert(costEntries).values({
      leadId: t.leadId,
      huntId: lead?.huntId ?? null,
      sourceChannel: lead?.primarySource ?? null,
      contactChannel: "whatsapp",
      category: "whatsapp",
      quantity: 1,
      unit: "template",
      rate: usd,
      usd,
      evidence: `whatsapp ${t.template.key} ${msg!.id}`,
      isMock: sender.isMock,
    });
    res.sent++;
    res.items.push({ leadId: t.leadId, company: t.company, outcome: "sent" });
  }
  res.remainingToday = remaining;
  return res;
}
