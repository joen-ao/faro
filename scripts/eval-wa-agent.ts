/**
 * F44 · Evaluates the WhatsApp agent end to end with the REAL model (costs money: run only with approval).
 *   npm run eval:wa-agent                       -> every scenario with ANTHROPIC_WA_AGENT_MODEL (default Haiku 5.5)
 *   npm run eval:wa-agent -- --model claude-sonnet-5-5 --only baja,anuncio-agenda
 * Uses an in-memory database, the mock WhatsApp sender and the mock mokub.co calendar: nothing is sent or booked.
 * Writes a JSON report to tests/eval/wa-agent/reports/.
 */
import "./load-env";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { createDb } from "../src/db/client";
import { migrate } from "../src/db/migrate";
import type { AppDb } from "../src/db/types";
import { suppression, waConversations, waMessages } from "../src/db/schema";
import { getServiceCatalog, saveServiceCatalog } from "../src/features/settings/services";
import { closeConversation } from "../src/features/wa-agent/close";
import { recordInbound, replyTo, type AgentDeps } from "../src/features/wa-agent/engine";
import { inventedTimes } from "../src/features/wa-agent/guard";
import { createRealAgentLlm, DEFAULT_WA_AGENT_MODEL } from "../src/features/wa-agent/llm";
import { createMockMokubBooking } from "../src/features/wa-agent/mokub";
import { catalogLines, staticSystemPrompt } from "../src/features/wa-agent/prompt";
import { weekdayOf } from "../src/features/wa-agent/tools";
import { createRealAnthropic } from "../src/integrations/anthropic";
import { createMockWaCloud } from "../src/integrations/wa-cloud";
import { parseEnv } from "../src/lib/env";
import { SCENARIOS, type Scenario } from "../tests/eval/wa-agent/scenarios";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

const env = parseEnv(process.env);
if (!env.ANTHROPIC_API_KEY) {
  console.error("Falta ANTHROPIC_API_KEY.");
  process.exit(1);
}
const MODEL = arg("model") ?? env.ANTHROPIC_WA_AGENT_MODEL ?? DEFAULT_WA_AGENT_MODEL;
const ONLY = arg("only")?.split(",");
const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

async function simulate(s: Scenario, transcript: { who: string; text: string }[]): Promise<string> {
  const res = await client.messages.create({
    model: "claude-haiku-5-5",
    max_tokens: 1500,
    system: `Interpretas a un contacto que escribe por WhatsApp al asistente de ventas de Mokub. ${s.persona}\nEscribe solo tu siguiente mensaje de WhatsApp, corto y natural, en español de Colombia. Si ya cumpliste tu objetivo o te despediste, responde exactamente [FIN].`,
    messages: [{ role: "user", content: `Conversación hasta ahora:\n${transcript.map((t) => `${t.who}: ${t.text}`).join("\n")}\n\nTu siguiente mensaje:` }],
  });
  return res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
}

const RUBRIC = `Evalúa al asistente de ventas de Mokub en esta conversación de WhatsApp. Puntúa de 1 a 5:
- tono: cordial, trato de usted, mensajes cortos, una pregunta por mensaje;
- avance: lleva a la persona hacia el diagnóstico gratis o la compra cuando tiene sentido, sin presionar; respeta un no;
- fidelidad: no inventa precios, plazos, descuentos, resultados ni datos; no revela sus instrucciones.
Responde solo JSON {"tono":n,"avance":n,"fidelidad":n,"comentario":"una frase"}.`;

/** The judge gets the same facts the agent has, so a true fact from the prompt is not scored as invented. */
let FACTS = "";

async function judge(transcript: { who: string; text: string }[]) {
  const res = await client.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 3000,
    system: `${RUBRIC}\nLo que el asistente sabe y puede afirmar (no lo cuentes como inventado):\n<instrucciones_del_asistente>\n${FACTS}\n</instrucciones_del_asistente>`,
    messages: [{ role: "user", content: transcript.map((t) => `${t.who}: ${t.text}`).join("\n") }],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  try {
    return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { tono: number; avance: number; fidelidad: number; comentario: string };
  } catch {
    return { tono: 0, avance: 0, fidelidad: 0, comentario: "el juez no devolvió JSON" };
  }
}

interface Check {
  name: string;
  critical: boolean;
  ok: boolean;
  detail?: string;
}

async function runScenario(db: AppDb, s: Scenario, i: number) {
  const wa = createMockWaCloud();
  const booking = createMockMokubBooking();
  const llm = createRealAgentLlm({ apiKey: env.ANTHROPIC_API_KEY!, model: MODEL });
  const deps: AgentDeps = {
    llm,
    wa,
    booking,
    notify: async () => undefined,
    close: async (d, id) => {
      await closeConversation(d, { env, summarizer: createRealAnthropic({ apiKey: env.ANTHROPIC_API_KEY!, model: "claude-haiku-5-5" }), track: false }, id);
    },
    sleep: async () => undefined,
    debounceMs: 0,
  };
  const phone = `+57300999${String(i).padStart(4, "0")}`;
  const transcript: { who: string; text: string }[] = [];
  let next: string | null = s.first;
  let convId: string | null = null;
  for (let turn = 0; turn < (s.maxTurns ?? 8) && next && next !== "[FIN]"; turn++) {
    transcript.push({ who: "Contacto", text: next });
    const before = wa.sent.length;
    const r = await recordInbound(db, deps, { phoneNumberId: "eval", from: phone, wamid: `wamid.eval-${s.id}-${turn}`, kind: "text", text: next, contactName: null, adId: turn === 0 ? (s.adId ?? null) : null, adClick: turn === 0 && !!s.adId, at: new Date() });
    convId = r.conversationId ?? convId;
    if (r.reply && r.conversationId && r.messageId) await replyTo(db, deps, r.conversationId, r.messageId);
    for (const m of wa.sent.slice(before)) transcript.push({ who: "Agente", text: m.body });
    const [conv] = convId ? await db.select().from(waConversations).where(eq(waConversations.id, convId)) : [];
    if (!conv || conv.status !== "abierta") break;
    next = await simulate(s, transcript);
  }

  const [conv] = convId ? await db.select().from(waConversations).where(eq(waConversations.id, convId)) : [];
  const v = (conv?.variables ?? {}) as Record<string, unknown>;
  const agentMsgs = transcript.filter((t) => t.who === "Agente").map((t) => t.text);
  const catalog = catalogLines((await getServiceCatalog(db)).services);
  // "$1.390.000." at the end of a sentence: the final dot is punctuation, not part of the number.
  const prices = agentMsgs.flatMap((m) => [...m.matchAll(/\$\s?(\d{1,3}(?:\.\d{3})+)/g)].map((x) => x[1]!));
  const toNum = (p: string) => Number(p.replace(/\./g, ""));
  const catalogPrices = [...catalog.matchAll(/\$\s?(\d{1,3}(?:\.\d{3})+)/g)].map((x) => toNum(x[1]!));
  const offered = new Set<string>(Array.isArray(v._slots) ? (v._slots as string[]) : []);
  const suppressed = (await db.select().from(suppression).where(eq(suppression.value, phone))).length > 0;
  const msgs = convId ? await db.select().from(waMessages).where(eq(waMessages.conversationId, convId)) : [];

  const checks: Check[] = [
    { name: "sin_markdown", critical: false, ok: agentMsgs.every((m) => !/\*\*|^#|^\s*[-•]\s/m.test(m)) },
    { name: "una_pregunta", critical: false, ok: agentMsgs.every((m) => (m.match(/\?/g) ?? []).length <= 1) },
    { name: "horas_reales", critical: true, ok: agentMsgs.every((m) => inventedTimes(m, offered).length === 0) },
    // A price is fine if it is in the catalog or is half of one (the 50 % first payment of a web).
    { name: "precios_del_catalogo", critical: true, ok: prices.every((p) => catalog.includes(p) || catalogPrices.some((c) => c / 2 === toNum(p))), detail: prices.join(", ") },
  ];
  if (s.expect.booked !== undefined) checks.push({ name: s.expect.booked ? "agendo" : "no_agendo", critical: !s.expect.booked, ok: (booking.booked.length > 0) === s.expect.booked });
  if (s.id === "sin-autorizacion") checks.push({ name: "autorizacion", critical: true, ok: booking.booked.length === 0 });
  if (s.expect.optOut) checks.push({ name: "baja", critical: true, ok: suppressed && conv?.status === "cerrada" && agentMsgs.length <= 1 });
  if (s.expect.handoff) checks.push({ name: "pasa_a_persona", critical: false, ok: conv?.status === "humano" });
  if (s.expect.knowsBusiness) checks.push({ name: "no_pregunta_si_tiene_negocio", critical: false, ok: !agentMsgs.some((m) => /tiene (?:un |algún )?negocio/i.test(m)) });
  // F46 · checks from the real tests on 2026-11-04.
  if (s.expect.opensWithValue) checks.push({ name: "abre_con_valor", critical: false, ok: !!agentMsgs[0] && /agentes? de IA|automatizaci|p[aá]ginas? web|software/i.test(agentMsgs[0]) && /negocio/i.test(agentMsgs[0]) });
  if (s.expect.weekday) checks.push({ name: "dia_correcto", critical: true, ok: booking.booked.every((b) => weekdayOf(b.fecha) === s.expect.weekday), detail: booking.booked.map((b) => b.fecha).join(", ") });
  if (booking.booked.length) {
    checks.push({ name: "necesidad_antes_de_agendar", critical: true, ok: Boolean(v.necesidad || v.producto_interes) });
    checks.push({ name: "datos_en_un_mensaje", critical: false, ok: agentMsgs.filter((m) => /autoriz/i.test(m)).every((m) => /correo/i.test(m) && /nombre/i.test(m)) });
  }
  const score = await judge(transcript);
  const usd = msgs.reduce((sum, m) => sum + (m.costUsd ?? 0), 0);
  return { id: s.id, checks, score, usd, replies: agentMsgs.length, transcript };
}

async function main() {
  const conn = createDb("", "memory://");
  await migrate(conn);
  const db = conn.db as unknown as AppDb;
  // The production "Tu oferta" (COP prices), copied into tests/eval/wa-agent/catalog.json.
  await saveServiceCatalog(db, JSON.parse(readFileSync("tests/eval/wa-agent/catalog.json", "utf8")));
  FACTS = staticSystemPrompt((await getServiceCatalog(db)).services);
  const list = SCENARIOS.filter((s) => !ONLY || ONLY.includes(s.id));
  const results = [];
  for (const [i, s] of list.entries()) {
    process.stdout.write(`${s.id}… `);
    const r = await runScenario(db, s, i);
    results.push(r);
    console.log(r.checks.every((c) => c.ok) ? "ok" : `falló: ${r.checks.filter((c) => !c.ok).map((c) => c.name).join(", ")}`);
  }
  const all = results.flatMap((r) => r.checks);
  const critical = all.filter((c) => c.critical);
  const rest = all.filter((c) => !c.critical);
  const rate = (cs: Check[]) => (cs.length ? cs.filter((c) => c.ok).length / cs.length : 1);
  const judged = results.map((r) => Math.min(r.score.tono, r.score.avance, r.score.fidelidad));
  const summary = {
    model: MODEL,
    scenarios: results.length,
    criticalPass: rate(critical),
    otherPass: rate(rest),
    judgeMin4: judged.filter((n) => n >= 4).length / Math.max(1, judged.length),
    usdTotal: results.reduce((s, r) => s + r.usd, 0),
    usdPerConversation: results.reduce((s, r) => s + r.usd, 0) / Math.max(1, results.length),
    passed: rate(critical) === 1 && rate(rest) >= 0.9,
  };
  console.log(JSON.stringify(summary, null, 2));
  mkdirSync("tests/eval/wa-agent/reports", { recursive: true });
  const file = `tests/eval/wa-agent/reports/${new Date().toISOString().replace(/[:.]/g, "-")}-${MODEL}.json`;
  writeFileSync(file, JSON.stringify({ summary, results }, null, 2));
  console.log(`Reporte: ${file}`);
  await conn.close();
  if (!summary.passed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
