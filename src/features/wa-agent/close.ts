import { and, eq, lt, ne } from "drizzle-orm";
import { z } from "zod";
import { costEntries, leads, waConversations, waMessages } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { trackQualifiedLead, trackSchedule } from "@/features/tracking/meta";
import { complete, type AnthropicAdapter } from "@/integrations/anthropic";
import { daptaWebhookSchema, processDaptaWebhook } from "@/integrations/dapta/webhook";
import type { Env } from "@/lib/env";
import { CONVERSATION_IDLE_MS } from "./engine";

const Summary = z.object({ calificado: z.boolean(), resumen: z.string().trim().min(3).max(600) });

export interface CloseDeps {
  env: Pick<Env, "DAPTA_CREDIT_USD" | "DAPTA_CREDITS_PER_AI_REPLY">;
  /** Writes the qualification when the agent never called `terminar` (idle close). Haiku is enough. */
  summarizer: AnthropicAdapter;
  /** Sends Meta's QualifiedLead/Schedule for leads that consented (never for agent-created ones). Off in tests. */
  track?: boolean;
}

/**
 * F44 · Closes a conversation into Faro through the same path as the Dapta webhook (F39): lead found or created,
 * qualification, events, then the agent's AI cost on the lead. Idempotent: a closed conversation is left alone.
 */
export async function closeConversation(db: AppDb, deps: CloseDeps, conversationId: string): Promise<{ leadId: string | null; qualified: boolean } | null> {
  const [conv] = await db.select().from(waConversations).where(eq(waConversations.id, conversationId)).limit(1);
  if (!conv || conv.status === "cerrada") return null;
  const msgs = await db
    .select({ author: waMessages.author, text: waMessages.text, costUsd: waMessages.costUsd, direction: waMessages.direction })
    .from(waMessages)
    .where(eq(waMessages.conversationId, conversationId))
    .orderBy(waMessages.createdAt, waMessages.id);
  // Only our template, no reply: nothing to qualify. It is closed quietly (a reply reopens it, see engine.ts).
  if (!msgs.some((m) => m.direction === "in")) {
    await db.update(waConversations).set({ status: "cerrada", closedAt: new Date() }).where(and(eq(waConversations.id, conv.id), ne(waConversations.status, "cerrada")));
    return { leadId: conv.leadId, qualified: false };
  }
  const v = conv.variables as Record<string, unknown>;
  const optOut = v.pidio_baja === true;

  let calificado = typeof v.calificado === "boolean" ? v.calificado : null;
  let resumen = typeof v.resumen === "string" ? v.resumen : null;
  if (calificado === null && !optOut) {
    const transcript = msgs.map((m) => `${m.author === "contacto" ? "Contacto" : m.author === "persona" ? "Equipo" : "Agente"}: ${m.text ?? "[no textual]"}`).join("\n").slice(-8000);
    try {
      const r = await complete(
        deps.summarizer,
        `Resume esta conversación de WhatsApp del asistente de ventas de Mokub y decide si el contacto quedó calificado.\nCalificado: agendó el diagnóstico, quiere comprar, o es un negocio con una necesidad clara que Mokub resuelve e interés en los próximos 3 meses. No calificado en otro caso.\nResponde solo JSON {"calificado": boolean, "resumen": "una o dos frases: tipo de negocio, necesidad, producto, urgencia y siguiente paso; sin correos ni nombres de personas"}.\n<conversacion>\n${transcript}\n</conversacion>`,
        Summary,
        { task: "wa_agent_summary" },
      );
      calificado = r.data.calificado;
      resumen = r.data.resumen;
    } catch {
      calificado = v.reunion_agendada === true || v.quiere_comprar === true;
      resumen = resumen ?? "Sin resumen (falló el resumen automático).";
    }
  }

  const ref = typeof v.ref_diagnostico === "string" ? v.ref_diagnostico : conv.adId ? `meta-${conv.adId}` : null;
  const replies = msgs.filter((m) => m.direction === "out").length;
  const payload = daptaWebhookSchema.parse({
    conversation_id: `wa:${conv.id}`,
    // A template conversation already knows its lead.
    lead_id: conv.leadId,
    phone: conv.phone,
    email: typeof v._email === "string" ? v._email : null,
    qualified: optOut ? false : !!calificado,
    summary: resumen,
    opt_out: optOut,
    product: typeof v.producto_interes === "string" ? v.producto_interes : null,
    meeting_booked: v.reunion_agendada === true,
    meeting_at: typeof v.fecha_reunion === "string" && !Number.isNaN(Date.parse(v.fecha_reunion)) ? v.fecha_reunion : null,
    wants_to_buy: v.quiere_comprar === true,
    ref,
    business_name: typeof v.nombre_negocio === "string" ? v.nombre_negocio : null,
    ad_click: !!conv.adId,
    ai_replies: 0, // the AI cost is recorded below from real tokens, not Dapta credits
  });

  // Claim the close first so two closers never both write.
  const claimed = await db
    .update(waConversations)
    .set({ status: "cerrada", closedAt: new Date() })
    .where(and(eq(waConversations.id, conv.id), ne(waConversations.status, "cerrada")))
    .returning({ id: waConversations.id });
  if (!claimed.length) return null;

  const result = await processDaptaWebhook(db, payload, deps.env, { origin: "wa_agent" });
  if (!result.ok) return { leadId: null, qualified: false };
  if (result.leadId) await db.update(waConversations).set({ leadId: result.leadId }).where(eq(waConversations.id, conv.id));

  const usd = Math.round(msgs.reduce((s, m) => s + (m.costUsd ?? 0), 0) * 1e6) / 1e6;
  if (result.leadId && usd > 0 && !result.duplicate) {
    const [lead] = await db.select().from(leads).where(eq(leads.id, result.leadId)).limit(1);
    await db.insert(costEntries).values({
      leadId: result.leadId,
      huntId: lead?.huntId ?? null,
      sourceChannel: lead?.primarySource ?? null,
      contactChannel: "whatsapp",
      category: "ai",
      quantity: replies,
      unit: "ai_reply",
      rate: replies ? Math.round((usd / replies) * 1e6) / 1e6 : 0,
      usd,
      evidence: `wa_agent conversation ${conv.id}`,
      isDemo: false,
      isMock: conv.isMock,
    });
  }
  if (deps.track && result.qualified && !result.duplicate && result.leadId && !optOut && result.adsConsent) {
    await trackQualifiedLead(db, { leadId: result.leadId, conversationId: payload.conversation_id, email: payload.email, phone: payload.phone });
    if (result.meetingBooked) await trackSchedule(db, { leadId: result.leadId, conversationId: payload.conversation_id, email: payload.email, phone: payload.phone });
  }
  return { leadId: result.leadId, qualified: result.qualified };
}

/** Conversations quiet for 24 h (open or with a person) are closed into Faro. Returns how many. */
export async function closeIdleConversations(db: AppDb, deps: CloseDeps, now: Date = new Date()): Promise<number> {
  const idle = await db
    .select({ id: waConversations.id })
    .from(waConversations)
    .where(and(ne(waConversations.status, "cerrada"), lt(waConversations.lastMessageAt, new Date(now.getTime() - CONVERSATION_IDLE_MS))))
    .limit(50);
  let n = 0;
  for (const c of idle) if (await closeConversation(db, deps, c.id)) n++;
  return n;
}

