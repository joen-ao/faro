import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { companies, contactPoints, hunts, icpProfiles, leads, messages, workspaces } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { createOptOutToken } from "@/features/compliance/optout";
import { evaluateOutreachForLead } from "@/features/compliance/evaluate";
import { normalizeSuppressionValue } from "@/features/compliance/suppression";
import { E164, type WhatsappRow } from "./types";

const MAX_LEADS = 500;
/** Sources that prove a phone belongs to the company (an unverified OSM number may be a personal mobile). */
const COMPANY_SOURCES = new Set(["rues", "reps", "secop", "rnt", "solidaria", "google_places", "website"]);

export interface WhatsappSelection {
  rows: WhatsappRow[];
  skipped: { leadId: string; rule: string }[];
  /** Set when the send window is closed: nothing is exported until then. */
  nextAllowedAt: Date | null;
}

const trimSlash = (u: string) => u.replace(/\/+$/, "");
export const reservationId = (leadId: string) => `wa-${leadId}`;

/**
 * Leads that may enter a WhatsApp sequence. Company phones only (generic, or from RUES/REPS/Places/website),
 * legal entities, CO only, not opted out/suppressed, never already contacted (email included), inside the Ley 2300 window.
 * With `reserve`, each exported lead gets a `queued` whatsapp message so a later email is blocked ("ya contactada").
 */
export async function selectWhatsappRows(
  db: AppDb,
  opts: { appUrl: string; now?: Date; huntId?: string; includeDemo?: boolean; limit?: number; reserve?: boolean },
): Promise<WhatsappSelection> {
  const now = opts.now ?? new Date();
  const where = opts.huntId ? and(ne(leads.status, "opted_out"), eq(leads.huntId, opts.huntId)) : ne(leads.status, "opted_out");
  const found = await db
    .select({ lead: leads, company: companies, wsCountry: workspaces.country, criteria: icpProfiles.criteria })
    .from(leads)
    .innerJoin(companies, eq(leads.companyId, companies.id))
    .leftJoin(hunts, eq(leads.huntId, hunts.id))
    .leftJoin(icpProfiles, eq(hunts.icpProfileId, icpProfiles.id))
    .leftJoin(workspaces, eq(icpProfiles.workspaceId, workspaces.id))
    .where(where)
    .orderBy(desc(leads.fitScore), leads.createdAt)
    .limit(Math.min(opts.limit ?? MAX_LEADS, MAX_LEADS));
  const companyIds = [...new Set(found.map((f) => f.company.id))];
  const points = companyIds.length ? await db.select().from(contactPoints).where(inArray(contactPoints.companyId, companyIds)) : [];
  const active = companyIds.length
    ? await db
        .select({ companyId: leads.companyId, channel: messages.contactChannel, status: messages.status })
        .from(messages)
        .innerJoin(leads, eq(leads.id, messages.leadId))
        .where(and(inArray(leads.companyId, companyIds), inArray(messages.status, ["queued", "sent", "delivered"])))
    : [];
  const base = trimSlash(opts.appUrl);

  const rows: WhatsappRow[] = [];
  const skipped: WhatsappSelection["skipped"] = [];
  let nextAllowedAt: Date | null = null;
  const seenCompanies = new Set<string>();
  for (const { lead, company, wsCountry, criteria } of found) {
    if (lead.isDemo && !opts.includeDemo) continue;
    if (seenCompanies.has(company.id)) continue;
    const cp = points.find(
      (c) =>
        c.companyId === company.id &&
        (c.type === "phone" || c.type === "whatsapp") &&
        (c.isGeneric || (c.sourceChannel !== null && COMPANY_SOURCES.has(c.sourceChannel))),
    );
    if (!cp) continue;
    const phone = normalizeSuppressionValue(cp.value).value;
    if (!E164.test(phone)) {
      skipped.push({ leadId: lead.id, rule: "invalid_phone" });
      continue;
    }
    const crit = (criteria ?? {}) as Record<string, unknown>;
    const country = (wsCountry ?? (typeof crit.country === "string" ? crit.country : "CO")) === "US" ? "US" : "CO";
    const ev = await evaluateOutreachForLead(db, lead.id, { channel: "whatsapp", value: phone }, now, { country });
    // A previous export of this same company left a whatsapp reservation: re-exporting is fine.
    const mine = active.filter((m) => m.companyId === company.id);
    const onlyOwnReservation = mine.length > 0 && mine.every((m) => m.channel === "whatsapp" && m.status === "queued");
    const blocks = onlyOwnReservation ? ev.blocks.filter((b) => b.rule !== "already_contacted") : ev.blocks;
    if (blocks.length) {
      for (const b of blocks) if (b.rule === "outside_window") nextAllowedAt = b.nextAllowedAt ?? nextAllowedAt;
      skipped.push({ leadId: lead.id, rule: blocks[0]!.rule });
      continue;
    }
    seenCompanies.add(company.id);
    if (opts.reserve && !onlyOwnReservation) {
      await db.insert(messages).values({
        leadId: lead.id, contactChannel: "whatsapp", body: "Reserva de secuencia WhatsApp (export CSV)", status: "queued",
        providerId: reservationId(lead.id), recipient: phone,
      });
    }
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
