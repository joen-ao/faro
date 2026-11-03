import { randomUUID } from "node:crypto";
import { z } from "zod";
import * as s from "@/db/schema";
import type { AppDb } from "@/db/types";
import { destinationError } from "@/features/ads/meta";
import type { Env } from "@/lib/env";
import type { CreatedCampaign, MetaAdsAdapter } from "@/integrations/meta-ads";
import { allowedPriceNumbers, lintAd, type LintIssue } from "./lint";
import { BriefSchema, VariantSchema, type Brief, type Variant } from "./propose";

export const CreateBody = z.object({
  name: z.string().trim().min(3).max(100),
  brief: BriefSchema,
  variants: z.array(VariantSchema).min(1).max(6),
});
export type CreateInput = z.output<typeof CreateBody>;

export type CreateOutcome =
  | { ok: true; created: CreatedCampaign; briefId: string }
  | { ok: false; error: "invalid"; issues: string[] }
  | { ok: false; error: "lint"; lint: { index: number; issues: LintIssue[] }[] };

/** Validates destination + budget cap + policy lint again (never trust the client), then creates everything PAUSED. */
export async function createCopilotCampaign(
  db: AppDb,
  ads: MetaAdsAdapter,
  env: Env,
  input: CreateInput,
  catalogPrices: (string | null | undefined)[],
): Promise<CreateOutcome> {
  const issues: string[] = [];
  const dest = destinationError(input.brief.url, env);
  if (dest) issues.push(`url: ${dest}`);
  if (input.brief.dailyBudget > env.ADS_MAX_DAILY_BUDGET_COP) issues.push(`dailyBudget: máximo ${env.ADS_MAX_DAILY_BUDGET_COP} (ADS_MAX_DAILY_BUDGET_COP)`);
  if (issues.length) return { ok: false, error: "invalid", issues };

  const prices = allowedPriceNumbers(catalogPrices);
  const lint = input.variants.map((v, index) => ({ index, issues: lintAd(v, prices) })).filter((l) => l.issues.length);
  if (lint.length) return { ok: false, error: "lint", lint };

  const created = await ads.createPausedCampaign({
    name: input.name,
    url: input.brief.url,
    dailyBudget: input.brief.dailyBudget,
    geo: input.brief.geo,
    ageMin: 25,
    ageMax: 65,
    ads: input.variants.map((v, i) => ({ name: `${input.name} · ${i + 1} · ${v.angle}`.slice(0, 200), primaryText: v.primaryText, headline: v.headline, description: v.description, imageUrl: v.imageUrl, imageHash: v.imageHash, videoId: v.videoId, cta: v.cta })),
  });

  const briefId = randomUUID();
  await db.insert(s.adVariants).values(
    created.ads.map((a, i) => variantRow(a.adId, created.campaignId, briefId, input.variants[i]!, input.brief, created.isMock)),
  );
  return { ok: true, created, briefId };
}

/** F32 · what the ad shows, so learnings can compare image vs video. */
export function mediaOf(v: Pick<Variant, "videoId" | "imageHash" | "imageUrl">): { mediaType: string | null; mediaRef: string | null } {
  if (v.videoId) return { mediaType: "video", mediaRef: v.videoId };
  if (v.imageHash) return { mediaType: "image", mediaRef: v.imageHash };
  if (v.imageUrl) return { mediaType: "url", mediaRef: v.imageUrl };
  return { mediaType: null, mediaRef: null };
}

function variantRow(adId: string, campaignId: string, briefId: string, v: Variant, brief: Brief, isDemo: boolean) {
  return {
    adId,
    campaignId,
    briefId,
    angle: v.angle,
    formatHint: v.format_hint,
    hook: v.hook,
    primaryText: v.primaryText,
    headline: v.headline,
    description: v.description ?? null,
    cta: v.cta,
    hypothesis: v.hypothesis,
    ...mediaOf(v),
    brief: brief as unknown as Record<string, unknown>,
    isDemo,
  };
}
