import { and, eq, inArray } from "drizzle-orm";
import { companies, events, leads, messages } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { emailsToday, getDailyOutreach } from "@/features/outreach/daily";
import { bogotaDayStart, whatsappSentToday } from "@/features/whatsapp/send";
import { getEnv } from "@/lib/env";

/**
 * F26 · Prospecting metrics: who we wrote to, by which channel, who opened the diagnostic, replied, opted out or
 * qualified. Counts companies (not messages) and only real data (no demo leads, no mock messages/events).
 */
export type OutreachChannel = "email" | "whatsapp" | "manual";
export const OUTREACH_CHANNELS: readonly OutreachChannel[] = ["email", "whatsapp", "manual"];

export interface ChannelStats {
  contacted: number;
  opened: number;
  replied: number;
  optedOut: number;
  qualified: number;
  simulated: number;
  failed: number;
  queued: number;
  openRate: number | null;
  replyRate: number | null;
}

export interface OutreachDay {
  /** yyyy-mm-dd, Bogotá */
  day: string;
  sent: number;
  opened: number;
  replied: number;
}

export interface OutreachMetrics {
  totals: ChannelStats;
  byChannel: Record<OutreachChannel, ChannelStats>;
  days: OutreachDay[];
  recentReplies: { company: string; channel: OutreachChannel; via: string | null; at: string }[];
  today: { emails: number; emailsPerDay: number; dailyEnabled: boolean; whatsapp: number; whatsappLimit: number };
}

const empty = (): ChannelStats => ({ contacted: 0, opened: 0, replied: 0, optedOut: 0, qualified: 0, simulated: 0, failed: 0, queued: 0, openRate: null, replyRate: null });
const rate = (k: number, n: number) => (n > 0 ? Math.round((k / n) * 1000) / 10 : null);
const bogotaDay = (d: Date) => new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 10);

export async function getOutreachMetrics(db: AppDb, opts: { now?: Date; days?: number } = {}): Promise<OutreachMetrics> {
  const now = opts.now ?? new Date();
  const nDays = opts.days ?? 14;
  const msgs = await db
    .select({ id: messages.id, channel: messages.contactChannel, status: messages.status, sentAt: messages.sentAt, createdAt: messages.createdAt, companyId: leads.companyId, leadStatus: leads.status })
    .from(messages)
    .innerJoin(leads, eq(leads.id, messages.leadId))
    .where(and(eq(leads.isDemo, false), eq(messages.isMock, false)));
  const evs = await db
    .select({ type: events.type, payload: events.payload, at: events.at, companyId: leads.companyId, company: companies.name })
    .from(events)
    .innerJoin(leads, eq(leads.id, events.leadId))
    .innerJoin(companies, eq(companies.id, leads.companyId))
    .where(and(eq(events.isDemo, false), eq(events.isMock, false), inArray(events.type, ["sent", "click", "widget_open", "reply", "opt_out"])));
  const qualifiedRows = await db.select({ companyId: leads.companyId }).from(leads).where(and(eq(leads.isDemo, false), eq(leads.status, "qualified")));
  const qualifiedSet = new Set(qualifiedRows.map((r) => r.companyId));

  const manualIds = new Set(
    evs.filter((e) => e.type === "sent" && (e.payload as Record<string, unknown>).manual === true).map((e) => String((e.payload as Record<string, unknown>).messageId ?? "")),
  );
  const bucket = (m: { id: string; channel: string }): OutreachChannel => (manualIds.has(m.id) || m.channel === "web_form" ? "manual" : m.channel === "whatsapp" ? "whatsapp" : "email");

  const byChannel = Object.fromEntries(OUTREACH_CHANNELS.map((c) => [c, empty()])) as Record<OutreachChannel, ChannelStats>;
  // First real contact per company: its channel and time (later opens/replies are credited to it).
  const first = new Map<string, { channel: OutreachChannel; at: Date }>();
  const daysMap = new Map<string, OutreachDay>();
  const start = bogotaDayStart(new Date(now.getTime() - (nDays - 1) * 86_400_000));
  for (let i = 0; i < nDays; i++) {
    const d = bogotaDay(new Date(start.getTime() + i * 86_400_000 + 6 * 3600_000));
    daysMap.set(d, { day: d, sent: 0, opened: 0, replied: 0 });
  }
  for (const m of msgs) {
    const ch = bucket(m);
    if (m.status === "simulated") byChannel[ch].simulated++;
    else if (m.status === "failed") byChannel[ch].failed++;
    else if (m.status === "queued" || m.status === "sending") byChannel[ch].queued++;
    if (m.status !== "sent" && m.status !== "delivered") continue;
    const at = m.sentAt ?? m.createdAt;
    const cur = first.get(m.companyId);
    if (!cur || at < cur.at) first.set(m.companyId, { channel: ch, at });
    const day = daysMap.get(bogotaDay(at));
    if (day) day.sent++;
  }
  for (const [, f] of first) byChannel[f.channel].contacted++;

  const opened = new Set<string>();
  const replied = new Set<string>();
  const opted = new Set<string>();
  const replies: OutreachMetrics["recentReplies"] = [];
  for (const e of evs) {
    const f = first.get(e.companyId);
    const p = e.payload as Record<string, unknown>;
    const isOpen = e.type === "widget_open" || (e.type === "click" && p.kind === "page_view");
    if (isOpen && f && e.at >= f.at && !opened.has(e.companyId)) {
      opened.add(e.companyId);
      byChannel[f.channel].opened++;
      const day = daysMap.get(bogotaDay(e.at));
      if (day) day.opened++;
    }
    if (e.type === "reply") {
      const ch = f?.channel ?? "email";
      if (!replied.has(e.companyId)) {
        replied.add(e.companyId);
        byChannel[ch].replied++;
        const day = daysMap.get(bogotaDay(e.at));
        if (day) day.replied++;
      }
      replies.push({ company: e.company, channel: ch, via: typeof p.via === "string" ? p.via : null, at: e.at.toISOString() });
    }
    if (e.type === "opt_out" && f && !opted.has(e.companyId)) {
      opted.add(e.companyId);
      byChannel[f.channel].optedOut++;
    }
  }
  for (const [companyId, f] of first) if (qualifiedSet.has(companyId)) byChannel[f.channel].qualified++;

  const totals = empty();
  for (const c of OUTREACH_CHANNELS) {
    const s = byChannel[c];
    s.openRate = rate(s.opened, s.contacted);
    s.replyRate = rate(s.replied, s.contacted);
    for (const k of ["contacted", "opened", "replied", "optedOut", "qualified", "simulated", "failed", "queued"] as const) totals[k] += s[k];
  }
  totals.openRate = rate(totals.opened, totals.contacted);
  totals.replyRate = rate(totals.replied, totals.contacted);

  const env = getEnv();
  const daily = await getDailyOutreach(db);
  return {
    totals,
    byChannel,
    days: [...daysMap.values()],
    recentReplies: replies.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10),
    today: {
      emails: await emailsToday(db, now),
      emailsPerDay: daily.setting.emailsPerDay,
      dailyEnabled: daily.setting.enabled,
      whatsapp: await whatsappSentToday(db, now),
      whatsappLimit: env.WHATSAPP_DAILY_LIMIT,
    },
  };
}
