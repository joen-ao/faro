import { and, eq, inArray } from "drizzle-orm";
import { companies, leads, messages } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { isGenericEmail } from "./email";
import { isSuppressed } from "./suppression";
import { checkSendWindow, type Country } from "./windows";

export type BlockRule =
  | "natural_person"
  | "personal_email"
  | "suppressed"
  | "outside_window"
  | "already_contacted"
  | "channel_not_allowed"
  | "sender_missing"
  | "sender_address_missing";

export interface OutreachBlock {
  rule: BlockRule;
  message: string;
  /** When the block is time-based, the next allowed instant. */
  nextAllowedAt?: Date | null;
}

export interface OutreachLead {
  country: Country;
  isLegalEntity: boolean;
  /** true when the legal-entity flag comes from a registry (RUES/REPS), false = heuristic "por verificar". */
  legalVerified?: boolean;
  suppressed: boolean;
  /** A message to this company was already sent/queued (max 1 per company). */
  alreadyContacted: boolean;
}

export interface OutreachContact {
  channel: "email" | "web_form" | "whatsapp" | "dapta_widget";
  value: string;
  isGeneric?: boolean;
}

export interface OutreachOptions {
  sendEnabled?: boolean;
  senderIdentified?: boolean;
  /** CAN-SPAM requires a physical address for US email. */
  senderAddress?: string | null;
}

export interface OutreachEvaluation {
  allowed: boolean;
  /** SEND_ENABLED=false: the pipeline runs but nothing leaves. */
  simulated: boolean;
  blocks: OutreachBlock[];
  /** Legal-entity status is only a heuristic: show "por verificar". */
  unverifiedLegal: boolean;
  note?: string;
}

/** Pure compliance gate (SPEC §8). Every block carries a human-readable explanation. */
export function evaluateOutreach(
  lead: OutreachLead,
  contact: OutreachContact,
  now: Date,
  opts: OutreachOptions = {},
): OutreachEvaluation {
  const blocks: OutreachBlock[] = [];
  if (!lead.isLegalEntity) {
    blocks.push({ rule: "natural_person", message: "Persona natural o profesional independiente: solo se contacta a personas jurídicas." });
  }
  if (contact.channel === "email") {
    if (!isGenericEmail(contact.value)) {
      blocks.push({ rule: "personal_email", message: "Solo se usan buzones genéricos de empresa (info@, contacto@, citas@…); este correo no lo es o parece de una persona." });
    }
  }
  if (lead.suppressed) blocks.push({ rule: "suppressed", message: "El contacto o su dominio está en la lista de supresión (opt-out): no se contacta nunca más." });
  if (lead.alreadyContacted) blocks.push({ rule: "already_contacted", message: "Ya se contactó a esta empresa: máximo 1 mensaje por empresa, sin seguimientos." });
  if (lead.country === "US" && contact.channel !== "email") {
    blocks.push({ rule: "channel_not_allowed", message: "EE. UU.: solo correo (CAN-SPAM); sin llamadas, SMS ni WhatsApp." });
  }
  if (lead.country === "US" && contact.channel === "email" && !opts.senderAddress) {
    blocks.push({ rule: "sender_address_missing", message: "CAN-SPAM exige dirección física del remitente (SENDER_ADDRESS)." });
  }
  if (opts.senderIdentified === false) {
    blocks.push({ rule: "sender_missing", message: "El mensaje debe identificar al remitente (producto, 30X Hackathon, correo de respuesta, motivo)." });
  }
  const win = checkSendWindow(now, lead.country);
  if (!win.allowed) blocks.push({ rule: "outside_window", message: `Fuera de ventana de envío: ${win.reason}.`, nextAllowedAt: win.nextAllowedAt });

  const allowed = blocks.length === 0;
  const simulated = !(opts.sendEnabled ?? false);
  return {
    allowed,
    simulated: allowed && simulated,
    blocks,
    unverifiedLegal: lead.isLegalEntity && lead.legalVerified === false,
    ...(allowed && simulated ? { note: "SEND_ENABLED=false: envío simulado, no sale ningún mensaje." } : {}),
  };
}

/** Loads suppression / contacted state from the DB and evaluates. */
export async function evaluateOutreachForLead(
  db: AppDb,
  leadId: string,
  contact: OutreachContact,
  now: Date,
  opts: OutreachOptions & { country?: Country; legalVerified?: boolean } = {},
): Promise<OutreachEvaluation> {
  const [row] = await db
    .select({ companyId: leads.companyId, isLegal: companies.isLegalEntity, website: companies.website })
    .from(leads)
    .innerJoin(companies, eq(companies.id, leads.companyId))
    .where(eq(leads.id, leadId))
    .limit(1);
  if (!row) throw new Error(`Lead ${leadId} not found`);
  const sibling = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(leads, eq(leads.id, messages.leadId))
    .where(and(eq(leads.companyId, row.companyId), inArray(messages.status, ["queued", "sent", "delivered"])))
    .limit(1);
  const suppressed = await isSuppressed(db, {
    ...(contact.channel === "email" ? { email: contact.value } : {}),
    ...(contact.channel === "whatsapp" ? { phone: contact.value } : {}),
    ...(row.website ? { domain: row.website } : {}),
  });
  return evaluateOutreach(
    {
      country: opts.country ?? "CO",
      isLegalEntity: row.isLegal,
      ...(opts.legalVerified !== undefined ? { legalVerified: opts.legalVerified } : {}),
      suppressed,
      alreadyContacted: sibling.length > 0,
    },
    contact,
    now,
    opts,
  );
}
