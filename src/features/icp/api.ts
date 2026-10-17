import { z } from "zod";
import { AiError, AiCallError, AiValidationError, type AnthropicAdapter, type CallRecorder, type Usage } from "@/integrations/anthropic";
import { parseIcp } from "./index";

export const ParseBody = z.object({ prompt: z.string().trim().min(3, "prompt demasiado corto").max(2000, "prompt demasiado largo") });

export interface HandlerResult {
  status: number;
  body: unknown;
}

export interface AiUsageReport {
  usage: Usage;
  model: string;
  isMock: boolean;
}

/** Framework-free handler so it can be tested without Next. */
export async function handleIcpParse(
  json: unknown,
  deps: { ai: AnthropicAdapter; recorder?: CallRecorder; recordCost?: (r: AiUsageReport) => Promise<void> },
): Promise<HandlerResult> {
  const body = ParseBody.safeParse(json);
  if (!body.success) {
    return { status: 400, body: { error: "Solicitud invalida", issues: body.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } };
  }
  // Cost is booked on success and on failure, whenever tokens were billed.
  const book = async (r: AiUsageReport) => {
    if (r.usage.input_tokens + r.usage.output_tokens === 0) return;
    try {
      await deps.recordCost?.(r);
    } catch {
      /* cost logging must not break the response */
    }
  };
  try {
    const parsed = await parseIcp(body.data.prompt, deps.ai, { recorder: deps.recorder });
    await book({ usage: parsed.usage, model: parsed.model, isMock: parsed.is_mock });
    return { status: 200, body: parsed };
  } catch (e) {
    if (e instanceof AiError) await book({ usage: e.usage, model: e.model, isMock: e.isMock });
    if (e instanceof AiValidationError) return { status: 502, body: { error: "La IA devolvio un formato invalido", detail: e.message } };
    if (e instanceof AiCallError) return { status: 502, body: { error: "Fallo la llamada a la IA", detail: e.message } };
    throw e;
  }
}
