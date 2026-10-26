/**
 * F24 · Sends one approved WhatsApp template through a Dapta FlowStudio webhook (trigger -> normalize ->
 * "Send Whatsapp Template v2"). The flow URL embeds its own key: it is a secret and is never logged.
 */
export interface WaSendInput {
  toNumber: string;
  templateId: string;
  nombre: string;
  slug: string;
  leadId: string;
}

export interface WaSendResult {
  ok: boolean;
  providerId: string | null;
  error?: string;
}

export interface WaSender {
  readonly isMock: boolean;
  send(input: WaSendInput): Promise<WaSendResult>;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const pickId = (b: Record<string, unknown>): string | null => {
  for (const k of ["message_id", "messageId", "wamid", "id", "execution_id", "executionId"]) {
    const v = b[k];
    if (typeof v === "string" && v) return v.slice(0, 200);
  }
  const nested = b.data ?? b.result ?? b.response;
  return nested && typeof nested === "object" ? pickId(nested as Record<string, unknown>) : null;
};

export function daptaFlowSender(url: string, fetcher: FetchLike = fetch, timeoutMs = 20_000): WaSender {
  return {
    isMock: false,
    async send(input) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetcher(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ to_number: input.toNumber, template_id: input.templateId, nombre: input.nombre, slug: input.slug, lead_id: input.leadId }),
          signal: ctrl.signal,
        });
        const text = await res.text();
        let body: Record<string, unknown> = {};
        try {
          body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
        } catch {
          body = { raw: text.slice(0, 200) };
        }
        // The flow answers {lead_id, result: <Send Whatsapp Template v2 response>}: a failure can sit at either level.
        const inner = (body.result && typeof body.result === "object" ? body.result : {}) as Record<string, unknown>;
        const bad = (b: Record<string, unknown>) => b.success === false || b.ok === false || (typeof b.error === "string" && b.error.length > 0);
        if (!res.ok || bad(body) || bad(inner)) {
          const why = body.error ?? inner.error ?? inner.message ?? body.message ?? body.raw ?? "error";
          return { ok: false, providerId: null, error: `Dapta ${res.status}: ${String(why).slice(0, 200)}` };
        }
        return { ok: true, providerId: pickId(body) };
      } catch (e) {
        return { ok: false, providerId: null, error: e instanceof Error && e.name === "AbortError" ? "Dapta no respondió a tiempo" : String(e).slice(0, 200) };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Test double: records calls, answers ok with a fake id. */
export function mockWaSender(): WaSender & { calls: WaSendInput[] } {
  const calls: WaSendInput[] = [];
  return {
    isMock: true,
    calls,
    async send(input) {
      calls.push(input);
      return { ok: true, providerId: `mock-wa-${calls.length}` };
    },
  };
}
