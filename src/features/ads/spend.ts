import { desc, sql } from "drizzle-orm";
import * as s from "@/db/schema";
import type { AppDb } from "@/db/types";
import { attributeAdSpend } from "@/features/metrics/costs";
import type { SpendRow } from "./csv";

export interface SaveResult {
  saved: number;
  campaigns: string[];
}

/** Upserts spend rows by (platform, campaign, date, is_demo) and re-attributes every touched campaign (F13, idempotent). */
export async function saveAdSpend(db: AppDb, rows: SpendRow[], opts: { isDemo?: boolean } = {}): Promise<SaveResult> {
  const isDemo = opts.isDemo ?? false;
  if (!rows.length) return { saved: 0, campaigns: [] };
  await db.transaction(async (tx) => {
    for (const r of rows) {
      await tx
        .insert(s.adSpend)
        .values({ platform: r.platform, campaign: r.campaign, date: r.date, usd: r.usd, impressions: r.impressions, clicks: r.clicks, isDemo })
        .onConflictDoUpdate({
          // is_demo is part of the key: a demo upload never overwrites a real row, nor the reverse.
          target: [s.adSpend.platform, s.adSpend.campaign, s.adSpend.date, s.adSpend.isDemo],
          set: { usd: r.usd, impressions: r.impressions, clicks: r.clicks },
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

/** Real Meta campaigns with spend loaded but no cost entries yet (no leads attributed by UTM, e.g. a typo or no clicks). */
export async function unattributedSpend(db: AppDb): Promise<{ campaign: string; usd: number }[]> {
  const res = await db.execute(sql`
    select a.campaign, sum(a.usd)::float8 as usd
    from ad_spend a
    where a.platform = 'meta' and not a.is_demo
      and not exists (select 1 from cost_entries c where c.category = 'ads' and not c.is_demo and left(c.evidence, length('campaña ' || a.campaign || ':')) = 'campaña ' || a.campaign || ':')
    group by a.campaign having sum(a.usd) > 0 order by 2 desc`);
  const rows = (res as unknown as { rows?: { campaign: string; usd: number }[] }).rows ?? (res as unknown as { campaign: string; usd: number }[]);
  return rows.map((r) => ({ campaign: r.campaign, usd: Number(r.usd) }));
}
