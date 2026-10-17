import { z } from "zod";
import type { AppDb } from "@/db/types";
import type { HandlerResult } from "@/features/icp/api";
import { AiCallError, AiValidationError } from "@/integrations/anthropic";
import { enqueue, OutreachError, previewOutreach, processQueue, recordAssistedSend, type OutreachDeps } from "./service";

const Channel = z.enum(["email", "web_form", "whatsapp", "dapta_widget"]);
const LeadId = z.uuid("leadId debe ser un UUID");

export const PreviewBody = z.object({ leadId: LeadId, channel: Channel.optional(), generate: z.boolean().optional() });
export const SendBody = z.object({
  items: z
    .array(
      z.object({
        leadId: LeadId,
        channel: Channel.optional(),
        subject: z.string().trim().max(200).nullish(),
        body: z.string().max(8000).nullish(),
      }),
    )
    .max(25, "Máximo 25 mensajes por solicitud")
    .default([]),
  /** Run the queue after enqueuing (default true). */
  process: z.boolean().default(true),
  huntId: z.uuid().optional(),
});
export const AssistedBody = z.object({
  leadId: LeadId,
  subject: z.string().trim().max(200).nullish(),
  body: z.string().trim().min(10).max(8000),
  minutes: z.number().min(0.5, "Mínimo 0,5 minutos").max(120),
  note: z.string().trim().max(500).nullish(),
});

function bad(error: z.ZodError): HandlerResult {
  return { status: 400, body: { error: "Solicitud invalida", issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } };
}

async function guard(fn: () => Promise<HandlerResult>): Promise<HandlerResult> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof OutreachError) return { status: e.status, body: { error: e.message } };
    if (e instanceof AiValidationError || e instanceof AiCallError) return { status: 502, body: { error: "Fallo la IA", detail: e.message } };
    throw e;
  }
}

export function handlePreview(db: AppDb, json: unknown, deps: OutreachDeps, now = new Date()): Promise<HandlerResult> {
  const body = PreviewBody.safeParse(json);
  if (!body.success) return Promise.resolve(bad(body.error));
  return guard(async () => ({ status: 200, body: await previewOutreach(db, body.data, deps, now) }));
}

export function handleSend(db: AppDb, json: unknown, deps: OutreachDeps, now = new Date()): Promise<HandlerResult> {
  const body = SendBody.safeParse(json);
  if (!body.success) return Promise.resolve(bad(body.error));
  return guard(async () => {
    const enqueued = [];
    for (const item of body.data.items) {
      enqueued.push(
        await enqueue(db, { leadId: item.leadId, ...(item.channel ? { channel: item.channel } : {}), subject: item.subject ?? null, body: item.body ?? null }, deps, now),
      );
    }
    const queue = body.data.process ? await processQueue(db, deps, { now, ...(body.data.huntId ? { huntId: body.data.huntId } : {}) }) : null;
    return { status: 200, body: { enqueued, queue, sendEnabled: (deps.env?.SEND_ENABLED ?? false) === true } };
  });
}

export function handleAssisted(db: AppDb, json: unknown, deps: OutreachDeps, now = new Date()): Promise<HandlerResult> {
  const body = AssistedBody.safeParse(json);
  if (!body.success) return Promise.resolve(bad(body.error));
  return guard(async () => {
    const r = await recordAssistedSend(db, { ...body.data }, deps, now);
    return { status: r.status === "blocked" ? 409 : 200, body: r };
  });
}
