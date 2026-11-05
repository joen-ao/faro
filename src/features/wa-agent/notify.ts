import { escapeHtml } from "@/features/outreach/email-html";
import type { EmailAdapter } from "@/integrations/email/types";

export type NoticeKind = "reunion" | "compra" | "persona" | "falla";

const TITLE: Record<NoticeKind, string> = {
  reunion: "Reunión agendada por el agente",
  compra: "Alguien quiere comprar",
  persona: "Piden hablar con una persona",
  falla: "La agenda falló dos veces",
};

/** A labelled line of the notice ("Negocio", "Spa Adri"); empty values are dropped. */
export type NoticeField = readonly [label: string, value: string | null | undefined];

export type Notifier = (n: { kind: NoticeKind; conversationId: string; phone: string; detail: string; fields?: readonly NoticeField[] }) => Promise<void>;

const isUrl = (s: string) => /^https:\/\/\S+$/.test(s);

/** F46 · Plain Spanish email with everything the team needs before acting: a title, the detail, a two-column table and the inbox link. */
export function renderNotice(n: Parameters<Notifier>[0], link: string): { subject: string; text: string; html: string } {
  const last4 = n.phone.replace(/\D/g, "").slice(-4);
  const title = TITLE[n.kind];
  const rows = [...(n.fields ?? []), ["WhatsApp", n.phone] as const].filter((f): f is readonly [string, string] => typeof f[1] === "string" && f[1].trim() !== "");
  const text = [`${title}.`, n.detail, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", `Ver la conversación en Faro: ${link}`].join("\n");
  const cell = "padding:6px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top;font-size:14px";
  const table = rows
    .map(([k, v]) => `<tr><td style="${cell};color:#6b7280;white-space:nowrap">${escapeHtml(k)}</td><td style="${cell};color:#111827">${isUrl(v) ? `<a href="${escapeHtml(v)}">${escapeHtml(v)}</a>` : escapeHtml(v)}</td></tr>`)
    .join("");
  const html = `<div lang="es" style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#111827">
<h2 style="font-size:18px;margin:0 0 8px">${escapeHtml(title)}</h2>
<p style="font-size:14px;margin:0 0 16px">${escapeHtml(n.detail)}</p>
${table ? `<table style="border-collapse:collapse;width:100%;margin:0 0 20px">${table}</table>` : ""}
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px">Ver la conversación en Faro</a></p>
</div>`;
  return { subject: `[Faro] ${title} · WhatsApp ···${last4}`, text, html };
}

/** Emails the owner; without OWNER_EMAIL or EMAIL_FROM it does nothing. Never throws into the conversation. */
export function createOwnerNotifier(opts: { email: EmailAdapter; from?: string | null; to?: string | null; appUrl: string }): Notifier {
  return async (n) => {
    if (!opts.to || !opts.from) return;
    const link = `${opts.appUrl.replace(/\/+$/, "")}/app/conversaciones/${n.conversationId}`;
    const { subject, text, html } = renderNotice(n, link);
    try {
      await opts.email.send({ to: opts.to, from: opts.from, subject, text, html, idempotencyKey: `faro-wa-${n.kind}-${n.conversationId}` });
    } catch (e) {
      console.warn("[wa-agent] owner notice failed", e instanceof Error ? e.message : e);
    }
  };
}
