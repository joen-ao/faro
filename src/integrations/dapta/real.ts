import type { Env } from "@/lib/env";
import { USER_AGENT } from "@/lib/http";
import { buildCsv } from "./csv";
import { assertSafePushUrlResolved, UnsafeUrlError, type Resolver } from "./ssrf";
import type { DaptaLeadRecord, DaptaQualifierAdapter, PushResult } from "./types";

export interface RealDeps {
  fetchImpl?: typeof fetch;
  resolver?: Resolver;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Body sent to the Dapta test environment (http_push). */
export function buildPushBody(leads: DaptaLeadRecord[], env: Pick<Env, "NEXT_PUBLIC_APP_URL">) {
  return {
    source: "faro",
    callback_url: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/webhooks/dapta`,
    leads: leads.map((l) => ({
      lead_id: l.leadId,
      slug: l.slug,
      company: l.company,
      phone: l.phone || undefined,
      email: l.email || undefined,
      city: l.city || undefined,
      source: l.source,
      diagnostic_url: l.diagnosticUrl,
      notes: l.notes || undefined,
      servicio_sugerido: l.suggestedService || undefined,
      oferta: l.offer || undefined,
    })),
  };
}

/**
 * Real adapter. `widget_only` and `csv_export` never call the network; `http_push` posts to
 * DAPTA_PUSH_URL only when SEND_ENABLED=true (otherwise the push is recorded as "simulated").
 */
export function createRealDaptaAdapter(env: Env, deps: RealDeps = {}): DaptaQualifierAdapter {
  const doFetch = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? wait;
  const timeoutMs = deps.timeoutMs ?? 8000;

  return {
    mode: env.DAPTA_MODE,
    isMock: false,
    exportCsv: (leads) => buildCsv(leads),
    async push(leads): Promise<PushResult> {
      if (env.DAPTA_MODE !== "http_push") {
        return { status: "skipped", count: leads.length, reason: `DAPTA_MODE=${env.DAPTA_MODE} does not push`, isMock: false };
      }
      if (!env.DAPTA_PUSH_URL || !env.DAPTA_PUSH_API_KEY) {
        return { status: "skipped", count: leads.length, reason: "missing DAPTA_PUSH_URL or DAPTA_PUSH_API_KEY", isMock: false };
      }
      let url: URL;
      try {
        url = await assertSafePushUrlResolved(env.DAPTA_PUSH_URL, deps.resolver);
      } catch (e) {
        const reason = e instanceof UnsafeUrlError ? `blocked: ${e.message}` : "invalid push URL";
        return { status: "failed", count: leads.length, reason, isMock: false };
      }
      if (!env.SEND_ENABLED) {
        return { status: "simulated", count: leads.length, reason: "SEND_ENABLED=false", isMock: false };
      }
      const body = JSON.stringify(buildPushBody(leads, env));
      let lastReason = "unknown error";
      let httpStatus: number | undefined;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const res = await doFetch(url, {
            method: "POST",
            redirect: "manual",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${env.DAPTA_PUSH_API_KEY}`,
              "User-Agent": USER_AGENT,
            },
            body,
            signal: AbortSignal.timeout(timeoutMs),
          });
          httpStatus = res.status;
          if (res.ok) return { status: "sent", count: leads.length, httpStatus, isMock: false };
          lastReason = `HTTP ${res.status}`;
          if (res.status < 500 && res.status !== 429 && res.status !== 408) break;
        } catch (e) {
          lastReason = e instanceof Error ? e.name : "network error";
        }
        if (attempt < 2) await sleep(500);
      }
      return { status: "failed", count: leads.length, reason: lastReason, httpStatus, isMock: false };
    },
  };
}
