import { and, desc, eq, exists, gte, inArray, isNotNull, lt, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { appSettings, companies, companySources, contactPoints, leads, messages } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { checkSendWindow } from "@/features/compliance/windows";
import { getSendWindow } from "@/features/settings/send-window";
import { bogotaDayStart } from "@/features/whatsapp/send";
import { getEnv } from "@/lib/env";
import { coldEligibility, enqueue, generalLeadEligibility, loadLeadContext, processQueue, type OutreachDeps } from "./service";

/**
 * F25 · Daily email run (Vercel Cron, L–S 9:00 Bogotá): up to `emailsPerDay` first emails to the best-scored leads
 * with an email, never twice to the same company. Off by default; the team turns it on.
 */
const KEY = "daily_outreach";

export const dailyOutreachInput = z.object({
  enabled: z.boolean(),
  emailsPerDay: z.number().int().min(1).max(100),
  /** null = every real hunt. */
  huntIds: z.array(z.uuid()).max(50).nullable().default(null),
});
export type DailyOutreachSetting = z.infer<typeof dailyOutreachInput>;

export interface DailyRunSummary {
  at: string;
  trigger: "cron" | "manual";
  skipped?: "disabled" | "outside_window" | "quota_reached" | "no_candidates";
  enqueued: number;
  sent: number;
  simulated: number;
  blocked: number;
  failed: number;
  sentToday: number;
  note?: string;
  /** F54 · How many of today's emails are the general services email. */
  general?: number;
  /** F48 · Candidates skipped before writing, by reason (sector_sin_oferta, sin_hallazgo, …). */
  skippedByReason?: Record<string, number>;
}

export interface StoredDailyOutreach {
  setting: DailyOutreachSetting;
  lastRun: DailyRunSummary | null;
}

const DEFAULT: DailyOutreachSetting = { enabled: false, emailsPerDay: 30, huntIds: null };

export async function getDailyOutreach(db: AppDb): Promise<StoredDailyOutreach> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY)).limit(1);
  const value = (row?.value ?? {}) as Record<string, unknown>;
  const parsed = dailyOutreachInput.safeParse(value.setting ?? value);
  return { setting: parsed.success ? parsed.data : DEFAULT, lastRun: (value.lastRun as DailyRunSummary | undefined) ?? null };
}

async function store(db: AppDb, v: StoredDailyOutreach): Promise<void> {
  const now = new Date();
  const value = { setting: v.setting, lastRun: v.lastRun } as unknown as Record<string, unknown>;
  await db.insert(appSettings).values({ key: KEY, value, updatedAt: now }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: now } });
}

export async function saveDailyOutreach(db: AppDb, input: unknown): Promise<DailyOutreachSetting> {
  const setting = dailyOutreachInput.parse(input);
  const cur = await getDailyOutreach(db);
  await store(db, { ...cur, setting });
  return setting;
}

/** Emails of today's batch (queued, in flight, sent or simulated), Bogotá day. */
export async function emailsToday(db: AppDb, now: Date): Promise<number> {
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.contactChannel, "email"), inArray(messages.status, ["queued", "sending", "sent", "delivered", "simulated"]), gte(messages.createdAt, bogotaDayStart(now)), lt(messages.createdAt, new Date(bogotaDayStart(now).getTime() + 86_400_000))));
  return rows.length;
}

/**
 * Best-scored leads with an email whose company never got a message. F41: natural persons and personal mailboxes
 * count too; on equal score, legal entities with a generic mailbox go first.
 */
export async function dailyCandidates(db: AppDb, setting: DailyOutreachSetting, limit: number, opts: { requireSite?: boolean } = {}): Promise<string[]> {
  // F48: cold email only to a legal entity's generic mailbox, with a website to review or a Google Maps listing.
  // F54: the general email (requireSite: false) does not need either.
  const placesChecked = exists(db.select({ id: companySources.id }).from(companySources).where(and(eq(companySources.companyId, companies.id), eq(companySources.sourceChannel, "google_places"), sql`${companySources.raw} ? 'place_id'`)));
  const conds = [eq(leads.status, "fit"), eq(leads.isDemo, false), eq(companies.isDemo, false), eq(companies.isLegalEntity, true), eq(contactPoints.isGeneric, true)];
  if (opts.requireSite !== false) conds.push(or(isNotNull(companies.website), placesChecked)!);
  if (setting.huntIds?.length) conds.push(inArray(leads.huntId, setting.huntIds));
  const touched = db
    .select({ companyId: leads.companyId })
    .from(messages)
    .innerJoin(leads, eq(leads.id, messages.leadId))
    .where(notInArray(messages.status, ["simulated", "draft"]));
  const rows = await db
    .select({ leadId: leads.id, companyId: companies.id })
    .from(leads)
    .innerJoin(companies, eq(companies.id, leads.companyId))
    .innerJoin(contactPoints, and(eq(contactPoints.companyId, companies.id), eq(contactPoints.type, "email")))
    .where(and(...conds, notInArray(companies.id, touched)))
    .orderBy(desc(leads.fitScore), desc(companies.isLegalEntity), desc(contactPoints.isGeneric), leads.createdAt)
    .limit(limit * 4);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.companyId)) continue;
    seen.add(r.companyId);
    out.push(r.leadId);
    if (out.length >= limit) break;
  }
  return out;
}

export async function runDailyOutreach(
  db: AppDb,
  deps: OutreachDeps,
  opts: { now?: Date; trigger?: "cron" | "manual"; concurrency?: number } = {},
): Promise<DailyRunSummary> {
  const now = opts.now ?? new Date();
  const env = deps.env ?? getEnv();
  const stored = await getDailyOutreach(db);
  const { setting } = stored;
  const summary: DailyRunSummary = { at: now.toISOString(), trigger: opts.trigger ?? "cron", enqueued: 0, sent: 0, simulated: 0, blocked: 0, failed: 0, sentToday: await emailsToday(db, now) };
  const finish = async (s: DailyRunSummary) => {
    await store(db, { setting, lastRun: s });
    return s;
  };
  if (!setting.enabled && summary.trigger === "cron") return finish({ ...summary, skipped: "disabled" });
  const win = checkSendWindow(now, "CO", (await getSendWindow(db)).setting);
  if (!win.allowed) return finish({ ...summary, skipped: "outside_window", note: win.reason });
  const remaining = setting.emailsPerDay - summary.sentToday;
  if (remaining <= 0) return finish({ ...summary, skipped: "quota_reached" });
  // F48: look further than the quota and keep only leads with a sector offer and a real finding.
  const pool = await dailyCandidates(db, setting, Math.min(remaining * 10, 1000));
  const candidates: string[] = [];
  const skippedByReason: Record<string, number> = {};
  for (const leadId of pool) {
    if (candidates.length >= remaining) break;
    const elig = coldEligibility(await loadLeadContext(db, leadId), now);
    if (elig.ok) candidates.push(leadId);
    else skippedByReason[elig.reason] = (skippedByReason[elig.reason] ?? 0) + 1;
  }
  // F54: fill the rest of the quota with the general services email (no finding), after the finding emails.
  if (candidates.length < remaining) {
    const general = await dailyCandidates(db, setting, Math.min((remaining - candidates.length) * 10, 1000), { requireSite: false });
    for (const leadId of general) {
      if (candidates.length >= remaining) break;
      if (candidates.includes(leadId)) continue;
      const ctx = await loadLeadContext(db, leadId);
      if (coldEligibility(ctx, now).ok) continue; // already considered above
      if (generalLeadEligibility(ctx).ok) {
        candidates.push(leadId);
        summary.general = (summary.general ?? 0) + 1;
      }
    }
  }
  if (Object.keys(skippedByReason).length) summary.skippedByReason = skippedByReason;
  if (!candidates.length) return finish({ ...summary, skipped: "no_candidates" });

  // Generate + enqueue a few at a time (each one is an AI call); stop once the quota is queued.
  const size = Math.max(1, opts.concurrency ?? 4);
  let queued = 0;
  for (let i = 0; i < candidates.length && queued < remaining; i += size) {
    const batch = candidates.slice(i, i + Math.min(size, remaining - queued));
    const results = await Promise.all(batch.map((leadId) => enqueue(db, { leadId, channel: "email" }, deps, now).catch(() => null)));
    for (const r of results) {
      if (r?.status === "queued") queued++;
      else summary.blocked++;
    }
  }
  summary.enqueued = queued;
  const q = await processQueue(db, deps, { now, limit: queued });
  summary.sent = q.sent;
  summary.simulated = q.simulated;
  summary.failed = q.failed;
  summary.blocked += q.blocked;
  summary.sentToday = await emailsToday(db, now);
  if (env.SEND_ENABLED !== true) summary.note = "SEND_ENABLED=false: los correos se simularon, no salió nada.";
  return finish(summary);
}
