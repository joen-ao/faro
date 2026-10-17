import { and, desc, eq, ne } from "drizzle-orm";
import { companies, contactPoints, leads } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { createOptOutToken } from "@/features/compliance/optout";
import { evaluateOutreachForLead } from "@/features/compliance/evaluate";
import { normalizeSuppressionValue } from "@/features/compliance/suppression";
import { E164, type WhatsappRow } from "./types";

const MAX_LEADS = 500;

export interface WhatsappSelection {
  rows: WhatsappRow[];
  skipped: { leadId: string; rule: string }[];
  /** Set when the send window is closed: nothing is exported until then. */
  nextAllowedAt: Date | null;
}

const trimSlash = (u: string) => u.replace(/\/+$/, "");

/**
 * Leads that may enter a WhatsApp sequence. Company phones only (flagged generic or from a company source),
 * legal entities, not opted out/suppressed, never already contacted (email included), inside the Ley 2300 window.
 */
export async function selectWhatsappRows(
  db: AppDb,
  opts: { appUrl: string; now?: Date; huntId?: string; includeDemo?: boolean; limit?: number },
): Promise<WhatsappSelection> {
  const now = opts.now ?? new Date();
  const where = opts.huntId ? and(ne(leads.status, "opted_out"), eq(leads.huntId, opts.huntId)) : ne(leads.status, "opted_out");
  const found = await db
    .select({ lead: leads, company: companies })
    .from(leads)
    .innerJoin(companies, eq(leads.companyId, companies.id))
    .where(where)
    .orderBy(desc(leads.fitScore), leads.createdAt)
    .limit(Math.min(opts.limit ?? MAX_LEADS, MAX_LEADS));
  const points = await db.select().from(contactPoints);
  const base = trimSlash(opts.appUrl);

  const rows: WhatsappRow[] = [];
  const skipped: WhatsappSelection["skipped"] = [];
  let nextAllowedAt: Date | null = null;
  const seenCompanies = new Set<string>();
  for (const { lead, company } of found) {
    if (lead.isDemo && !opts.includeDemo) continue;
    if (seenCompanies.has(company.id)) continue;
    const cp = points.find(
      (c) => c.companyId === company.id && (c.type === "phone" || c.type === "whatsapp") && (c.isGeneric || c.sourceChannel !== null),
    );
    if (!cp) continue;
    const phone = normalizeSuppressionValue(cp.value).value;
    if (!E164.test(phone)) {
      skipped.push({ leadId: lead.id, rule: "invalid_phone" });
      continue;
    }
    const ev = await evaluateOutreachForLead(db, lead.id, { channel: "whatsapp", value: phone }, now);
    if (!ev.allowed) {
      for (const b of ev.blocks) if (b.rule === "outside_window") nextAllowedAt = b.nextAllowedAt ?? nextAllowedAt;
      skipped.push({ leadId: lead.id, rule: ev.blocks[0]!.rule });
      continue;
    }
    seenCompanies.add(company.id);
    rows.push({
      leadId: lead.id,
      slug: lead.slug,
      company: company.name,
      phone,
      diagnosticUrl: `${base}/d/${encodeURIComponent(lead.slug)}?c=whatsapp&s=${encodeURIComponent(lead.primarySource)}`,
      optOutUrl: `${base}/baja/${createOptOutToken(lead.id, phone)}`,
      isDemo: lead.isDemo,
    });
  }
  return { rows, skipped, nextAllowedAt };
}
