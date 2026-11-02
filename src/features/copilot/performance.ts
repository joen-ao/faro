import { sql } from "drizzle-orm";
import type { AppDb } from "@/db/types";
import { MIN_DATA, wilson, type Interval } from "./stats";

export interface AdPerformance {
  adId: string;
  adName: string | null;
  campaignId: string | null;
  angle: string | null;
  formatHint: string | null;
  hypothesis: string | null;
  currency: string | null;
  spendLocal: number;
  usd: number;
  impressions: number;
  linkClicks: number;
  frequency: number;
  /** Days with Meta data in the window. */
  days: number;
  /** Link CTR (link clicks / impressions), null without impressions. */
  ctr: number | null;
  ctrInterval: Interval | null;
  leads: number;
  qualified: number;
  qualificationRate: number | null;
  qualificationInterval: Interval | null;
  /** Cost per lead / per qualified lead, in account currency; null when the denominator is 0. */
  cpl: number | null;
  cpql: number | null;
  ctrReady: boolean;
  qualityReady: boolean;
}

type Row = {
  ad_id: string;
  ad_name: string | null;
  campaign_id: string | null;
  angle: string | null;
  format_hint: string | null;
  hypothesis: string | null;
  currency: string | null;
  spend_local: number | string | null;
  usd: number | string | null;
  impressions: number | string | null;
  link_clicks: number | string | null;
  frequency: number | string | null;
  days: number | string | null;
  leads: number | string | null;
  qualified: number | string | null;
};

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/**
 * Per-ad performance since `since` (yyyy-mm-dd, Bogotá): Meta insights (ad_insights) joined with what only Faro
 * knows — leads whose events carry `utm_content=<ad id>` and their real Dapta qualifications. Demo/mock never count.
 */
export async function adPerformance(db: AppDb, since: string, until = "9999-12-31"): Promise<AdPerformance[]> {
  const res = await db.execute(sql`
    with ins as (
      select ad_id, max(ad_name) as ad_name, max(campaign_id) as campaign_id, max(currency) as currency,
             sum(spend_local)::float8 as spend_local, sum(usd)::float8 as usd,
             sum(impressions)::int as impressions, sum(link_clicks)::int as link_clicks, max(frequency)::float8 as frequency,
             count(distinct date)::int as days
      from ad_insights where date >= ${since} and date <= ${until} group by ad_id
    ),
    v as (select * from ad_variants where not is_demo),
    ids as (select ad_id from ins union select ad_id from v),
    ev as (
      select distinct e.utm ->> 'utm_content' as ad_id, e.lead_id
      from events e join leads l on l.id = e.lead_id
      where e.utm ->> 'utm_source' = 'meta' and coalesce(e.utm ->> 'utm_content', '') <> ''
        and not l.is_demo and not e.is_demo and not e.is_mock and e.at >= ${since}::date
        and e.at < (case when ${until} = '9999-12-31' then 'infinity'::timestamptz else (${until}::date + 1)::timestamptz end)
    ),
    lc as (select ad_id, count(*)::int as leads from ev group by ad_id),
    qc as (
      select ev.ad_id, count(distinct ev.lead_id)::int as qualified
      from ev join qualifications q on q.lead_id = ev.lead_id
      where q.qualified and not q.is_demo and not q.is_mock
      group by ev.ad_id
    )
    select ids.ad_id, ins.ad_name, coalesce(ins.campaign_id, v.campaign_id) as campaign_id,
           v.angle, v.format_hint, v.hypothesis, ins.currency,
           ins.spend_local, ins.usd, ins.impressions, ins.link_clicks, ins.frequency, ins.days,
           lc.leads, qc.qualified
    from ids
    left join ins on ins.ad_id = ids.ad_id
    left join v on v.ad_id = ids.ad_id
    left join lc on lc.ad_id = ids.ad_id
    left join qc on qc.ad_id = ids.ad_id
    order by coalesce(ins.spend_local, 0) desc, ids.ad_id`);
  const rows = (res as unknown as { rows?: Row[] }).rows ?? (res as unknown as Row[]);
  return rows.map((r) => {
    const spendLocal = num(r.spend_local);
    const impressions = num(r.impressions);
    const linkClicks = num(r.link_clicks);
    const leads = num(r.leads);
    const qualified = num(r.qualified);
    return {
      adId: r.ad_id,
      adName: r.ad_name,
      campaignId: r.campaign_id,
      angle: r.angle,
      formatHint: r.format_hint,
      hypothesis: r.hypothesis,
      currency: r.currency,
      spendLocal,
      usd: num(r.usd),
      impressions,
      linkClicks,
      frequency: num(r.frequency),
      days: num(r.days),
      ctr: impressions > 0 ? linkClicks / impressions : null,
      ctrInterval: wilson(linkClicks, impressions),
      leads,
      qualified,
      qualificationRate: leads > 0 ? qualified / leads : null,
      qualificationInterval: wilson(qualified, leads),
      cpl: leads > 0 ? spendLocal / leads : null,
      cpql: qualified > 0 ? spendLocal / qualified : null,
      ctrReady: impressions >= MIN_DATA.ctrImpressions,
      qualityReady: leads >= MIN_DATA.qualityLeads,
    };
  });
}
