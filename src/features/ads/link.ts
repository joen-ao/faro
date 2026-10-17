import { z } from "zod";
import { ICP_PAGES } from "@/config/icp-pages";
import { getEnv } from "@/lib/env";

export const campaignIdSchema = z.string().trim().regex(/^[A-Za-z0-9_.-]{1,80}$/, "ID de campaña: letras, números, _ . - (máx. 80)");

/**
 * UTM link for a Meta ad pointing at the generic ICP page (SPEC §9.4):
 * `${NEXT_PUBLIC_APP_URL}/d/icp/<slug>?utm_source=meta&utm_medium=paid_social&utm_campaign=<id>`.
 * `campaignId` defaults to META_ADS_CAMPAIGN_ID.
 */
export function buildAdLink(icpSlug: string, campaignId?: string): string {
  if (!Object.hasOwn(ICP_PAGES, icpSlug)) throw new Error(`ICP desconocido: ${icpSlug}`);
  const env = getEnv();
  const id = campaignIdSchema.parse(campaignId ?? env.META_ADS_CAMPAIGN_ID);
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  const q = new URLSearchParams({ utm_source: "meta", utm_medium: "paid_social", utm_campaign: id });
  return `${base}/d/icp/${icpSlug}?${q.toString()}`;
}
