import { z } from "zod";
import { AiCallError, AiValidationError, type AnthropicAdapter, type CallRecorder } from "@/integrations/anthropic";
import { parseIcp } from "./index";

export const ParseBody = z.object({ prompt: z.string().trim().min(3, "prompt demasiado corto").max(2000, "prompt demasiado largo") });

export interface HandlerResult {
  status: number;
  body: unknown;
}

/** Framework-free handler so it can be tested without Next. */
export async function handleIcpParse(
  json: unknown,
  deps: { ai: AnthropicAdapter; recorder?: CallRecorder },
): Promise<HandlerResult> {
  const body = ParseBody.safeParse(json);
  if (!body.success) {
    return { status: 400, body: { error: "Solicitud invalida", issues: body.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } };
  }
  try {
    const parsed = await parseIcp(body.data.prompt, deps.ai, { recorder: deps.recorder });
    return { status: 200, body: parsed };
  } catch (e) {
    if (e instanceof AiValidationError) return { status: 502, body: { error: "La IA devolvio un formato invalido", detail: e.message } };
    if (e instanceof AiCallError) return { status: 502, body: { error: "Fallo la llamada a la IA", detail: e.message } };
    throw e;
  }
}
