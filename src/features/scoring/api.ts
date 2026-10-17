import { z } from "zod";
import type { AppDb } from "@/db/types";
import type { HandlerResult } from "@/features/icp/api";
import { AiCallError, AiValidationError, type AnthropicAdapter } from "@/integrations/anthropic";
import { scoreLead, ScoreInputError } from "./service";

export const ScoreBody = z.object({ icpProfileId: z.uuid("icpProfileId debe ser un UUID") });
const LeadId = z.uuid("id de lead invalido");

export async function handleLeadScore(db: AppDb, leadId: string, json: unknown, deps: { ai: AnthropicAdapter }): Promise<HandlerResult> {
  const id = LeadId.safeParse(leadId);
  const body = ScoreBody.safeParse(json);
  if (!id.success || !body.success) {
    const issues = [...(id.success ? [] : id.error.issues), ...(body.success ? [] : body.error.issues)];
    return { status: 400, body: { error: "Solicitud invalida", issues: issues.map((i) => ({ path: i.path.join("."), message: i.message })) } };
  }
  try {
    const r = await scoreLead(db, { leadId: id.data, icpProfileId: body.data.icpProfileId }, deps);
    return { status: 200, body: r };
  } catch (e) {
    if (e instanceof ScoreInputError) return { status: e.status, body: { error: e.message } };
    if (e instanceof AiValidationError || e instanceof AiCallError) return { status: 502, body: { error: "Fallo la IA", detail: e.message } };
    throw e;
  }
}
