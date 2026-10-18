import { AiCallError, AiError, AiValidationError, type AnthropicAdapter, type CallRecorder } from "@/integrations/anthropic";
import { AnglesBody, suggestAngles, suggestServices, SuggestBody } from "./suggest";

export interface HandlerResult {
  status: number;
  body: unknown;
}

export interface AiDeps {
  ai: AnthropicAdapter;
  recorder?: CallRecorder;
  /** Books the AI cost (cost_entries) on success and on billed failures. */
  recordCost?: (r: { usage: { input_tokens: number; output_tokens: number }; model: string; isMock: boolean; task: string }) => Promise<void>;
}

const invalid = (issues: { path: PropertyKey[]; message: string }[]): HandlerResult => ({
  status: 400,
  body: { error: "Solicitud invalida", issues: issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
});

async function run<T extends { usage: { input_tokens: number; output_tokens: number }; model: string; is_mock: boolean }>(
  task: string,
  deps: AiDeps,
  fn: () => Promise<T>,
): Promise<HandlerResult> {
  const book = async (usage: T["usage"], model: string, isMock: boolean) => {
    if (usage.input_tokens + usage.output_tokens === 0) return;
    try {
      await deps.recordCost?.({ usage, model, isMock, task });
    } catch {
      /* cost logging must not break the response */
    }
  };
  try {
    const r = await fn();
    await book(r.usage, r.model, r.is_mock);
    return { status: 200, body: r };
  } catch (e) {
    if (e instanceof AiError) await book(e.usage, e.model, e.isMock);
    if (e instanceof AiValidationError) return { status: 502, body: { error: "La IA devolvio un formato invalido", detail: e.message } };
    if (e instanceof AiCallError) return { status: 502, body: { error: "Fallo la llamada a la IA", detail: e.message } };
    throw e;
  }
}

/** POST /api/settings/services/suggest: business description -> proposed catalog (not saved). */
export async function handleServicesSuggest(json: unknown, deps: AiDeps): Promise<HandlerResult> {
  const body = SuggestBody.safeParse(json);
  if (!body.success) return invalid(body.error.issues);
  return run("services_suggest", deps, () => suggestServices(body.data.description, deps.ai, { recorder: deps.recorder }));
}

/** POST /api/icp/angles: parsed ICP + chosen services -> value angles and profile refinements. */
export async function handleOfferAngles(json: unknown, deps: AiDeps): Promise<HandlerResult> {
  const body = AnglesBody.safeParse(json);
  if (!body.success) return invalid(body.error.issues);
  return run("offer_angles", deps, () => suggestAngles(body.data, deps.ai, { recorder: deps.recorder }));
}
