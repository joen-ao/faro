import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { AppDb } from "@/db/types";
import { attributeAdSpend } from "@/features/metrics/costs";
import type { Env } from "@/lib/env";
import type { MetaAdsAdapter, MetaApiCall, MetaCampaign, PausedCampaignSpec } from "@/integrations/meta-ads";

const SYNC_KEY = "meta_ads_sync";

const noControl = (v: string) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
const text = (min: number, max: number) => z.string().trim().min(min).max(max).refine(noControl, "caracteres no permitidos");

/** Allowed ad destination hosts: META_ADS_ALLOWED_DOMAINS + the app's own host. */
export function allowedAdHosts(env: Env): string[] {
  const hosts = env.META_ADS_ALLOWED_DOMAINS.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  try {
    hosts.push(new URL(env.NEXT_PUBLIC_APP_URL).hostname.toLowerCase());
  } catch {
    /* invalid app URL: only the configured domains */
  }
  return [...new Set(hosts)];
}

/** https, no credentials or port, host in the allow-list. Returns an error message or null. */
export function destinationError(raw: string, env: Env): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "URL inválida";
  }
  if (u.protocol !== "https:") return "La URL debe empezar por https://";
  if (u.username || u.password || u.port) return "La URL no puede llevar usuario, clave ni puerto";
  if (!allowedAdHosts(env).includes(u.hostname.toLowerCase())) return `Dominio no permitido: ${u.hostname}. Permitidos: ${allowedAdHosts(env).join(", ")}`;
  return null;
}

export function campaignInputSchema(env: Env) {
  return z
    .object({
      name: text(3, 100),
      url: z.string().trim().max(500),
      dailyBudget: z.coerce.number().int("presupuesto en pesos enteros").min(1000, "mínimo 1.000").max(env.ADS_MAX_DAILY_BUDGET_COP, `máximo ${env.ADS_MAX_DAILY_BUDGET_COP} (ADS_MAX_DAILY_BUDGET_COP)`),
      primaryText: text(1, 500),
      headline: text(1, 80),
      description: z.preprocess((v) => (v === "" ? undefined : v), text(1, 120).optional()),
      imageUrl: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(500).url().startsWith("https://", "la imagen debe ser https").optional()),
      cta: z.enum(["LEARN_MORE", "CONTACT_US", "SIGN_UP", "GET_QUOTE"]).default("LEARN_MORE"),
      geo: z.enum(["bogota", "co"]).default("bogota"),
      ageMin: z.coerce.number().int().min(18).max(65).default(18),
      ageMax: z.coerce.number().int().min(18).max(65).default(65),
    })
    .superRefine((v, ctx) => {
      const err = destinationError(v.url, env);
      if (err) ctx.addIssue({ code: "custom", path: ["url"], message: err });
      if (v.ageMax < v.ageMin) ctx.addIssue({ code: "custom", path: ["ageMax"], message: "La edad máxima debe ser mayor o igual a la mínima" });
    });
}
export type CampaignInput = PausedCampaignSpec;

export type ActivationRefusal = "spend_disabled" | "confirm_mismatch" | "over_budget" | "unknown_budget";

/** Guardrail before spending money: ADS_SPEND_ENABLED, exact name typed, budget within the cap. */
export function activationRefusal(env: Env, campaign: MetaCampaign, confirmName: string): ActivationRefusal | null {
  if (!env.ADS_SPEND_ENABLED) return "spend_disabled";
  if (confirmName.trim() !== campaign.name) return "confirm_mismatch";
  if (campaign.dailyBudget === null) return "unknown_budget";
  if (campaign.dailyBudget > env.ADS_MAX_DAILY_BUDGET_COP) return "over_budget";
  return null;
}

/** yyyy-mm-dd in America/Bogota, `daysAgo` days back. */
export function bogotaDate(daysAgo = 0, now = new Date()): string {
  const d = new Date(now.getTime() - daysAgo * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Units of `currency` per USD, or null when the currency is not supported. */
export function fxFor(currency: string, env: Env): number | null {
  if (currency === "USD") return 1;
  if (currency === "COP") return env.META_COP_PER_USD > 0 ? env.META_COP_PER_USD : null;
  return null;
}

export interface SyncSummary {
  mode: "real" | "mock";
  since: string;
  until: string;
  currency: string;
  fx: number | null;
  rows: number;
  saved: number;
  campaigns: string[];
  spendLocal: number;
  usd: number;
  at: string;
  error?: string;
}

/**
 * Pulls campaign/day insights and upserts them into `ad_spend` (source `meta_api`), then re-attributes each
 * campaign's spend across real leads with that utm_campaign (F13). Mock mode never writes spend rows.
 */
export async function syncMetaAds(db: AppDb, adapter: MetaAdsAdapter, env: Env, opts: { days?: number; now?: Date } = {}): Promise<SyncSummary> {
  const days = Math.min(Math.max(opts.days ?? 7, 1), 90);
  const since = bogotaDate(days - 1, opts.now);
  const until = bogotaDate(0, opts.now);
  const at = (opts.now ?? new Date()).toISOString();
  const account = await adapter.getAccount();
  const insights = await adapter.getInsights({ since, until });
  const fx = fxFor(account.currency, env);
  const base = { mode: adapter.isMock ? ("mock" as const) : ("real" as const), since, until, currency: account.currency, fx, rows: insights.length, at };
  const spendLocal = insights.reduce((a, r) => a + r.spend, 0);

  if (adapter.isMock) {
    return { ...base, saved: 0, campaigns: [...new Set(insights.map((r) => r.campaignId))], spendLocal, usd: fx ? spendLocal / fx : 0 };
  }
  if (!fx) {
    const summary = { ...base, saved: 0, campaigns: [], spendLocal, usd: 0, error: `Moneda ${account.currency} no soportada (solo COP y USD)` };
    await saveSyncSummary(db, summary);
    return summary;
  }

  await db.transaction(async (tx) => {
    for (const r of insights) {
      const usd = Math.round((r.spend / fx) * 1e6) / 1e6;
      const values = {
        usd,
        impressions: r.impressions,
        clicks: r.clicks,
        source: "meta_api",
        currency: account.currency,
        spendLocal: r.spend,
        fx,
        conversations: r.conversations,
        campaignName: r.campaignName,
      };
      await tx
        .insert(s.adSpend)
        .values({ platform: "meta", campaign: r.campaignId, date: r.date, isDemo: false, ...values })
        .onConflictDoUpdate({ target: [s.adSpend.platform, s.adSpend.campaign, s.adSpend.date, s.adSpend.isDemo], set: values });
    }
  });
  const campaigns = [...new Set(insights.map((r) => r.campaignId))];
  for (const campaign of campaigns) await attributeAdSpend(db, { campaign });
  const summary: SyncSummary = { ...base, saved: insights.length, campaigns, spendLocal, usd: spendLocal / fx };
  await saveSyncSummary(db, summary);
  return summary;
}

async function saveSyncSummary(db: AppDb, summary: SyncSummary) {
  const now = new Date();
  const value = summary as unknown as Record<string, unknown>;
  await db.insert(s.appSettings).values({ key: SYNC_KEY, value, updatedAt: now }).onConflictDoUpdate({ target: s.appSettings.key, set: { value, updatedAt: now } });
}

export async function getLastSync(db: AppDb): Promise<SyncSummary | null> {
  const [row] = await db.select().from(s.appSettings).where(eq(s.appSettings.key, SYNC_KEY)).limit(1);
  return row ? (row.value as unknown as SyncSummary) : null;
}

export interface CampaignStats {
  spendLocal: number;
  usd: number;
  impressions: number;
  clicks: number;
  conversations: number;
}

/** Synced (meta_api, real) totals per Meta campaign id since `since` (yyyy-mm-dd). */
export async function metaCampaignStats(db: AppDb, since: string): Promise<Map<string, CampaignStats>> {
  const rows = await db
    .select({
      campaign: s.adSpend.campaign,
      spendLocal: sql<number>`coalesce(sum(${s.adSpend.spendLocal}), 0)::float8`,
      usd: sql<number>`coalesce(sum(${s.adSpend.usd}), 0)::float8`,
      impressions: sql<number>`coalesce(sum(${s.adSpend.impressions}), 0)::int`,
      clicks: sql<number>`coalesce(sum(${s.adSpend.clicks}), 0)::int`,
      conversations: sql<number>`coalesce(sum(${s.adSpend.conversations}), 0)::int`,
    })
    .from(s.adSpend)
    .where(and(eq(s.adSpend.source, "meta_api"), eq(s.adSpend.isDemo, false), gte(s.adSpend.date, since)))
    .groupBy(s.adSpend.campaign);
  return new Map(
    rows.map((r) => [r.campaign, { spendLocal: Number(r.spendLocal), usd: Number(r.usd), impressions: Number(r.impressions), clicks: Number(r.clicks), conversations: Number(r.conversations) }]),
  );
}

/** Persists one Meta call in `api_calls` (endpoint never carries the token). */
export function apiCallLogger(db: AppDb) {
  return async (c: MetaApiCall) => {
    await db
      .insert(s.apiCalls)
      .values({ service: c.service, endpoint: c.endpoint, status: c.status, latencyMs: c.latencyMs, error: c.error, costUsd: 0, isMock: c.isMock })
      .catch(() => undefined);
  };
}
