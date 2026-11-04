import type Anthropic from "@anthropic-ai/sdk";
import { and, asc, desc, eq, gt, ne, sql } from "drizzle-orm";
import { waAgents, waConversations, waMessages } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { isSuppressed, suppress } from "@/features/compliance/suppression";
import { aiCostUsd, loadAiRates } from "@/features/scoring/cost";
import { getServiceCatalog } from "@/features/settings/services";
import type { InboundMessage, WaCloudAdapter } from "@/integrations/wa-cloud";
import { hasEmoji, inventedTimes, isOptOut, sanitizeOutgoing } from "./guard";
import type { AgentLlm, LlmUsage } from "./llm";
import type { MokubBooking } from "./mokub";
import type { Notifier } from "./notify";
import { dynamicSystemPrompt, PROMPT_VERSION, staticSystemPrompt } from "./prompt";
import { runTool, TOOLS } from "./tools";

export const CONVERSATION_IDLE_MS = 24 * 3600 * 1000;
const MAX_TOOL_ROUNDS = 4;
const HISTORY = 40;

export const FIXED = {
  optOut: "Entendido. No le volveremos a escribir por este medio. Que tenga un buen día.",
  media: "Gracias. Por ahora solo leo mensajes de texto: ¿me lo puede escribir?",
  fallbackTimes: "Para no darle una hora equivocada, ¿qué día y en qué franja le sirve mejor, mañana o tarde (hora de Bogotá)? El equipo le confirma la hora y el enlace por este mismo chat.",
  error: "Disculpe, tuve un problema para responder. Una persona del equipo de Mokub le escribe por este mismo chat.",
} as const;

export interface AgentDeps {
  llm: AgentLlm;
  wa: WaCloudAdapter;
  booking: MokubBooking;
  notify: Notifier;
  /** Closes a conversation into Faro (lead, qualification, cost). Injected to keep the engine testable. */
  close: (db: AppDb, conversationId: string) => Promise<void>;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  debounceMs?: number;
}

type Conversation = typeof waConversations.$inferSelect;

/** The agent row for a business number; created on first use. */
export async function ensureAgent(db: AppDb, phoneNumberId: string, model: string) {
  const [row] = await db
    .insert(waAgents)
    .values({ name: "Mokub · Ventas", phoneNumberId, promptVersion: PROMPT_VERSION, model })
    .onConflictDoUpdate({ target: waAgents.phoneNumberId, set: { promptVersion: PROMPT_VERSION, model } })
    .returning();
  return row!;
}

const REF = /\(\s*ref\.?\s*([\w-]{3,80})\s*\)/i;

export interface InboundOutcome {
  duplicate: boolean;
  conversationId: string | null;
  messageId: string | null;
  /** Whether the agent should answer (not a duplicate, not suppressed, not with a person). */
  reply: boolean;
}

/** Stores one inbound message (idempotent by wamid) in its conversation. Answering is a separate step (`replyTo`). */
export async function recordInbound(db: AppDb, deps: Pick<AgentDeps, "close" | "now" | "llm">, msg: InboundMessage): Promise<InboundOutcome> {
  const now = deps.now?.() ?? new Date();
  const [seen] = await db.select({ id: waMessages.id }).from(waMessages).where(eq(waMessages.wamid, msg.wamid)).limit(1);
  if (seen) return { duplicate: true, conversationId: null, messageId: null, reply: false };

  const agent = await ensureAgent(db, msg.phoneNumberId, deps.llm.model);
  let conv = await currentConversation(db, agent.id, msg.from, now);
  if (!conv) {
    // A stale open conversation is closed into Faro before the new one starts.
    const [stale] = await db
      .select({ id: waConversations.id })
      .from(waConversations)
      .where(and(eq(waConversations.agentId, agent.id), eq(waConversations.phone, msg.from), ne(waConversations.status, "cerrada")))
      .limit(1);
    if (stale) await deps.close(db, stale.id);
    const ref = msg.text?.match(REF)?.[1] ?? null;
    [conv] = await db
      .insert(waConversations)
      .values({
        agentId: agent.id,
        phone: msg.from,
        contactName: msg.contactName,
        adId: msg.adId,
        variables: ref ? { ref_diagnostico: ref } : {},
        isMock: deps.llm.isMock,
        lastInboundAt: msg.at,
        lastMessageAt: now,
      })
      .returning();
  }
  const inserted = await db
    .insert(waMessages)
    .values({ conversationId: conv!.id, direction: "in", author: "contacto", wamid: msg.wamid, kind: msg.kind, text: msg.text, status: "received", isMock: deps.llm.isMock })
    .onConflictDoNothing({ target: waMessages.wamid })
    .returning({ id: waMessages.id });
  if (!inserted.length) return { duplicate: true, conversationId: conv!.id, messageId: null, reply: false };
  await db
    .update(waConversations)
    .set({ lastInboundAt: msg.at, lastMessageAt: now, ...(msg.contactName && !conv!.contactName ? { contactName: msg.contactName } : {}), ...(msg.adId && !conv!.adId ? { adId: msg.adId } : {}) })
    .where(eq(waConversations.id, conv!.id));
  const suppressed = await isSuppressed(db, { phone: msg.from });
  const optOut = msg.text ? isOptOut(msg.text) : false;
  return { duplicate: false, conversationId: conv!.id, messageId: inserted[0]!.id, reply: conv!.status === "abierta" && (!suppressed || optOut) };
}

async function currentConversation(db: AppDb, agentId: string, phone: string, now: Date): Promise<Conversation | undefined> {
  const [c] = await db
    .select()
    .from(waConversations)
    .where(and(eq(waConversations.agentId, agentId), eq(waConversations.phone, phone), ne(waConversations.status, "cerrada"), gt(waConversations.lastMessageAt, new Date(now.getTime() - CONVERSATION_IDLE_MS))))
    .orderBy(desc(waConversations.createdAt))
    .limit(1);
  return c;
}

async function latestInboundId(db: AppDb, conversationId: string): Promise<string | undefined> {
  const [m] = await db
    .select({ id: waMessages.id })
    .from(waMessages)
    .where(and(eq(waMessages.conversationId, conversationId), eq(waMessages.direction, "in")))
    .orderBy(desc(waMessages.createdAt), desc(waMessages.id))
    .limit(1);
  return m?.id;
}

/**
 * Waits for the burst to end, then answers every message since the last reply at once. If a newer message arrives
 * while waiting or while the model thinks, this run steps aside: the newer message's run answers.
 */
export async function replyTo(db: AppDb, deps: AgentDeps, conversationId: string, inboundId: string): Promise<"replied" | "superseded" | "skipped"> {
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  await sleep(deps.debounceMs ?? 4000);
  if ((await latestInboundId(db, conversationId)) !== inboundId) return "superseded";
  const [conv] = await db.select().from(waConversations).where(eq(waConversations.id, conversationId)).limit(1);
  if (!conv || conv.status !== "abierta") return "skipped";
  const [wamidRow] = await db.select({ wamid: waMessages.wamid }).from(waMessages).where(eq(waMessages.id, inboundId)).limit(1);
  if (wamidRow?.wamid) await deps.wa.markRead(wamidRow.wamid, true).catch(() => undefined);
  return runTurn(db, deps, conv, inboundId);
}

const toolResultText = (r: Record<string, unknown>) => JSON.stringify(r).slice(0, 4000);

/** History as alternating user/assistant turns (Anthropic requires it to start with the user). */
export function historyToMessages(rows: { author: string; text: string | null; kind: string }[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const r of rows) {
    const role = r.author === "contacto" ? "user" : "assistant";
    const text = r.kind === "text" && r.text ? (r.author === "persona" ? `[Equipo de Mokub] ${r.text}` : r.text) : `[${r.kind === "audio" ? "audio" : r.kind === "image" ? "imagen" : "mensaje no textual"}]`;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content = `${last.content as string}\n${text}`;
    else out.push({ role, content: text });
  }
  while (out.length && out[0]!.role !== "user") out.shift();
  return out;
}

async function runTurn(db: AppDb, deps: AgentDeps, conv: Conversation, inboundId: string): Promise<"replied" | "superseded" | "skipped"> {
  const now = deps.now?.() ?? new Date();
  const rows = (
    await db
      .select({ author: waMessages.author, text: waMessages.text, kind: waMessages.kind, direction: waMessages.direction })
      .from(waMessages)
      .where(eq(waMessages.conversationId, conv.id))
      .orderBy(desc(waMessages.createdAt), desc(waMessages.id))
      .limit(HISTORY)
  ).reverse();
  // Everything the contact sent since our last message.
  const pending: typeof rows = [];
  for (let i = rows.length - 1; i >= 0 && rows[i]!.direction === "in"; i--) pending.unshift(rows[i]!);
  const pendingText = pending.map((r) => r.text ?? "").join("\n").trim();

  if (pendingText && isOptOut(pendingText)) {
    await suppress(db, conv.phone, "wa_agent_opt_out");
    await saveVariables(db, conv.id, { pidio_baja: true, calificado: false, resumen: "Pidió la baja." });
    await send(db, deps, conv, FIXED.optOut, null);
    await deps.close(db, conv.id);
    return "replied";
  }
  if (!pendingText && pending.length) {
    await send(db, deps, conv, FIXED.media, null);
    return "replied";
  }

  const catalog = await getServiceCatalog(db);
  let variables = { ...conv.variables };
  const usage: LlmUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const add = (u: LlmUsage) => {
    usage.input_tokens += u.input_tokens;
    usage.output_tokens += u.output_tokens;
    usage.cache_read_input_tokens += u.cache_read_input_tokens;
    usage.cache_creation_input_tokens += u.cache_creation_input_tokens;
  };
  const messages = historyToMessages(rows);
  const stable = staticSystemPrompt(catalog.services);
  // Fixed for the whole turn: the model's thinking blocks are bound to the exact system prompt they were made with,
  // so changing it between tool rounds makes the API reject the next call.
  const dynamic = dynamicSystemPrompt({ now, adId: conv.adId, variables: conv.variables });
  const allowEmoji = pending.some((r) => r.text && hasEmoji(r.text));
  let end = false;
  let handoff: string | null = null;
  let text = "";
  // Text the model wrote next to a tool call ("Listo, quedó agendado…" + terminar) is the reply if nothing follows.
  let spoken = "";
  let retriedTimes = false;

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const res = await deps.llm.next({ system: { stable, dynamic }, messages, tools: TOOLS });
      add(res.usage);
      const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const said = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim() || (uses.length ? "" : spoken);
      if (uses.length && said) spoken = said;
      if (!uses.length || round === MAX_TOOL_ROUNDS) {
        const offered = new Set<string>(Array.isArray(variables._slots) ? (variables._slots as string[]) : []);
        const invented = inventedTimes(said, offered);
        if (invented.length && !retriedTimes && round < MAX_TOOL_ROUNDS) {
          retriedTimes = true;
          messages.push({ role: "assistant", content: said || "…" });
          messages.push({ role: "user", content: `[Sistema] Tu respuesta nombra horas (${invented.join(", ")}) que no salieron de consultar_horarios en esta conversación. Usa consultar_horarios primero y ofrece solo horas que devuelva. No menciones este aviso.` });
          continue;
        }
        text = invented.length ? FIXED.fallbackTimes : said;
        break;
      }
      messages.push({ role: "assistant", content: res.content as Anthropic.ContentBlockParam[] });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const u of uses) {
        const { result, effects } = await runTool(u.name, u.input, { phone: conv.phone, variables, booking: deps.booking });
        variables = { ...variables, ...effects.variables };
        if (effects.end) end = true;
        if (effects.handoff) handoff = effects.handoff;
        if (effects.booked) await deps.notify({ kind: "reunion", conversationId: conv.id, phone: conv.phone, detail: `Diagnóstico agendado: ${effects.booked.when}.` });
        if (effects.wantsToBuy) await deps.notify({ kind: "compra", conversationId: conv.id, phone: conv.phone, detail: `Producto: ${String(variables.producto_interes ?? "sin dato")}.` });
        if (effects.failed && Number(variables._fallos ?? 0) === 2) await deps.notify({ kind: "falla", conversationId: conv.id, phone: conv.phone, detail: `La herramienta ${u.name} falló dos veces.` });
        results.push({ type: "tool_result", tool_use_id: u.id, content: toolResultText(result), ...(result.ok === false ? { is_error: true } : {}) });
      }
      messages.push({ role: "user", content: results });
      // Closing tools with a goodbye already written need no extra model call.
      if (said && uses.every((u) => u.name === "terminar" || u.name === "pasar_a_persona")) {
        text = said;
        break;
      }
    }
  } catch (e) {
    console.warn("[wa-agent] model call failed", e instanceof Error ? e.message : e);
    await saveVariables(db, conv.id, variables);
    await send(db, deps, conv, FIXED.error, usage);
    await setStatus(db, conv.id, "humano");
    await deps.notify({ kind: "persona", conversationId: conv.id, phone: conv.phone, detail: "El agente no pudo responder (error del modelo)." });
    return "replied";
  }

  // Last line of defence: no time of day the calendar did not return reaches the contact.
  if (inventedTimes(text, new Set<string>(Array.isArray(variables._slots) ? (variables._slots as string[]) : [])).length) text = FIXED.fallbackTimes;
  await saveVariables(db, conv.id, variables);
  // A newer message arrived while the model was thinking: its own run answers everything.
  if ((await latestInboundId(db, conv.id)) !== inboundId) return "superseded";
  const { text: clean } = sanitizeOutgoing(text || FIXED.error, { allowEmoji });
  await send(db, deps, conv, clean, usage);
  if (handoff) {
    await setStatus(db, conv.id, "humano");
    await deps.notify({ kind: "persona", conversationId: conv.id, phone: conv.phone, detail: `Motivo: ${handoff}` });
  } else if (end) {
    await deps.close(db, conv.id);
  }
  return "replied";
}

async function saveVariables(db: AppDb, id: string, vars: Record<string, unknown>) {
  await db.update(waConversations).set({ variables: vars }).where(eq(waConversations.id, id));
}

export async function setStatus(db: AppDb, id: string, status: "abierta" | "humano" | "cerrada") {
  await db.update(waConversations).set({ status, ...(status === "cerrada" ? { closedAt: new Date() } : {}) }).where(eq(waConversations.id, id));
}

async function send(db: AppDb, deps: Pick<AgentDeps, "wa" | "llm" | "now">, conv: Conversation, body: string, usage: LlmUsage | null) {
  let costUsd = 0;
  // A mock model costs nothing: its made-up token counts never reach the cost totals.
  if (usage && !deps.llm.isMock) {
    const rates = await loadAiRates(db, deps.llm.model);
    // Cache writes bill at 1.25x input and cache reads at 0.1x.
    const effectiveInput = usage.input_tokens + usage.cache_creation_input_tokens * 1.25 + usage.cache_read_input_tokens * 0.1;
    costUsd = Math.round(aiCostUsd({ input_tokens: effectiveInput, output_tokens: usage.output_tokens }, rates) * 1e6) / 1e6;
  }
  await sendAs(db, deps, conv, body, "agente", { usage, costUsd });
}

/** Sends a text and stores it (agent or a person from the inbox). A failed send is stored as failed, not thrown. */
export async function sendAs(
  db: AppDb,
  deps: Pick<AgentDeps, "wa" | "llm" | "now">,
  conv: Pick<Conversation, "id" | "phone">,
  body: string,
  author: "agente" | "persona",
  meta: { usage?: LlmUsage | null; costUsd?: number } = {},
): Promise<{ ok: boolean }> {
  const [row] = await db
    .insert(waMessages)
    .values({
      conversationId: conv.id,
      direction: "out",
      author,
      kind: "text",
      text: body,
      status: "pending",
      inputTokens: meta.usage ? meta.usage.input_tokens + meta.usage.cache_creation_input_tokens + meta.usage.cache_read_input_tokens : 0,
      outputTokens: meta.usage?.output_tokens ?? 0,
      costUsd: meta.costUsd ?? 0,
      model: author === "agente" && meta.usage ? deps.llm.model : null,
      isMock: deps.wa.isMock,
    })
    .returning({ id: waMessages.id });
  try {
    const { wamid } = await deps.wa.sendText(conv.phone, body);
    await db.update(waMessages).set({ wamid, status: "sent" }).where(eq(waMessages.id, row!.id));
    await db.update(waConversations).set({ lastMessageAt: deps.now?.() ?? new Date() }).where(eq(waConversations.id, conv.id));
    return { ok: true };
  } catch (e) {
    console.warn("[wa-agent] send failed", e instanceof Error ? e.message : e);
    await db.update(waMessages).set({ status: "failed" }).where(eq(waMessages.id, row!.id));
    return { ok: false };
  }
}

/** Delivery receipts for messages we sent. Never moves a status backwards (read stays read). */
export async function applyStatus(db: AppDb, wamid: string, status: string) {
  const order = ["pending", "sent", "delivered", "read"];
  if (status === "failed") {
    await db.update(waMessages).set({ status: "failed" }).where(eq(waMessages.wamid, wamid));
    return;
  }
  const idx = order.indexOf(status);
  if (idx < 0) return;
  const lower = order.slice(0, idx);
  await db
    .update(waMessages)
    .set({ status })
    .where(and(eq(waMessages.wamid, wamid), sql`${waMessages.status} in (${sql.join(lower.map((s) => sql`${s}`), sql`, `)})`));
}

/** Within Meta's 24 h customer-service window (free-form text allowed). */
export function inServiceWindow(lastInboundAt: Date | null, now: Date = new Date()): boolean {
  return !!lastInboundAt && now.getTime() - lastInboundAt.getTime() < CONVERSATION_IDLE_MS;
}

export const conversationMessages = (db: AppDb, id: string) => db.select().from(waMessages).where(eq(waMessages.conversationId, id)).orderBy(asc(waMessages.createdAt), asc(waMessages.id));
