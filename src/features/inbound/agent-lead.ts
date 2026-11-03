import { randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { companies, contactPoints, events, leads } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { isGenericEmail, isLegalEntity } from "@/features/compliance/email";
import { normalizeName } from "@/features/diagnostic/normalize";

/**
 * F39 · Someone wrote to the WhatsApp agent without being in Faro (an ad, mokub.co, word of mouth). The lead is
 * created from the conversation so its qualification, booked call and purchase intent are not lost. Slugs start with
 * `wa-`: these contacts gave no advertising consent, so nothing about them goes to Meta's Conversions API.
 */
export const AGENT_LEAD_PREFIX = "wa-";
export const isAgentLead = (slug: string | null | undefined) => !!slug?.startsWith(AGENT_LEAD_PREFIX);

/** "meta-<ad id>" (or fb-/ig-) in the conversation's "(ref. …)" is the ad that brought the visitor (mokub.co button). */
export function adFromRef(ref: string | null | undefined): string | null {
  const m = ref?.trim().match(/^(?:meta|fb|ig)[-_](\d{5,25})$/i);
  return m ? m[1]! : null;
}

export interface AgentLeadInput {
  phone: string;
  email?: string | null;
  businessName?: string | null;
  ref?: string | null;
  /** Dapta reported a Meta click-to-WhatsApp marker (ctwa_clid / referral from an ad). */
  adClick?: boolean;
  conversationId: string;
}

const masked = (phone: string) => `Contacto de WhatsApp ··· ${phone.replace(/\D/g, "").slice(-4)}`;

/** Finds the agent-created lead for this phone or creates it; serialised per phone so two deliveries make one lead. */
export async function findOrCreateAgentLead(db: AppDb, input: AgentLeadInput) {
  const ad = adFromRef(input.ref);
  const fromMeta = !!ad || input.adClick === true;
  const source = fromMeta ? ("meta_ads" as const) : ("website" as const);
  const name = input.businessName?.trim().slice(0, 160) || masked(input.phone);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`inbound:${input.phone}`}))`);
    const [hit] = await tx
      .select({ lead: leads })
      .from(contactPoints)
      .innerJoin(leads, eq(leads.companyId, contactPoints.companyId))
      .where(and(inArray(contactPoints.type, ["phone", "whatsapp"]), eq(contactPoints.value, input.phone)))
      .limit(1);
    if (hit) return hit.lead;
    const [company] = await tx
      .insert(companies)
      .values({ name, normalizedName: normalizeName(name), isLegalEntity: input.businessName ? isLegalEntity(name).legal : false })
      .returning();
    const email = input.email?.trim().toLowerCase();
    await tx.insert(contactPoints).values([
      { companyId: company!.id, type: "whatsapp" as const, value: input.phone, isGeneric: false, sourceChannel: source },
      ...(email ? [{ companyId: company!.id, type: "email" as const, value: email, isGeneric: isGenericEmail(email), sourceChannel: source }] : []),
    ]);
    const [lead] = await tx
      .insert(leads)
      .values({ companyId: company!.id, status: "responded", primarySource: source, slug: `${AGENT_LEAD_PREFIX}${randomBytes(6).toString("hex")}` })
      .returning();
    // The arrival event carries the ad id as utm_content, the same key Meta's url_tags use (F29), so the ad gets the lead.
    await tx.insert(events).values({
      leadId: lead!.id,
      type: "form_submit",
      payload: { origin: "whatsapp_agent", conversation_id: input.conversationId, ref: input.ref ?? null, ad_click: input.adClick === true },
      utm: fromMeta ? { utm_source: "meta", ...(ad ? { utm_content: ad } : {}), origin: "whatsapp_agent" } : { origin: "whatsapp_agent" },
      isDemo: false,
    });
    return lead!;
  });
}
