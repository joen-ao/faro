import { and, eq, inArray } from "drizzle-orm";
import { companies, leads, messages } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { rneStatus } from "./rne";
import { isSuppressed } from "./suppression";
import { checkSendWindow, type Country, type SendWindowSetting } from "./windows";
import { getSendWindow } from "@/features/settings/send-window";

export type BlockRule =
  | "natural_person"
  /** F55: the contact is in the CRC Registro de Números Excluidos (Ley 2300): never contacted, not even by hand. */
  | "rne_excluded"
  /** F55: a natural person's contact has no recent RNE check. */
  | "rne_pending"
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
  /** F55: RNE status of the contact value, for natural persons (companies' generic mailboxes are not checked). */
  rne?: "clear" | "excluded" | "pending";
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
  /** Active send window (panel setting); defaults to SEND_WINDOW_POLICY. */
  window?: SendWindowSetting;
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
  // F41: natural persons and personal mailboxes are allowed (owner's decision after the hackathon); the rest still applies.
  // F55: but a natural person's email or phone must first pass the CRC RNE check (Ley 2300), even for a manual contact.
  if (!lead.isLegalEntity && lead.rne === "excluded") {
    blocks.push({ rule: "rne_excluded", message: "Está inscrito en el Registro de Números Excluidos (RNE, Ley 2300): no se le puede escribir con fines comerciales." });
  } else if (!lead.isLegalEntity && lead.rne !== "clear") {
    blocks.push({ rule: "rne_pending", message: "Independiente (persona natural): antes de escribirle hay que consultar su dato en el RNE de la CRC (Ley 2300). Hazlo en Configuración → Envío." });
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
    blocks.push({ rule: "sender_missing", message: "El mensaje debe identificar al remitente (quién escribe, cómo responder y por qué le escribimos)." });
  }
  const win = checkSendWindow(now, lead.country, opts.window);
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
  const rne = row.isLegal ? undefined : await rneStatus(db, contact.value, now);
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
      ...(rne ? { rne } : {}),
    },
    contact,
    now,
    { ...opts, window: opts.window ?? (await getSendWindow(db)).setting },
  );
}
