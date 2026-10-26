/**
 * Premium HTML email from the plain-text message (the text stays the source of truth: edits, the queue and the
 * compliance checks all work on it). Email-client safe: tables, inline styles only, 600 px, no images, no scripts.
 * Pure module: the outreach preview renders exactly what is sent.
 */

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const URL_RE = /(https?:\/\/[^\s<]*[^\s<.,;:!?)])/g;
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = "#1f1f22";
const MUTED = "#6b6b70";
const LIME = "#cbe850";

const linkify = (escaped: string, color: string) => escaped.replace(URL_RE, (u) => `<a href="${u}" style="color:${color};text-decoration:underline">${u}</a>`);

type Kind = "greeting" | "findings" | "services" | "offer" | "cta" | "why" | "who" | "optout" | "signature" | "body";

function kindOf(p: string, index: number, afterOptOut: boolean): Kind {
  if (afterOptOut) return "signature";
  if (index === 0 && /^(hola|buen[oa]s)/i.test(p)) return "greeting";
  if (/^lo que vimos:/i.test(p)) return "findings";
  if (/^c[oó]mo le ayudamos:/i.test(p)) return "services";
  if (/^si le interesa/i.test(p)) return "offer";
  if (/^preparamos un breve diagn[oó]stico/i.test(p) && URL_RE.test(p)) return "cta";
  if (/^por qu[eé] le escribimos/i.test(p)) return "why";
  if (/^qui[eé]n escribe/i.test(p)) return "who";
  if (/darse de baja|no desea recibir/i.test(p)) return "optout";
  return "body";
}

/** "Quién escribe: Mokub, con Faro (…)" -> "Mokub"; the brand shown at the top of the email. */
export function brandFrom(text: string): string {
  const m = /qui[eé]n escribe:\s*([^,.(\n]+)/i.exec(text);
  return (m?.[1] ?? "Faro").trim().slice(0, 40);
}

/** "Lo que vimos:\n• a\n• b" -> ["a", "b"] */
const bullets = (p: string) =>
  p
    .split("\n")
    .slice(1)
    .map((l) => l.replace(/^\s*[•\-*]\s*/, "").trim())
    .filter(Boolean);

function listCard(title: string, items: string[], marker: "finding" | "service"): string {
  const mark =
    marker === "finding"
      ? `<div style="width:8px;height:8px;border-radius:999px;background:#f2a93b;margin-top:7px;line-height:8px;font-size:0">&nbsp;</div>`
      : `<div style="width:18px;height:18px;border-radius:999px;background:#1a1a1c;color:${LIME};font-size:11px;font-weight:700;line-height:18px;text-align:center">&#10003;</div>`;
  const rows = items
    .map(
      (it) =>
        `<tr><td style="vertical-align:top;width:26px;padding:6px 0">${mark}</td><td style="padding:6px 0;font-size:14.5px;line-height:1.55;color:${INK}">${escapeHtml(it)}</td></tr>`,
    )
    .join("");
  const bg = marker === "finding" ? "#fbf7ee" : "#f5fadf";
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px"><tr><td style="background:${bg};border-radius:10px;padding:14px 16px">` +
    `<p style="margin:0 0 6px;font-size:11.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED}">${escapeHtml(title)}</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr></table>`
  );
}

export interface EmailHtmlOptions {
  /** Button label for the diagnostic link. */
  ctaLabel?: string;
}

export function renderEmailHtml(text: string, opts: EmailHtmlOptions = {}): string {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const brand = escapeHtml(brandFrom(text));
  const main: string[] = [];
  const footer: string[] = [];
  let afterOptOut = false;
  let preheader = "";
  paragraphs.forEach((p, i) => {
    URL_RE.lastIndex = 0;
    const kind = kindOf(p, i, afterOptOut);
    URL_RE.lastIndex = 0;
    const esc = escapeHtml(p).replace(/\n/g, "<br>");
    if (kind === "body" && !preheader) preheader = p.slice(0, 120);
    switch (kind) {
      case "greeting":
        main.push(`<p style="margin:0 0 18px;font-size:17px;font-weight:600;color:${INK}">${esc}</p>`);
        break;
      case "findings":
        main.push(listCard("Lo que vimos en su presencia digital", bullets(p), "finding"));
        break;
      case "services":
        main.push(listCard("Cómo le ayudamos", bullets(p), "service"));
        break;
      case "offer":
        main.push(
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 22px"><tr><td style="background:#f5fadf;border-left:4px solid ${LIME};border-radius:8px;padding:14px 16px;font-size:15px;line-height:1.55;color:${INK}">${linkify(esc, INK)}</td></tr></table>`,
        );
        break;
      case "cta": {
        URL_RE.lastIndex = 0;
        const url = p.match(URL_RE)?.[0] ?? "";
        const label = escapeHtml(p.replace(URL_RE, "").replace(/[:\s]+$/, "").trim());
        main.push(
          `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK}">${label}.</p>` +
            `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 26px"><tr><td style="border-radius:999px;background:#1a1a1c"><a href="${url}" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:15px;font-weight:700;color:${LIME};text-decoration:none;border-radius:999px">${escapeHtml(opts.ctaLabel ?? "Ver su diagnóstico gratuito")} &rarr;</a></td></tr></table>`,
        );
        break;
      }
      case "why":
      case "who":
        footer.push(`<p style="margin:0 0 10px;font-size:12.5px;line-height:1.55;color:${MUTED}">${linkify(esc, MUTED)}</p>`);
        break;
      case "optout": {
        afterOptOut = true;
        URL_RE.lastIndex = 0;
        const url = p.match(URL_RE)?.[0] ?? "";
        const lead = escapeHtml(p.replace(URL_RE, "").replace(/[:\s]+$/, "").trim());
        const link = (t: string) => `<a href="${url}" style="color:${MUTED};text-decoration:underline">${t}</a>`;
        // "…, darse de baja toma un clic" -> the phrase itself is the link (no repeated words).
        const line = url && /darse de baja/i.test(lead) ? `${lead.replace(/darse de baja/i, (m) => link(m))}.` : `${lead}${url ? `: ${link("darse de baja")}` : ""}`;
        footer.push(`<p style="margin:0 0 10px;font-size:12.5px;line-height:1.55;color:${MUTED}">${line}</p>`);
        break;
      }
      case "signature":
        footer.push(`<p style="margin:0;font-size:12px;line-height:1.5;color:#8a8a8f">${linkify(esc, "#8a8a8f")}</p>`);
        break;
      default:
        main.push(`<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${INK}">${linkify(esc, INK)}</p>`);
    }
  });

  return [
    `<div style="margin:0;padding:24px 12px;background:#f4f4f1;font-family:${FONT}">`,
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;border:1px solid #e7e7e2">`,
    `<tr><td style="padding:22px 28px 0"><table role="presentation" cellpadding="0" cellspacing="0"><tr>`,
    `<td style="vertical-align:middle"><div style="width:10px;height:10px;border-radius:999px;background:${LIME};line-height:10px;font-size:0">&nbsp;</div></td>`,
    `<td style="padding-left:10px;font-family:${FONT};font-size:15px;font-weight:700;letter-spacing:-0.01em;color:${INK}">${brand}</td>`,
    `</tr></table></td></tr>`,
    `<tr><td style="padding:22px 28px 6px;font-family:${FONT}">${main.join("")}</td></tr>`,
    footer.length ? `<tr><td style="padding:18px 28px 24px;border-top:1px solid #efefea;font-family:${FONT}">${footer.join("")}</td></tr>` : "",
    `</table>`,
    `</div>`,
  ].join("");
}
