import type { MetaAd, MetaAdSet, MetaCampaign } from "@/integrations/meta-ads";
import type { AdPerformance } from "./performance";

/**
 * F29-B · Deterministic rules from the playbook (docs/research/meta-ads-playbook-2026.md §4).
 * Pure functions: same inputs, same proposals. The model never decides thresholds.
 * Only campaigns created by Faro are evaluated; everything else in the account is left alone.
 */

export type ProposalAction = "pause_ad" | "lower_budget" | "raise_budget" | "activate_campaign" | "alert";

export interface CopilotSettings {
  mode: "recommend" | "autopilot";
  /** Target cost per lead / per qualified lead, in account currency (COP). null = rules that need it are skipped. */
  cplCap: number | null;
  cpqlCap: number | null;
}

export const DEFAULT_SETTINGS: CopilotSettings = { mode: "recommend", cplCap: null, cpqlCap: null };

export interface Proposal {
  rule: string;
  action: ProposalAction;
  entityType: "ad" | "adset" | "campaign";
  entityId: string;
  campaignId: string;
  title: string;
  params: Record<string, unknown>;
  evidence: Record<string, unknown>;
  /** true when it raises spend or changes strategy: never executed by the autopilot. */
  requiresApproval: boolean;
}

export interface RuleContext {
  settings: CopilotSettings;
  maxBudget: number;
  minBudget: number;
  campaigns: MetaCampaign[];
  adSets: MetaAdSet[];
  ads: MetaAd[];
  faroCampaignIds: Set<string>;
  /** Per-ad performance by window: last 3, last 7, the 7 before those, last 14 days. */
  perf: { d3: Map<string, AdPerformance>; d7: Map<string, AdPerformance>; prev7: Map<string, AdPerformance>; d14: Map<string, AdPerformance> };
  /** Last budget change per campaign (from ad_actions). */
  lastBudgetChange: Map<string, Date>;
  now: Date;
}

export const THRESHOLDS = {
  stopLossDays: 3,
  stopLossCapMultiple: 2,
  ctrMinImpressions: 5000,
  ctrLeaderRatio: 0.5,
  fatigueFrequency: 3,
  fatigueCtrDrop: 0.2,
  fatigueMinImpressions: 1000,
  cpqlHighMultiple: 1.5,
  budgetStep: 0.2,
  daysBetweenBudgetChanges: 7,
  scaleMinQualified14: 5,
} as const;

const ACTIVE = (a: MetaAd) => a.effectiveStatus === "ACTIVE" || a.status === "ACTIVE";
const days = (a: Date, b: Date) => (a.getTime() - b.getTime()) / 86_400_000;
const round = (n: number) => Math.round(n / 100) * 100;

type Agg = { spend: number; leads: number; qualified: number };
function campaignAgg(ads: MetaAd[], perf: Map<string, AdPerformance>, campaignId: string): Agg {
  return ads
    .filter((a) => a.campaignId === campaignId)
    .reduce<Agg>(
      (acc, a) => {
        const p = perf.get(a.id);
        return p ? { spend: acc.spend + p.spendLocal, leads: acc.leads + p.leads, qualified: acc.qualified + p.qualified } : acc;
      },
      { spend: 0, leads: 0, qualified: 0 },
    );
}

export function evaluateRules(ctx: RuleContext): { proposals: Proposal[]; skipped: string[] } {
  const out: Proposal[] = [];
  const skipped: string[] = [];
  const { settings: st } = ctx;
  if (st.cplCap === null) skipped.push("Sin CPL objetivo: no corre el stop-loss por falta de leads.");
  if (st.cpqlCap === null) skipped.push("Sin CPQL objetivo: no corren el stop-loss por calidad, la baja de presupuesto ni el escalado.");

  const faroAds = ctx.ads.filter((a) => ctx.faroCampaignIds.has(a.campaignId));
  const pausedThisRun = new Set<string>();
  const activeLeft = (campaignId: string) => faroAds.filter((a) => a.campaignId === campaignId && ACTIVE(a) && !pausedThisRun.has(a.id)).length;
  const pause = (a: MetaAd, rule: string, title: string, evidence: Record<string, unknown>) => {
    if (pausedThisRun.has(a.id) || activeLeft(a.campaignId) <= 1) return; // never leave a campaign without ads
    pausedThisRun.add(a.id);
    out.push({ rule, action: "pause_ad", entityType: "ad", entityId: a.id, campaignId: a.campaignId, title, params: {}, evidence, requiresApproval: false });
  };

  for (const a of faroAds) {
    if (["DISAPPROVED", "WITH_ISSUES"].includes(a.effectiveStatus)) {
      out.push({ rule: "R-rechazo", action: "alert", entityType: "ad", entityId: a.id, campaignId: a.campaignId, title: `Meta marcó el anuncio "${a.name}" como ${a.effectiveStatus}`, params: {}, evidence: { effectiveStatus: a.effectiveStatus }, requiresApproval: false });
    }
    if (!ACTIVE(a)) continue;
    const p3 = ctx.perf.d3.get(a.id);
    if (st.cplCap !== null && p3 && p3.days >= THRESHOLDS.stopLossDays && p3.spendLocal >= THRESHOLDS.stopLossCapMultiple * st.cplCap && p3.leads === 0) {
      pause(a, "R-stoploss", `Pausar "${a.name}": gastó ${Math.round(p3.spendLocal)} en 3 días sin leads`, { window: "3d", spend: p3.spendLocal, leads: 0, cplCap: st.cplCap, days: p3.days });
      continue;
    }
    const p14 = ctx.perf.d14.get(a.id);
    if (st.cpqlCap !== null && p14 && p14.spendLocal >= THRESHOLDS.stopLossCapMultiple * st.cpqlCap && p14.qualified === 0) {
      pause(a, "R-calidad", `Pausar "${a.name}": gastó ${Math.round(p14.spendLocal)} en 14 días sin leads calificados`, { window: "14d", spend: p14.spendLocal, leads: p14.leads, qualified: 0, cpqlCap: st.cpqlCap });
      continue;
    }
    const p7 = ctx.perf.d7.get(a.id);
    const prev = ctx.perf.prev7.get(a.id);
    if (
      p7 && prev && p7.ctr !== null && prev.ctr !== null && p7.frequency > THRESHOLDS.fatigueFrequency &&
      p7.impressions >= THRESHOLDS.fatigueMinImpressions && prev.impressions >= THRESHOLDS.fatigueMinImpressions &&
      p7.ctr <= (1 - THRESHOLDS.fatigueCtrDrop) * prev.ctr
    ) {
      out.push({ rule: "R-fatiga", action: "alert", entityType: "ad", entityId: a.id, campaignId: a.campaignId, title: `Fatiga en "${a.name}": frecuencia ${p7.frequency.toFixed(1)} y CTR en caída; prepara un concepto nuevo`, params: {}, evidence: { frequency: p7.frequency, ctr7: p7.ctr, ctrPrev7: prev.ctr, impressions7: p7.impressions }, requiresApproval: false });
    }
  }

  // CTR loser vs the campaign leader (14 days, only with enough impressions, never an ad with qualified leads).
  for (const campaignId of ctx.faroCampaignIds) {
    const ready = faroAds.filter((a) => a.campaignId === campaignId && ACTIVE(a)).map((a) => ({ a, p: ctx.perf.d14.get(a.id) })).filter((x) => x.p && x.p.impressions >= THRESHOLDS.ctrMinImpressions && x.p.ctr !== null);
    if (ready.length < 2) continue;
    const leader = ready.reduce((m, x) => (x.p!.ctr! > m.p!.ctr! ? x : m));
    for (const { a, p } of ready) {
      if (a.id === leader.a.id || p!.qualified > 0) continue;
      if (p!.ctr! < THRESHOLDS.ctrLeaderRatio * leader.p!.ctr! && p!.ctrInterval && p!.ctrInterval.high < leader.p!.ctr!) {
        pause(a, "R-ctr", `Pausar "${a.name}": CTR ${(p!.ctr! * 100).toFixed(2)} % frente a ${(leader.p!.ctr! * 100).toFixed(2)} % del líder`, { window: "14d", ctr: p!.ctr, ctrHigh95: p!.ctrInterval.high, leaderCtr: leader.p!.ctr, impressions: p!.impressions, leaderAd: leader.a.id });
      }
    }
  }

  // Budget rules (campaign = its single ad set's budget).
  for (const c of ctx.campaigns.filter((x) => ctx.faroCampaignIds.has(x.id))) {
    const sets = ctx.adSets.filter((s) => s.campaignId === c.id && s.dailyBudget !== null);
    if (sets.length !== 1) continue;
    const set = sets[0]!;
    const budget = set.dailyBudget!;
    const last = ctx.lastBudgetChange.get(c.id);
    const settled = !last || days(ctx.now, last) >= THRESHOLDS.daysBetweenBudgetChanges;
    const a7 = campaignAgg(ctx.ads, ctx.perf.d7, c.id);
    const a14 = campaignAgg(ctx.ads, ctx.perf.d14, c.id);

    if (c.status === "PAUSED" && a14.spend === 0 && !last) {
      out.push({ rule: "R-activar", action: "activate_campaign", entityType: "campaign", entityId: c.id, campaignId: c.id, title: `Activar "${c.name}" (${Math.round(budget)} por día)`, params: { dailyBudget: budget, name: c.name }, evidence: { status: c.status, spend14: 0 }, requiresApproval: true });
      continue;
    }
    if (c.status !== "ACTIVE" || st.cpqlCap === null || !settled) continue;
    const cpql7 = a7.qualified > 0 ? a7.spend / a7.qualified : Infinity;
    if (a7.spend >= THRESHOLDS.stopLossCapMultiple * st.cpqlCap && cpql7 > THRESHOLDS.cpqlHighMultiple * st.cpqlCap) {
      const to = Math.max(round(budget * (1 - THRESHOLDS.budgetStep)), ctx.minBudget);
      if (to < budget) out.push({ rule: "R-cpql-alto", action: "lower_budget", entityType: "adset", entityId: set.id, campaignId: c.id, title: `Bajar presupuesto de "${c.name}" de ${Math.round(budget)} a ${to}`, params: { adSetId: set.id, fromBudget: budget, toBudget: to }, evidence: { window: "7d", spend: a7.spend, qualified: a7.qualified, cpql: Number.isFinite(cpql7) ? cpql7 : null, cpqlCap: st.cpqlCap }, requiresApproval: false });
    } else if (a14.qualified >= THRESHOLDS.scaleMinQualified14 && a7.qualified > 0 && cpql7 < st.cpqlCap && budget < ctx.maxBudget) {
      const to = Math.min(round(budget * (1 + THRESHOLDS.budgetStep)), ctx.maxBudget);
      if (to > budget) out.push({ rule: "R-escalar", action: "raise_budget", entityType: "adset", entityId: set.id, campaignId: c.id, title: `Escalar "${c.name}" de ${Math.round(budget)} a ${to} por día`, params: { adSetId: set.id, fromBudget: budget, toBudget: to }, evidence: { window: "7d/14d", cpql7, cpqlCap: st.cpqlCap, qualified14: a14.qualified }, requiresApproval: true });
    }
  }
  return { proposals: out, skipped };
}

/** Actions the autopilot may execute on its own: they only lower spend. */
export const AUTOPILOT_ACTIONS: ReadonlySet<ProposalAction> = new Set(["pause_ad", "lower_budget"]);
