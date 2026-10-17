import { desc, eq, ne, and } from "drizzle-orm";
import { companies, contactPoints, leads, suppression } from "@/db/schema";
import type { AppDb } from "@/db/types";
import type { DaptaLeadRecord } from "./types";

const MAX_LEADS = 500;

/**
 * Leads that may be handed to Dapta: not opted out, no suppressed email/domain/phone.
 * Only generic company contacts are included (SPEC §8).
 */
export async function selectLeadsForDapta(
  db: AppDb,
  opts: { huntId?: string; appUrl: string; includeDemo?: boolean; limit?: number },
): Promise<DaptaLeadRecord[]> {
  const where = opts.huntId
    ? and(ne(leads.status, "opted_out"), eq(leads.huntId, opts.huntId))
    : ne(leads.status, "opted_out");
  const rows = await db
    .select({ lead: leads, company: companies })
    .from(leads)
    .innerJoin(companies, eq(leads.companyId, companies.id))
    .where(where)
    .orderBy(desc(leads.fitScore), leads.createdAt)
    .limit(Math.min(opts.limit ?? MAX_LEADS, MAX_LEADS));

  const suppressed = new Set((await db.select({ v: suppression.value }).from(suppression)).map((r) => r.v));
  const contacts = await db.select().from(contactPoints);
  const byCompany = new Map<string, typeof contacts>();
  for (const c of contacts) byCompany.set(c.companyId, [...(byCompany.get(c.companyId) ?? []), c]);

  const base = opts.appUrl.replace(/\/$/, "");
  const out: DaptaLeadRecord[] = [];
  for (const { lead, company } of rows) {
    if (lead.isDemo && !opts.includeDemo) continue;
    const cps = byCompany.get(company.id) ?? [];
    const email = cps.find((c) => c.type === "email" && c.isGeneric)?.value ?? "";
    const phone = cps.find((c) => c.type === "phone" || c.type === "whatsapp")?.value ?? "";
    const domain = company.website?.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]?.toLowerCase();
    const isBlocked =
      (email && (suppressed.has(email.toLowerCase()) || suppressed.has(email.split("@")[1]?.toLowerCase() ?? "-"))) ||
      (phone && suppressed.has(phone)) ||
      (domain && suppressed.has(domain));
    if (isBlocked) continue;
    out.push({
      leadId: lead.id,
      slug: lead.slug,
      company: company.name,
      phone,
      email,
      city: company.city ?? "",
      source: lead.primarySource,
      diagnosticUrl: `${base}/d/${lead.slug}`,
      notes: lead.fitScore != null ? `fit ${lead.fitScore}` : "",
      isDemo: lead.isDemo,
    });
  }
  return out;
}
