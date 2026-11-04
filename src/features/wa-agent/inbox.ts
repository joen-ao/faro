import { desc, eq, sql } from "drizzle-orm";
import { companies, leads, waConversations, waMessages } from "@/db/schema";
import type { AppDb } from "@/db/types";

export interface InboxRow {
  id: string;
  phone: string;
  contactName: string | null;
  business: string | null;
  status: "abierta" | "humano" | "cerrada";
  lastMessageAt: Date;
  lastText: string | null;
  lastAuthor: string | null;
  messages: number;
  costUsd: number;
  meeting: boolean;
  fromAd: boolean;
  isMock: boolean;
}

/** Open and with-a-person first, newest first. */
export async function listConversations(db: AppDb, limit = 100): Promise<InboxRow[]> {
  const rows = await db
    .select({
      c: waConversations,
      business: companies.name,
      messages: sql<number>`(select count(*)::int from ${waMessages} m where m.conversation_id = ${waConversations.id})`,
      costUsd: sql<number>`(select coalesce(sum(m.cost_usd), 0)::float from ${waMessages} m where m.conversation_id = ${waConversations.id})`,
      lastText: sql<string | null>`(select m.text from ${waMessages} m where m.conversation_id = ${waConversations.id} order by m.created_at desc, m.id desc limit 1)`,
      lastAuthor: sql<string | null>`(select m.author::text from ${waMessages} m where m.conversation_id = ${waConversations.id} order by m.created_at desc, m.id desc limit 1)`,
    })
    .from(waConversations)
    .leftJoin(leads, eq(leads.id, waConversations.leadId))
    .leftJoin(companies, eq(companies.id, leads.companyId))
    .orderBy(sql`case ${waConversations.status} when 'humano' then 0 when 'abierta' then 1 else 2 end`, desc(waConversations.lastMessageAt))
    .limit(limit);
  return rows.map(({ c, business, messages, costUsd, lastText, lastAuthor }) => {
    const v = c.variables as Record<string, unknown>;
    return {
      id: c.id,
      phone: c.phone,
      contactName: c.contactName,
      business: business ?? (typeof v.nombre_negocio === "string" ? v.nombre_negocio : null),
      status: c.status,
      lastMessageAt: c.lastMessageAt,
      lastText,
      lastAuthor,
      messages,
      costUsd: Number(costUsd),
      meeting: v.reunion_agendada === true,
      fromAd: !!c.adId || (typeof v.ref_diagnostico === "string" && /^(meta|fb|ig)[-_]/i.test(v.ref_diagnostico)),
      isMock: c.isMock,
    };
  });
}

export async function getConversation(db: AppDb, id: string) {
  const [c] = await db.select().from(waConversations).where(eq(waConversations.id, id)).limit(1);
  if (!c) return null;
  const messages = await db.select().from(waMessages).where(eq(waMessages.conversationId, id)).orderBy(waMessages.createdAt, waMessages.id);
  return { conversation: c, messages };
}
