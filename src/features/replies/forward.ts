import { escapeHtml } from "@/features/outreach/email-html";
import type { EmailAdapter } from "@/integrations/email/types";
import type { ForwardInput } from "./service";

const OUTCOME: Record<string, string> = {
  reply: "Respuesta registrada en Faro",
  unsubscribe: "Pidió la baja: Faro ya lo suprimió",
};

/** "Mokub <equipo@mokub.co>" -> "equipo@mokub.co" */
const bare = (a: string) => (/<([^>]+)>/.exec(a)?.[1] ?? a).trim().toLowerCase();

/**
 * F27 · Builds the forwarder: every inbound reply lands in the team mailbox with Reply-To = the client, so answering
 * from Gmail/Hostinger goes straight back to them. Never forwards our own addresses (no loops).
 */
export function createReplyForwarder(opts: { email: EmailAdapter; from: string; to: string; replyDomain?: string; appUrl: string }) {
  const own = new Set([bare(opts.from), bare(opts.to)]);
  return async (f: ForwardInput): Promise<void> => {
    const sender = bare(f.from);
    if (!sender || own.has(sender) || (opts.replyDomain && sender.endsWith(`@${opts.replyDomain.toLowerCase()}`))) return;
    // Already in the team mailbox (e.g. a Hostinger copy of a reply to equipo@): forwarding would duplicate it.
    if ((f.to ?? []).some((t) => own.has(bare(t)))) return;
    const who = f.company ?? sender;
    const status = OUTCOME[f.outcome] ?? "No se pudo asociar a un lead";
    const subject = `[Faro] ${who}: ${f.subject || "(sin asunto)"}`.replace(/[\r\n]+/g, " ").slice(0, 200);
    const intro = `${who} respondió (${sender}). ${status}. Responde a este correo y le llega directamente al cliente.`;
    const dashboard = `${opts.appUrl.replace(/\/+$/, "")}/app/dashboard`;
    const text = `${intro}\nTablero: ${dashboard}\n\n---------- Mensaje original ----------\n${f.text || "(sin texto)"}`;
    const banner =
      `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f5fadf;border-left:4px solid #cbe850;padding:12px 14px;margin:0 0 16px;border-radius:8px;font-size:14px;color:#1f1f22">` +
      `<strong>${escapeHtml(who)}</strong> respondió (${escapeHtml(sender)}). ${escapeHtml(status)}.<br>Responde a este correo y le llega directamente al cliente. <a href="${escapeHtml(dashboard)}">Ver tablero</a></div>`;
    const original = f.html ?? `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(f.text || "(sin texto)")}</pre>`;
    await opts.email.send({
      to: opts.to,
      from: opts.from,
      replyTo: sender,
      subject,
      text,
      html: `${banner}${original}`,
      ...(f.emailId ? { idempotencyKey: `faro-fwd-${f.emailId}` } : {}),
    });
  };
}
