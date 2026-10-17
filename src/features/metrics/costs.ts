import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { AppDb, CostEntry, SourceChannel } from "@/db/types";
import { getEnv } from "@/lib/env";

const SOURCES = s.sourceChannelEnum.enumValues;
const CONTACTS = s.contactChannelEnum.enumValues;
const CATEGORIES = s.costCategoryEnum.enumValues;

export const MICRO = 1_000_000;
/** Round to 6 decimals (the precision of `cost_entries.usd`). */
export const round6 = (n: number): number => Math.round(n * MICRO) / MICRO;

export const costEntryInput = z
  .object({
    leadId: z.string().uuid().nullish(),
    huntId: z.string().uuid().nullish(),
    sourceChannel: z.enum(SOURCES).nullish(),
    contactChannel: z.enum(CONTACTS).nullish(),
    category: z.enum(CATEGORIES),
    quantity: z.number().finite().nonnegative(),
    unit: z.string().min(1),
    /** USD per unit. For free-tier items this is the LIST rate (usd stays 0). */
    rate: z.number().finite().nonnegative().default(0),
    /** Charged USD. Defaults to quantity x rate. */
    usd: z.number().finite().nonnegative().optional(),
    /** Required: every number must be traceable to evidence (SPEC §7). */
    evidence: z.string().min(1),
    isDemo: z.boolean().default(false),
    isMock: z.boolean().default(false),
  })
  .strict();
export type CostEntryInput = z.input<typeof costEntryInput>;

/** Validates and inserts one cost entry. */
export async function recordCost(db: AppDb, entry: CostEntryInput): Promise<CostEntry> {
  const e = costEntryInput.parse(entry);
  const usd = round6(e.usd ?? e.quantity * e.rate);
  const [row] = await db
    .insert(s.costEntries)
    .values({
      leadId: e.leadId ?? null,
      huntId: e.huntId ?? null,
      sourceChannel: e.sourceChannel ?? null,
      contactChannel: e.contactChannel ?? null,
      category: e.category,
      quantity: e.quantity,
      unit: e.unit,
      rate: e.rate,
      usd,
      evidence: e.evidence,
      isDemo: e.isDemo,
      isMock: e.isMock,
    })
    .returning();
  return row;
}

/** Splits `totalUsd` into n shares in integer micro-USD; the remainder goes to the last so the sum is exact. */
export function splitEvenly(totalUsd: number, n: number): number[] {
  if (!Number.isInteger(n) || n < 1) throw new RangeError("need at least one lead to prorate");
  if (!Number.isFinite(totalUsd) || totalUsd < 0) throw new RangeError("totalUsd must be >= 0");
  const totalMicro = Math.round(totalUsd * MICRO);
  const base = Math.floor(totalMicro / n);
  const shares = Array<number>(n).fill(base);
  shares[n - 1] = totalMicro - base * (n - 1);
  return shares.map((m) => m / MICRO);
}

export interface ProrateInput {
  huntId?: string | null;
  sourceChannel: SourceChannel;
  category: (typeof CATEGORIES)[number];
  totalUsd: number;
  leadIds: string[];
  evidence: string;
  unit?: string;
  isDemo?: boolean;
  isMock?: boolean;
}

/** Spreads a shared cost (e.g. one Overpass/Apify run) across the leads of that source and run. Sum is exact. */
export async function prorateSharedCost(db: AppDb, input: ProrateInput): Promise<CostEntry[]> {
  const leadIds = [...new Set(input.leadIds)];
  const shares = splitEvenly(input.totalUsd, leadIds.length);
  const evidence = z.string().min(1).parse(input.evidence);
  const n = leadIds.length;
  return db
    .insert(s.costEntries)
    .values(
      leadIds.map((leadId, i) => ({
        leadId,
        huntId: input.huntId ?? null,
        sourceChannel: input.sourceChannel,
        category: input.category,
        quantity: 1,
        unit: input.unit ?? "share",
        rate: shares[i],
        usd: shares[i],
        evidence: `${evidence} | prorrateo ${i + 1}/${n} de USD ${input.totalUsd.toFixed(6)}`,
        isDemo: input.isDemo ?? false,
        isMock: input.isMock ?? false,
      })),
    )
    .returning();
}

/* ---------- rates ---------- */
export interface Rates {
  daptaCreditUsd: number;
  daptaCreditsPerReply: number;
  humanMinuteUsd: number;
  placesPerCallUsd: number;
}

/** Rates from `cost_rates` first, then env (SPEC §12), then built-in defaults. */
export async function getRates(db: AppDb): Promise<Rates> {
  const rows = await db.select({ key: s.costRates.key, usd: s.costRates.usd }).from(s.costRates);
  const m = new Map(rows.map((r) => [r.key, r.usd]));
  const env = getEnv();
  return {
    daptaCreditUsd: m.get("dapta_credit") ?? env.DAPTA_CREDIT_USD,
    daptaCreditsPerReply: m.get("dapta_credits_per_ai_reply") ?? env.DAPTA_CREDITS_PER_AI_REPLY,
    humanMinuteUsd: m.get("human_minute") ?? env.HUMAN_MINUTE_RATE_USD,
    placesPerCallUsd: m.get("places_per_call") ?? 0.032,
  };
}

async function sourceOfLead(db: AppDb, leadId: string): Promise<SourceChannel | null> {
  const [r] = await db.select({ p: s.leads.primarySource }).from(s.leads).where(eq(s.leads.id, leadId));
  return r?.p ?? null;
}

type Flags = { isDemo?: boolean; isMock?: boolean };

/** Dapta cost: AI replies x credits per reply x USD per credit. */
export async function recordDaptaCost(
  db: AppDb,
  p: { leadId: string; aiReplies: number; conversationId?: string } & Flags,
): Promise<CostEntry> {
  const r = await getRates(db);
  const credits = p.aiReplies * r.daptaCreditsPerReply;
  return recordCost(db, {
    leadId: p.leadId,
    sourceChannel: await sourceOfLead(db, p.leadId),
    contactChannel: "dapta_widget",
    category: "dapta",
    quantity: credits,
    unit: "credits",
    rate: r.daptaCreditUsd,
    evidence: `${p.aiReplies} respuestas IA x ${r.daptaCreditsPerReply} créditos${p.conversationId ? ` · conversación ${p.conversationId}` : ""}`,
    isDemo: p.isDemo,
    isMock: p.isMock,
  });
}

/** Assisted-form human time: minutes x per-minute rate. */
export async function recordHumanCost(
  db: AppDb,
  p: { leadId: string; minutes: number; note?: string } & Flags,
): Promise<CostEntry> {
  const r = await getRates(db);
  return recordCost(db, {
    leadId: p.leadId,
    sourceChannel: await sourceOfLead(db, p.leadId),
    contactChannel: "web_form",
    category: "human",
    quantity: p.minutes,
    unit: "minutes",
    rate: r.humanMinuteUsd,
    evidence: p.note ?? `${p.minutes} min de formulario asistido`,
    isDemo: p.isDemo,
    isMock: p.isMock,
  });
}

/**
 * Google Places calls. Always records the LIST rate; `freeTier` zeroes the charged usd
 * (the receipt shows the list value and "cubierto por tier gratuito").
 */
export async function recordPlacesCost(
  db: AppDb,
  p: { leadId?: string; huntId?: string; calls: number; freeTier: boolean } & Flags,
): Promise<CostEntry> {
  const r = await getRates(db);
  return recordCost(db, {
    leadId: p.leadId,
    huntId: p.huntId,
    sourceChannel: "google_places",
    category: "data",
    quantity: p.calls,
    unit: "calls",
    rate: r.placesPerCallUsd,
    usd: p.freeTier ? 0 : p.calls * r.placesPerCallUsd,
    evidence: p.freeTier ? `${p.calls} llamadas Places API (cubierto por tier gratuito)` : `${p.calls} llamadas Places API`,
    isDemo: p.isDemo,
    isMock: p.isMock,
  });
}

/**
 * Paid ads: `ad_spend` of a campaign divided across leads whose events carry `utm.utm_campaign = campaign`.
 * Demo and real spend are handled separately: real spend only goes to real leads (not demo, and
 * not via mock events); demo spend only to demo leads. Idempotent: re-attributing replaces the
 * previous entries of that campaign. Returns the new entries ([] if nothing to attribute).
 */
export async function attributeAdSpend(db: AppDb, p: { campaign: string; huntId?: string | null }): Promise<CostEntry[]> {
  const prefix = `campaña ${p.campaign}:`;
  return db.transaction(async (tx) => {
    const out: CostEntry[] = [];
    for (const demo of [false, true]) {
      await tx
        .delete(s.costEntries)
        .where(and(eq(s.costEntries.category, "ads"), eq(s.costEntries.isDemo, demo), sql`left(${s.costEntries.evidence}, ${prefix.length}) = ${prefix}`));
      const [spend] = await tx
        .select({ total: sql<number>`coalesce(sum(${s.adSpend.usd}), 0)::float8` })
        .from(s.adSpend)
        .where(and(eq(s.adSpend.platform, "meta"), eq(s.adSpend.campaign, p.campaign), eq(s.adSpend.isDemo, demo)));
      const attributed = await tx
        .selectDistinct({ leadId: s.events.leadId })
        .from(s.events)
        .innerJoin(s.leads, eq(s.leads.id, s.events.leadId))
        .where(and(sql`${s.events.utm} ->> 'utm_campaign' = ${p.campaign}`, eq(s.leads.isDemo, demo), demo ? undefined : eq(s.events.isMock, false)));
      if (!spend || spend.total <= 0 || attributed.length === 0) continue;
      out.push(
        ...(await prorateSharedCost(tx as unknown as AppDb, {
          huntId: p.huntId,
          sourceChannel: "meta_ads",
          category: "ads",
          totalUsd: spend.total,
          leadIds: attributed.map((a) => a.leadId),
          evidence: `${prefix} ad_spend ÷ leads atribuidos por UTM`,
          unit: "share of campaign spend",
          isDemo: demo,
        })),
      );
    }
    return out;
  });
}
