import { escapeHtml } from "@/features/outreach/email-html";
import type { EmailAdapter } from "@/integrations/email/types";

export type NoticeKind = "reunion" | "compra" | "persona" | "falla";

const TITLE: Record<NoticeKind, string> = {
  reunion: "Reunión agendada por el agente",
  compra: "Alguien quiere comprar",
  persona: "Piden hablar con una persona",
  falla: "La agenda falló dos veces",
};

export type Notifier = (n: { kind: NoticeKind; conversationId: string; phone: string; detail: string }) => Promise<void>;

/** Emails the owner; without OWNER_EMAIL or EMAIL_FROM it does nothing. Never throws into the conversation. */
export function createOwnerNotifier(opts: { email: EmailAdapter; from?: string | null; to?: string | null; appUrl: string }): Notifier {
  return async (n) => {
    if (!opts.to || !opts.from) return;
    const link = `${opts.appUrl.replace(/\/+$/, "")}/app/conversaciones/${n.conversationId}`;
    const last4 = n.phone.replace(/\D/g, "").slice(-4);
    const subject = `[Faro] ${TITLE[n.kind]} · WhatsApp ···${last4}`;
    const text = `${TITLE[n.kind]}.\n${n.detail}\n\nVer la conversación: ${link}`;
    const html = `<p><strong>${escapeHtml(TITLE[n.kind])}</strong></p><p>${escapeHtml(n.detail)}</p><p><a href="${escapeHtml(link)}">Ver la conversación</a></p>`;
    try {
      await opts.email.send({ to: opts.to, from: opts.from, subject, text, html, idempotencyKey: `faro-wa-${n.kind}-${n.conversationId}` });
    } catch (e) {
      console.warn("[wa-agent] owner notice failed", e instanceof Error ? e.message : e);
    }
  };
}
