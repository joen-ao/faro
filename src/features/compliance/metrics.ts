import { eq } from "drizzle-orm";
import { companies, events, leads, messages } from "@/db/schema";
import type { AppDb } from "@/db/types";

export interface ComplianceMessageRow {
  status: "draft" | "queued" | "sent" | "delivered" | "failed" | "blocked" | "simulated";
  body: string;
  blockedByRule: string | null;
  isMock: boolean;
  isLegalEntity: boolean;
}

export interface ComplianceInput {
  messages: ComplianceMessageRow[];
  /** Number of opt-out events recorded. */
  optOuts: number;
  /** Messages sent/queued to a contact after it was suppressed (should be 0). */
  sentAfterOptOut: number;
}

export interface ComplianceMetrics {
  /** Must be 0. */
  naturalPersonsContacted: number;
  /** Share (0-100) of sent messages that identify the sender; null when nothing was sent. */
  senderIdentifiedPct: number | null;
  optOutsTotal: number;
  /** Opt-outs honored = opt-outs minus messages sent afterwards. */
  optOutsRespected: number;
  blockedBySchedule: number;
  blockedTotal: number;
  sentTotal: number;
}

const SENT = new Set(["sent", "delivered"]);

/** A message identifies the sender if it carries the opt-out link and the hackathon/project identification. */
export function messageIdentifiesSender(body: string): boolean {
  const b = body.toLowerCase();
  return /30x/.test(b) && /(\/baja\/|\/api\/optout\/|darse de baja|dar de baja|unsubscribe)/.test(b) && /(@|responde)/.test(b);
}

/** Pure panel numbers (SPEC §8). Mock messages are excluded from real totals. */
export function computeComplianceMetrics(input: ComplianceInput): ComplianceMetrics {
  const real = input.messages.filter((m) => !m.isMock);
  const sent = real.filter((m) => SENT.has(m.status));
  const identified = sent.filter((m) => messageIdentifiesSender(m.body)).length;
  const blocked = real.filter((m) => m.status === "blocked");
  return {
    naturalPersonsContacted: sent.filter((m) => !m.isLegalEntity).length,
    senderIdentifiedPct: sent.length ? Math.round((identified / sent.length) * 1000) / 10 : null,
    optOutsTotal: input.optOuts,
    optOutsRespected: Math.max(0, input.optOuts - input.sentAfterOptOut),
    blockedBySchedule: blocked.filter((m) => m.blockedByRule === "outside_window").length,
    blockedTotal: blocked.length,
    sentTotal: sent.length,
  };
}

export async function queryComplianceMetrics(db: AppDb): Promise<ComplianceMetrics> {
  const rows = await db
    .select({
      status: messages.status,
      body: messages.body,
      blockedByRule: messages.blockedByRule,
      isMock: messages.isMock,
      isLegalEntity: companies.isLegalEntity,
    })
    .from(messages)
    .innerJoin(leads, eq(leads.id, messages.leadId))
    .innerJoin(companies, eq(companies.id, leads.companyId));
  const optOuts = (await db.select({ id: events.id }).from(events).where(eq(events.type, "opt_out"))).length;
  const after = await countSentAfterOptOut(db);
  return computeComplianceMetrics({ messages: rows, optOuts, sentAfterOptOut: after });
}

async function countSentAfterOptOut(db: AppDb): Promise<number> {
  const optEvents = await db.select({ leadId: events.leadId, at: events.at }).from(events).where(eq(events.type, "opt_out"));
  const optAt = new Map(optEvents.map((e) => [e.leadId, e.at.getTime()]));
  const msgs = await db.select({ leadId: messages.leadId, status: messages.status, sentAt: messages.sentAt }).from(messages);
  return msgs.filter((m) => SENT.has(m.status) && m.sentAt && optAt.has(m.leadId) && m.sentAt.getTime() > optAt.get(m.leadId)!).length;
}
