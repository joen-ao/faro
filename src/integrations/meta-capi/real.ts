import { redactToken } from "@/integrations/meta-ads/real";
import type { CapiAdapter, CapiEvent, CapiResult } from "./types";

export interface RealCapiOptions {
  pixelId: string;
  token: string;
  apiVersion?: string;
  testEventCode?: string;
  fetchImpl?: typeof fetch;
  onCall?: (c: { endpoint: string; status: number | null; latencyMs: number; error: string | null }) => void | Promise<void>;
}

/** POST /{pixel}/events. Errors are returned (token redacted), never thrown: tracking must not break a lead. */
export function createRealCapi(opts: RealCapiOptions): CapiAdapter {
  const doFetch = opts.fetchImpl ?? fetch;
  const endpoint = `https://graph.facebook.com/${opts.apiVersion ?? "v25.0"}/${opts.pixelId}/events`;
  return {
    isMock: false,
    async send(events: CapiEvent[]): Promise<CapiResult> {
      if (!events.length) return { ok: true, received: 0, isMock: false };
      const started = Date.now();
      let status: number | null = null;
      let error: string | null = null;
      try {
        const body = new URLSearchParams({ data: JSON.stringify(events), access_token: opts.token });
        if (opts.testEventCode) body.set("test_event_code", opts.testEventCode);
        const res = await doFetch(endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString(), signal: AbortSignal.timeout(10_000) });
        status = res.status;
        const json = (await res.json().catch(() => ({}))) as { events_received?: number; error?: { message?: string } };
        if (!res.ok || json.error) {
          error = redactToken(json.error?.message ?? `HTTP ${res.status}`, opts.token);
          return { ok: false, received: 0, isMock: false, error };
        }
        return { ok: true, received: json.events_received ?? events.length, isMock: false };
      } catch (e) {
        error = redactToken(e instanceof Error ? e.message : String(e), opts.token);
        return { ok: false, received: 0, isMock: false, error };
      } finally {
        await opts.onCall?.({ endpoint: `POST ${opts.pixelId}/events`, status, latencyMs: Date.now() - started, error });
      }
    },
  };
}
