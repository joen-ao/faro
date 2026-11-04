import { and, eq, gt, lt, sql } from "drizzle-orm";
import { waConversations, waMessages } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { isSuppressed } from "@/features/compliance/suppression";
import { checkSendWindow } from "@/features/compliance/windows";
import { aiCostUsd, loadAiRates } from "@/features/scoring/cost";
import { getSendWindow } from "@/features/settings/send-window";
import { getServiceCatalog } from "@/features/settings/services";
import { CONVERSATION_IDLE_MS, historyToMessages, sendAs, type AgentDeps } from "./engine";
import { inventedTimes, sanitizeOutgoing } from "./guard";
import { dynamicSystemPrompt, staticSystemPrompt } from "./prompt";

export const FOLLOWUP_FALLBACK = "¿Pudo revisar lo que le comenté? Si le sirve, le ayudo a agendar el diagnóstico gratis de 20 minutos.";

const NOTE =
  "[Sistema] La persona no ha respondido tu último mensaje. Escribe UN seguimiento breve y cordial que retome lo último que se habló, sin presión, con una sola pregunta. No repitas tu mensaje anterior, no ofrezcas horas sin consultarlas y no menciones este aviso.";

export interface FollowupOptions {
  afterMin: number;
  max: number;
  now?: Date;
}

/**
 * F45 · One follow-up for conversations that went quiet after the agent asked something: still inside Meta's 24 h
 * window, inside Colombia's send hours, open (not with a person), no booked call, not suppressed. Each one is claimed
 * with a conditional update first, so two cron runs never send it twice.
 */
export async function runFollowups(db: AppDb, deps: AgentDeps, opts: FollowupOptions): Promise<{ sent: number; skipped: number }> {
  const now = opts.now ?? new Date();
  const out = { sent: 0, skipped: 0 };
  if (opts.max < 1) return out;
  const win = checkSendWindow(now, "CO", (await getSendWindow(db)).setting);
  if (!win.allowed) return out;
  const quietSince = new Date(now.getTime() - opts.afterMin * 60_000);
  // Leave an hour of margin before the 24 h window closes, so the follow-up is never refused by Meta.
  const windowStart = new Date(now.getTime() - CONVERSATION_IDLE_MS + 3600_000);
  const candidates = await db
    .select()
    .from(waConversations)
    .where(
      and(
        eq(waConversations.status, "abierta"),
        lt(waConversations.lastMessageAt, quietSince),
        gt(waConversations.lastInboundAt, windowStart),
        sql`coalesce((${waConversations.variables}->>'_seguimientos')::int, 0) < ${opts.max}`,
        sql`coalesce((${waConversations.variables}->>'reunion_agendada')::boolean, false) = false`,
      ),
    )
    .limit(25);

  for (const c of candidates) {
    const rows = await db
      .select({ author: waMessages.author, text: waMessages.text, kind: waMessages.kind, direction: waMessages.direction })
      .from(waMessages)
      .where(eq(waMessages.conversationId, c.id))
      .orderBy(waMessages.createdAt, waMessages.id);
    const last = rows[rows.length - 1];
    // Only after the agent asked something: never after a goodbye, a person's message or a template.
    if (!last || last.author !== "agente" || last.kind !== "text" || !last.text?.trim().endsWith("?") || (await isSuppressed(db, { phone: c.phone }))) {
      out.skipped++;
      continue;
    }
    const claimed = await db
      .update(waConversations)
      .set({ variables: sql`jsonb_set(${waConversations.variables}, '{_seguimientos}', to_jsonb(coalesce((${waConversations.variables}->>'_seguimientos')::int, 0) + 1))` })
      .where(and(eq(waConversations.id, c.id), sql`coalesce((${waConversations.variables}->>'_seguimientos')::int, 0) < ${opts.max}`))
      .returning({ id: waConversations.id });
    if (!claimed.length) {
      out.skipped++;
      continue;
    }

    let text = FOLLOWUP_FALLBACK;
    let costUsd = 0;
    let usage = null;
    try {
      const catalog = await getServiceCatalog(db);
      const messages = historyToMessages(rows);
      messages.push({ role: "user", content: NOTE });
      const res = await deps.llm.next({ system: { stable: staticSystemPrompt(catalog.services), dynamic: dynamicSystemPrompt({ now, adId: c.adId, variables: c.variables }) }, messages, tools: [] });
      usage = res.usage;
      const said = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
      const offered = new Set<string>(Array.isArray(c.variables._slots) ? (c.variables._slots as string[]) : []);
      if (said && !inventedTimes(said, offered).length) text = sanitizeOutgoing(said, { allowEmoji: false }).text;
      if (!deps.llm.isMock) {
        const rates = await loadAiRates(db, deps.llm.model);
        const effectiveInput = usage.input_tokens + usage.cache_creation_input_tokens * 1.25 + usage.cache_read_input_tokens * 0.1;
        costUsd = Math.round(aiCostUsd({ input_tokens: effectiveInput, output_tokens: usage.output_tokens }, rates) * 1e6) / 1e6;
      }
    } catch (e) {
      console.warn("[wa-agent] follow-up model call failed", e instanceof Error ? e.message : e);
    }
    const r = await sendAs(db, deps, c, text, "agente", { usage, costUsd });
    if (r.ok) out.sent++;
    else out.skipped++;
  }
  return out;
}
