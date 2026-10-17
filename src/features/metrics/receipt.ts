import { asc, eq, inArray } from "drizzle-orm";
import * as s from "@/db/schema";
import type { AppDb, CostCategory } from "@/db/types";
import { round6 } from "./costs";

/** SPEC §7 order: datos, scraping, IA, envío, whatsapp, dapta, pauta, humano. */
export const RECEIPT_CATEGORIES: { category: CostCategory; label: string }[] = [
  { category: "data", label: "Datos" },
  { category: "scraping", label: "Scraping" },
  { category: "ai", label: "IA" },
  { category: "email", label: "Envío" },
  { category: "whatsapp", label: "WhatsApp" },
  { category: "dapta", label: "Dapta" },
  { category: "ads", label: "Pauta" },
  { category: "human", label: "Humano" },
];

export interface ReceiptLine {
  id: string;
  quantity: number;
  unit: string;
  rate: number;
  /** Charged USD (what enters the total). */
  usd: number;
  /** quantity x rate: the list value, shown even when a free tier covered it. */
  listUsd: number;
  coveredByFreeTier: boolean;
  evidence: string | null;
  isDemo: boolean;
  isMock: boolean;
  at: string;
}

export interface ReceiptCategory {
  category: CostCategory;
  label: string;
  lines: ReceiptLine[];
  subtotalUsd: number;
  listSubtotalUsd: number;
}

export interface LeadReceipt {
  leadId: string;
  companyName: string;
  slug: string;
  sourceChannel: string;
  categories: ReceiptCategory[];
  totalUsd: number;
  /** Sum of list values; > totalUsd when free tiers covered something. */
  listTotalUsd: number;
  entryCount: number;
  /** True if the lead or any of its entries is demo/mock: never present it as real. */
  isDemo: boolean;
}

/** Itemized cost of one lead. `totalUsd` equals the sum of the lead's `cost_entries`. Null if the lead does not exist. */
export async function getLeadReceipt(db: AppDb, leadId: string): Promise<LeadReceipt | null> {
  return (await getLeadReceipts(db, [leadId])).get(leadId) ?? null;
}

/** Receipts for many leads in two queries (no per-lead round trips). */
export async function getLeadReceipts(db: AppDb, leadIds: string[]): Promise<Map<string, LeadReceipt>> {
  const out = new Map<string, LeadReceipt>();
  if (leadIds.length === 0) return out;
  const leadRows = await db
    .select({ id: s.leads.id, slug: s.leads.slug, source: s.leads.primarySource, isDemo: s.leads.isDemo, name: s.companies.name })
    .from(s.leads)
    .innerJoin(s.companies, eq(s.companies.id, s.leads.companyId))
    .where(inArray(s.leads.id, leadIds));
  const entries = await db.select().from(s.costEntries).where(inArray(s.costEntries.leadId, leadIds)).orderBy(asc(s.costEntries.at), asc(s.costEntries.id));
  for (const lead of leadRows) out.set(lead.id, buildReceipt(lead, entries.filter((e) => e.leadId === lead.id)));
  return out;
}

function buildReceipt(
  lead: { id: string; slug: string; source: string; isDemo: boolean; name: string },
  rows: (typeof s.costEntries.$inferSelect)[],
): LeadReceipt {
  const byCat = new Map<CostCategory, ReceiptLine[]>();
  for (const r of rows) {
    const listUsd = round6(r.quantity * r.rate);
    const line: ReceiptLine = {
      id: r.id,
      quantity: r.quantity,
      unit: r.unit,
      rate: r.rate,
      usd: r.usd,
      listUsd,
      coveredByFreeTier: r.usd === 0 && listUsd > 0,
      evidence: r.evidence,
      isDemo: r.isDemo,
      isMock: r.isMock,
      at: r.at.toISOString(),
    };
    const arr = byCat.get(r.category) ?? [];
    arr.push(line);
    byCat.set(r.category, arr);
  }

  const categories: ReceiptCategory[] = RECEIPT_CATEGORIES.map(({ category, label }) => {
    const lines = byCat.get(category) ?? [];
    return {
      category,
      label,
      lines,
      subtotalUsd: round6(lines.reduce((a, l) => a + l.usd, 0)),
      // Lines without a rate (usd given directly) list at their charged value.
      listSubtotalUsd: round6(lines.reduce((a, l) => a + (l.listUsd > 0 ? l.listUsd : l.usd), 0)),
    };
  });

  return {
    leadId: lead.id,
    companyName: lead.name,
    slug: lead.slug,
    sourceChannel: lead.source,
    categories,
    totalUsd: round6(categories.reduce((a, c) => a + c.subtotalUsd, 0)),
    listTotalUsd: round6(categories.reduce((a, c) => a + c.listSubtotalUsd, 0)),
    entryCount: rows.length,
    isDemo: lead.isDemo || rows.some((r) => r.isDemo || r.isMock),
  };
}
