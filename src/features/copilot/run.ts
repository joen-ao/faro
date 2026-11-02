import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { AppDb } from "@/db/types";
import { bogotaDate } from "@/features/ads/meta";
import type { Env } from "@/lib/env";
import type { MetaAdsAdapter } from "@/integrations/meta-ads";
import { adPerformance, type AdPerformance } from "./performance";
import { AUTOPILOT_ACTIONS, DEFAULT_SETTINGS, evaluateRules, type CopilotSettings, type Proposal, type ProposalAction } from "./rules";

const SETTINGS_KEY = "ads_copilot";
export const MIN_DAILY_BUDGET_COP = 20000;
const BUDGET_ACTIONS = ["lower_budget", "raise_budget"];

const cap = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.coerce.number().int().min(1000).max(100_000_000).nullable());
export const SettingsSchema = z.object({ mode: z.enum(["recommend", "autopilot"]), cplCap: cap, cpqlCap: cap });

export async function getCopilotSettings(db: AppDb): Promise<CopilotSettings> {
  const [row] = await db.select().from(s.appSettings).where(eq(s.appSettings.key, SETTINGS_KEY)).limit(1);
  const parsed = row ? SettingsSchema.safeParse(row.value) : null;
  return parsed?.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function saveCopilotSettings(db: AppDb, input: unknown): Promise<CopilotSettings> {
  const value = SettingsSchema.parse(input);
  const now = new Date();
  await db.insert(s.appSettings).values({ key: SETTINGS_KEY, value, updatedAt: now }).onConflictDoUpdate({ target: s.appSettings.key, set: { value, updatedAt: now } });
  return value;
}

/** Campaign ids created by the copilot. In mock mode the DEMO ones count, so the flow can be tried end to end. */
async function faroCampaignIds(db: AppDb, isMock: boolean): Promise<Set<string>> {
  const rows = await db.selectDistinct({ id: s.adVariants.campaignId }).from(s.adVariants).where(eq(s.adVariants.isDemo, isMock));
  return new Set(rows.map((r) => r.id));
}

async function lastBudgetChanges(db: AppDb): Promise<Map<string, Date>> {
  const rows = await db
    .select({ campaignId: s.adActions.campaignId, at: s.adActions.at })
    .from(s.adActions)
    .where(and(inArray(s.adActions.action, BUDGET_ACTIONS), eq(s.adActions.ok, true)))
    .orderBy(desc(s.adActions.at));
  const out = new Map<string, Date>();
  for (const r of rows) if (r.campaignId && !out.has(r.campaignId)) out.set(r.campaignId, r.at);
  return out;
}

const byAd = (rows: AdPerformance[]) => new Map(rows.map((r) => [r.adId, r]));

export interface EvaluateSummary {
  mode: CopilotSettings["mode"];
  proposed: number;
  autoApplied: number;
  expired: number;
  skipped: string[];
  isMock: boolean;
}

/**
 * Evaluates every rule, stores new proposals (one open proposal per rule + entity), expires the ones no longer true and,
 * in autopilot, executes only the spend-lowering ones.
 */
export async function evaluateCopilot(db: AppDb, ads: MetaAdsAdapter, env: Env, now = new Date()): Promise<EvaluateSummary> {
  const settings = await getCopilotSettings(db);
  const [campaigns, adSets, adList, ids, lastChange] = await Promise.all([ads.listCampaigns(), ads.listAdSets(), ads.listAds(), faroCampaignIds(db, ads.isMock), lastBudgetChanges(db)]);
  const [d3, d7, prev7, d14] = await Promise.all([
    adPerformance(db, bogotaDate(2, now)),
    adPerformance(db, bogotaDate(6, now)),
    adPerformance(db, bogotaDate(13, now), bogotaDate(7, now)),
    adPerformance(db, bogotaDate(13, now)),
  ]);
  const { proposals, skipped } = evaluateRules({
    settings,
    maxBudget: env.ADS_MAX_DAILY_BUDGET_COP,
    minBudget: MIN_DAILY_BUDGET_COP,
    campaigns,
    adSets,
    ads: adList,
    faroCampaignIds: ids,
    perf: { d3: byAd(d3), d7: byAd(d7), prev7: byAd(prev7), d14: byAd(d14) },
    lastBudgetChange: lastChange,
    now,
  });

  const open = await db.select().from(s.adRecommendations).where(and(eq(s.adRecommendations.status, "proposed"), eq(s.adRecommendations.isDemo, ads.isMock)));
  const key = (rule: string, entityId: string) => `${rule}|${entityId}`;
  const openByKey = new Map(open.map((r) => [key(r.rule, r.entityId), r]));
  const seen = new Set<string>();
  const fresh: string[] = [];
  for (const p of proposals) {
    const k = key(p.rule, p.entityId);
    seen.add(k);
    const existing = openByKey.get(k);
    if (existing) {
      await db.update(s.adRecommendations).set({ evidence: p.evidence, params: p.params, title: p.title }).where(eq(s.adRecommendations.id, existing.id));
      fresh.push(existing.id);
    } else {
      const [row] = await db.insert(s.adRecommendations).values({ ...p, isDemo: ads.isMock }).returning({ id: s.adRecommendations.id });
      fresh.push(row!.id);
    }
  }
  const stale = open.filter((r) => !seen.has(key(r.rule, r.entityId)));
  if (stale.length) await db.update(s.adRecommendations).set({ status: "expired", decidedAt: now }).where(inArray(s.adRecommendations.id, stale.map((r) => r.id)));

  let autoApplied = 0;
  if (settings.mode === "autopilot") {
    const candidates = await db.select().from(s.adRecommendations).where(and(inArray(s.adRecommendations.id, fresh.length ? fresh : ["00000000-0000-0000-0000-000000000000"]), eq(s.adRecommendations.requiresApproval, false)));
    for (const r of candidates.filter((c) => AUTOPILOT_ACTIONS.has(c.action as ProposalAction))) {
      const res = await applyRecommendation(db, ads, env, r.id, "autopilot", now);
      if (res.ok) autoApplied++;
    }
  }
  return { mode: settings.mode, proposed: proposals.length, autoApplied, expired: stale.length, skipped, isMock: ads.isMock };
}

export type ApplyResult = { ok: true; actionId: string } | { ok: false; error: string; message: string };

/** Executes one recommendation after re-checking every hard limit. The autopilot can never run approval-only actions. */
export async function applyRecommendation(db: AppDb, ads: MetaAdsAdapter, env: Env, id: string, actor: "autopilot" | "human", now = new Date()): Promise<ApplyResult> {
  const [rec] = await db.select().from(s.adRecommendations).where(eq(s.adRecommendations.id, id)).limit(1);
  if (!rec || rec.status !== "proposed") return { ok: false, error: "not_open", message: "La recomendación ya no está abierta." };
  if (rec.isDemo !== ads.isMock) return { ok: false, error: "mode_mismatch", message: "La recomendación es de otro modo (prueba/real)." };
  if (rec.action === "alert") {
    await db.update(s.adRecommendations).set({ status: "applied", appliedBy: actor, decidedAt: now }).where(eq(s.adRecommendations.id, id));
    return { ok: true, actionId: "" };
  }
  if (actor === "autopilot" && (rec.requiresApproval || !AUTOPILOT_ACTIONS.has(rec.action as ProposalAction))) {
    return { ok: false, error: "needs_human", message: "Esta acción sube gasto o cambia la estrategia: requiere aprobación humana." };
  }
  const p = rec.params as { adSetId?: string; fromBudget?: number; toBudget?: number; dailyBudget?: number };
  const raisesSpend = rec.action === "raise_budget" || rec.action === "activate_campaign";
  if (raisesSpend && !env.ADS_SPEND_ENABLED) return { ok: false, error: "spend_disabled", message: "Subir gasto está bloqueado: ADS_SPEND_ENABLED=false." };
  if (rec.action === "raise_budget" && (p.toBudget ?? Infinity) > env.ADS_MAX_DAILY_BUDGET_COP) return { ok: false, error: "over_budget", message: "El nuevo presupuesto supera ADS_MAX_DAILY_BUDGET_COP." };
  if (rec.action === "activate_campaign" && (p.dailyBudget ?? Infinity) > env.ADS_MAX_DAILY_BUDGET_COP) return { ok: false, error: "over_budget", message: "El presupuesto de la campaña supera ADS_MAX_DAILY_BUDGET_COP." };
  if (BUDGET_ACTIONS.includes(rec.action) && rec.campaignId) {
    const last = (await lastBudgetChanges(db)).get(rec.campaignId);
    if (last && now.getTime() - last.getTime() < 24 * 3_600_000) return { ok: false, error: "too_soon", message: "Ya hubo un cambio de presupuesto en las últimas 24 h." };
  }
  // The entity must still be what the rule saw.
  if (BUDGET_ACTIONS.includes(rec.action)) {
    const set = (await ads.listAdSets()).find((x) => x.id === p.adSetId);
    if (!set || set.dailyBudget !== p.fromBudget) return expire(db, id, now, "El presupuesto cambió desde la recomendación.");
  }
  if (rec.action === "pause_ad") {
    const ad = (await ads.listAds()).find((x) => x.id === rec.entityId);
    if (!ad || ad.status !== "ACTIVE") return expire(db, id, now, "El anuncio ya no está activo.");
  }

  let before: Record<string, unknown> = {};
  let after: Record<string, unknown> = {};
  let error: string | null = null;
  try {
    if (rec.action === "pause_ad") {
      before = { status: "ACTIVE" };
      after = { status: "PAUSED" };
      await ads.setAdStatus(rec.entityId, "PAUSED");
    } else if (BUDGET_ACTIONS.includes(rec.action)) {
      before = { dailyBudget: p.fromBudget, adSetId: p.adSetId };
      after = { dailyBudget: p.toBudget, adSetId: p.adSetId };
      await ads.setAdSetBudget(p.adSetId!, p.toBudget!);
    } else if (rec.action === "activate_campaign") {
      before = { status: "PAUSED" };
      after = { status: "ACTIVE" };
      await ads.setCampaignStatus(rec.entityId, "ACTIVE");
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const [action] = await db
    .insert(s.adActions)
    .values({ recommendationId: id, actor, action: rec.action, entityType: rec.entityType, entityId: rec.entityId, campaignId: rec.campaignId, before, after, ok: !error, error, isDemo: ads.isMock, at: now })
    .returning({ id: s.adActions.id });
  await db.update(s.adRecommendations).set({ status: error ? "failed" : "applied", appliedBy: actor, decidedAt: now }).where(eq(s.adRecommendations.id, id));
  return error ? { ok: false, error: "meta_error", message: error } : { ok: true, actionId: action!.id };
}

async function expire(db: AppDb, id: string, now: Date, message: string): Promise<ApplyResult> {
  await db.update(s.adRecommendations).set({ status: "expired", decidedAt: now }).where(eq(s.adRecommendations.id, id));
  return { ok: false, error: "stale", message };
}

export async function dismissRecommendation(db: AppDb, id: string, now = new Date()): Promise<boolean> {
  const res = await db
    .update(s.adRecommendations)
    .set({ status: "dismissed", appliedBy: "human", decidedAt: now })
    .where(and(eq(s.adRecommendations.id, id), eq(s.adRecommendations.status, "proposed")))
    .returning({ id: s.adRecommendations.id });
  return res.length > 0;
}

/** Human-only undo. Undoing a pause or a budget cut raises spend, so it goes through the same spend guardrails. */
export async function revertAction(db: AppDb, ads: MetaAdsAdapter, env: Env, actionId: string, now = new Date()): Promise<ApplyResult> {
  const [a] = await db.select().from(s.adActions).where(eq(s.adActions.id, actionId)).limit(1);
  if (!a || !a.ok || a.revertOf) return { ok: false, error: "not_revertible", message: "Esta acción no se puede revertir." };
  const [already] = await db.select({ id: s.adActions.id }).from(s.adActions).where(and(eq(s.adActions.revertOf, actionId), eq(s.adActions.ok, true))).limit(1);
  if (already) return { ok: false, error: "already_reverted", message: "Ya se revirtió." };
  const before = a.before as { status?: string; dailyBudget?: number; adSetId?: string };
  const raises = a.action === "pause_ad" || a.action === "lower_budget";
  if (raises && !env.ADS_SPEND_ENABLED) return { ok: false, error: "spend_disabled", message: "Revertir sube gasto y ADS_SPEND_ENABLED=false." };
  if (a.action === "lower_budget" && (before.dailyBudget ?? Infinity) > env.ADS_MAX_DAILY_BUDGET_COP) return { ok: false, error: "over_budget", message: "El presupuesto anterior supera el tope." };
  let error: string | null = null;
  try {
    if (a.action === "pause_ad") await ads.setAdStatus(a.entityId, "ACTIVE");
    else if (a.action === "lower_budget" || a.action === "raise_budget") await ads.setAdSetBudget(before.adSetId!, before.dailyBudget!);
    else if (a.action === "activate_campaign" || a.action === "pause_campaign") await ads.setCampaignStatus(a.entityId, a.action === "activate_campaign" ? "PAUSED" : "ACTIVE");
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const [row] = await db
    .insert(s.adActions)
    .values({ actor: "human", action: `revert_${a.action}`, entityType: a.entityType, entityId: a.entityId, campaignId: a.campaignId, before: a.after, after: a.before, ok: !error, error, revertOf: a.id, isDemo: a.isDemo, at: now })
    .returning({ id: s.adActions.id });
  return error ? { ok: false, error: "meta_error", message: error } : { ok: true, actionId: row!.id };
}

/** Panic button: pauses every campaign the copilot created. Always allowed (it only lowers spend). */
export async function pauseAllFaroCampaigns(db: AppDb, ads: MetaAdsAdapter, now = new Date()): Promise<{ paused: number; failed: number }> {
  const ids = await faroCampaignIds(db, ads.isMock);
  const live = (await ads.listCampaigns()).filter((c) => ids.has(c.id) && c.status === "ACTIVE");
  let failed = 0;
  for (const c of live) {
    let error: string | null = null;
    try {
      await ads.setCampaignStatus(c.id, "PAUSED");
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      failed++;
    }
    await db.insert(s.adActions).values({ actor: "human", action: "pause_campaign", entityType: "campaign", entityId: c.id, campaignId: c.id, before: { status: "ACTIVE" }, after: { status: "PAUSED" }, ok: !error, error, isDemo: ads.isMock, at: now });
  }
  return { paused: live.length - failed, failed };
}

export async function listRecommendations(db: AppDb, isDemo: boolean, sinceDays = 30, now = new Date()) {
  const since = new Date(now.getTime() - sinceDays * 86_400_000);
  return db
    .select()
    .from(s.adRecommendations)
    .where(and(eq(s.adRecommendations.isDemo, isDemo), gte(s.adRecommendations.createdAt, since)))
    .orderBy(desc(s.adRecommendations.createdAt))
    .limit(100);
}

export async function listActions(db: AppDb, isDemo: boolean, limit = 50) {
  return db.select().from(s.adActions).where(eq(s.adActions.isDemo, isDemo)).orderBy(desc(s.adActions.at)).limit(limit);
}

export type { Proposal };
