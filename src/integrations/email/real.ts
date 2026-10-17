import { EmailSendError, type EmailAdapter } from "./types";

export const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface RealEmailOptions {
  apiKey: string;
  /** Must be explicitly true: the real adapter refuses to exist while SEND_ENABLED is not true. */
  sendEnabled: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Resend over its REST API (no SDK). Only constructible when `sendEnabled === true`. */
export function createRealEmail(opts: RealEmailOptions): EmailAdapter {
  if (opts.sendEnabled !== true) throw new Error("Real email adapter refused: SEND_ENABLED is not true");
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    isMock: false,
    async send(m) {
      const res = await doFetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: m.from,
          to: [m.to],
          subject: m.subject,
          text: m.text,
          html: m.html,
          ...(m.replyTo ? { reply_to: m.replyTo } : {}),
          ...(m.headers ? { headers: m.headers } : {}),
        }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok || !json.id) throw new EmailSendError(`Resend ${res.status}: ${json.message ?? "sin id"}`, res.status);
      return { id: json.id };
    },
  };
}
