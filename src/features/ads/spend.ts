import { desc } from "drizzle-orm";
import * as s from "@/db/schema";
import type { AppDb } from "@/db/types";
import { attributeAdSpend } from "@/features/metrics/costs";
import type { SpendRow } from "./csv";

export interface SaveResult {
  saved: number;
  campaigns: string[];
}

/** Upserts spend rows by (platform, campaign, date) and re-attributes every touched campaign (F13, idempotent). */
export async function saveAdSpend(db: AppDb, rows: SpendRow[], opts: { isDemo?: boolean } = {}): Promise<SaveResult> {
  const isDemo = opts.isDemo ?? false;
  if (!rows.length) return { saved: 0, campaigns: [] };
  await db.transaction(async (tx) => {
    for (const r of rows) {
      await tx
        .insert(s.adSpend)
        .values({ platform: r.platform, campaign: r.campaign, date: r.date, usd: r.usd, impressions: r.impressions, clicks: r.clicks, isDemo })
        .onConflictDoUpdate({
          target: [s.adSpend.platform, s.adSpend.campaign, s.adSpend.date],
          set: { usd: r.usd, impressions: r.impressions, clicks: r.clicks, isDemo },
        });
    }
  });
  const campaigns = [...new Set(rows.map((r) => r.campaign))];
  for (const campaign of campaigns) await attributeAdSpend(db, { campaign });
  return { saved: rows.length, campaigns };
}

export async function listAdSpend(db: AppDb, limit = 200) {
  return db.select().from(s.adSpend).orderBy(desc(s.adSpend.date), s.adSpend.campaign).limit(limit);
}
