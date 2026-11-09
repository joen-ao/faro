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

/* ------------------------------- F51 · Mokub cold email ------------------------------- */

const MK = {
  page: "#FAFAF7",
  card: "#FFFFFF",
  ink: "#0E1726",
  text: "#3B4658",
  muted: "#5B6878",
  border: "#E2E5EB",
  accent: "#134E8A",
  accentSoft: "#E6EEF8",
  logo: "#2563EB",
  sky: "#B9D3F3",
  night: "#0A1220",
  layer: "#13213A",
  onNight: "#C3CEDF",
  onNightMuted: "#8E9BB3",
  wa: "#1F7A45",
} as const;
const MK_FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** The cold email text has a fixed shape: paragraphs, a signature with "WhatsApp +…· mokub.co" and a "—" legal footer. */
export function isColdEmailText(text: string): boolean {
  return /\n[^\n]*WhatsApp \+[\d ]+ · mokub\.co/.test(text) && /\n\n—\n/.test(text);
}

const waLink = (s: string) =>
  s.replace(/\+(\d[\d ]{9,16}\d)/g, (m, digits: string) => `<a href="https://wa.me/${digits.replace(/\D/g, "")}" style="color:${MK.wa};font-weight:600;text-decoration:none;white-space:nowrap">${m}</a>`);

const button = (href: string, label: string, kind: "wa" | "outline") =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;margin:0 10px 10px 0"><tr><td style="border-radius:999px;${kind === "wa" ? `background:${MK.wa}` : `background:#ffffff;border:1.5px solid ${MK.accent}`}">` +
  `<a href="${escapeHtml(href)}" style="display:inline-block;padding:${kind === "wa" ? "14px 26px" : "12.5px 24px"};font-family:${MK_FONT};font-size:15px;font-weight:700;line-height:1;color:${kind === "wa" ? "#ffffff" : MK.accent};text-decoration:none">${label}</a></td></tr></table>`;

/**
 * F51/F52 · Branded HTML of the cold email, in mokub.co's world: a night band with the logo, a white letter, and one
 * strong moment, the sourced figure on a full-width night strip with the number in the logo's light blue. Green is
 * kept for WhatsApp only, as on mokub.co. Built from the stored text (the text stays the source of truth).
 * Email-safe: tables, inline styles, 600 px, no web fonts, degrades to plain blocks in Outlook.
 */
export function coldEmailHtml(text: string, opts: { logoUrl?: string; brand?: string; photoUrl?: string | null; whatsapp?: string } = {}): string {
  const [body = "", legalRaw = ""] = text.replace(/\r\n/g, "\n").split(/\n\n—\n/);
  const paras = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const sigIdx = paras.findIndex((p) => /\nWhatsApp \+/.test(p) || /^WhatsApp \+/.test(p.split("\n").at(-1) ?? ""));
  const content = sigIdx >= 0 ? paras.slice(0, sigIdx) : paras;
  const signature = sigIdx >= 0 ? paras[sigIdx]! : "";
  const after = sigIdx >= 0 ? paras.slice(sigIdx + 1) : [];
  const sigLines = signature.split("\n").filter(Boolean);
  // Team signature: "Equipo de <seller>"; person: "<name>\n<role> · <seller>\nWhatsApp …".
  const roleLine = sigLines.length >= 3 ? sigLines[1]! : "";
  const brand = escapeHtml(opts.brand ?? /^Equipo de (.+)$/.exec(sigLines[0] ?? "")?.[1]?.trim() ?? /(?:· )?([^·]+)$/.exec(roleLine)?.[1]?.trim() ?? "Mokub");
  const waDigits = (opts.whatsapp ?? /\+(\d[\d ]{9,16}\d)/.exec(signature)?.[1] ?? "").replace(/\D/g, "");
  const pad = "padding-left:36px;padding-right:36px";
  const edge = `border-left:1px solid ${MK.border};border-right:1px solid ${MK.border}`;
  const row = (inner: string, style = "") => `<tr><td style="background:${MK.card};${edge};${pad};font-family:${MK_FONT};${style}">${inner}</td></tr>`;
  const para = (html: string, extra = "") => `<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:${MK.text}${extra}">${html}</p>`;

  const before: string[] = [];
  const afterStat: string[] = [];
  let stat = "";
  let diagnostic: string | null = null;
  content.forEach((raw, i) => {
    const esc = escapeHtml(raw);
    const link = /^Si prefiere verlo ya, está aquí: (https?:\/\/\S+)\s*$/.exec(raw) ?? /^PD: .*?(https?:\/\/\S+)\s*$/.exec(raw);
    if (link) {
      diagnostic = link[1]!;
      return;
    }
    const target = stat ? afterStat : before;
    if (i === 0) return target.push(`<p style="margin:0 0 14px;font-size:18px;line-height:1.4;font-weight:700;letter-spacing:-0.01em;color:${MK.ink}">${esc}</p>`);
    const dato = /^Dato: (.+?)(?: \(([^)]+)\))?\.?$/.exec(raw);
    if (dato) {
      const sentence = dato[1]!;
      const fig = /(\d+\s?(?:%|×)|\d+ veces)/.exec(sentence)?.[1]?.replace(/ veces$/, "×") ?? "";
      stat =
        `<tr><td style="background:${MK.layer};padding:26px 36px;font-family:${MK_FONT}">` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
        (fig ? `<td style="vertical-align:middle;padding-right:20px;font-size:44px;line-height:1;font-weight:800;letter-spacing:-0.03em;color:${MK.sky};white-space:nowrap">${escapeHtml(fig)}</td>` : "") +
        `<td style="vertical-align:middle">` +
        `<p style="margin:0;font-size:16px;line-height:1.5;font-weight:600;color:#ffffff">${escapeHtml(sentence.charAt(0).toUpperCase() + sentence.slice(1))}.</p>` +
        (dato[2] ? `<p style="margin:8px 0 0;font-size:12.5px;line-height:1.4;color:${MK.onNightMuted}">Fuente: ${escapeHtml(dato[2])}</p>` : "") +
        `</td></tr></table></td></tr>`;
      return;
    }
    if (/^¿/.test(raw)) return target.push(para(esc, `;color:${MK.ink};font-weight:600`));
    // F54 · Services list of the general email: one row per service, name in ink, outcome after it.
    const svc = /^Esto es lo que solemos hacer:\n([\s\S]+)$/.exec(raw);
    if (svc) {
      const items = svc[1]!.split("\n").map((l) => l.replace(/^•\s*/, "").trim()).filter(Boolean);
      const rows = items
        .map((it) => {
          const [name, ...rest] = it.split(": ");
          return (
            `<tr><td width="28" style="vertical-align:top;padding:12px 0 12px 16px"><div style="width:10px;height:10px;margin-top:6px;border-radius:999px;background:${MK.accent};font-size:0;line-height:0">&nbsp;</div></td>` +
            `<td style="padding:12px 16px 12px 4px;font-family:${MK_FONT};font-size:15px;line-height:1.5;color:${MK.text}"><strong style="color:${MK.ink}">${escapeHtml(name!)}</strong>${rest.length ? ` · ${escapeHtml(rest.join(": "))}` : ""}</td></tr>`
          );
        })
        .join(`<tr><td colspan="2" style="padding:0 16px"><div style="height:1px;background:${MK.border};font-size:0;line-height:0">&nbsp;</div></td></tr>`);
      return target.push(
        `<p style="margin:0 0 10px;font-size:16px;line-height:1.5;font-weight:700;color:${MK.ink}">Esto es lo que solemos hacer</p>` +
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:${MK.accentSoft};border-radius:14px">${rows}</table>`,
      );
    }
    if (/^Justo eso resolvemos|proyectos en producci[oó]n|Pruébelo|escríbale a nuestro agente/i.test(raw)) {
      const [lead, ...rest] = esc.split(/(?<=Mokub:) /);
      return target.push(para(rest.length ? `<strong style="color:${MK.ink}">${lead}</strong> ${waLink(rest.join(" "))}` : waLink(esc)));
    }
    target.push(para(linkify(esc, MK.accent)));
  });

  const buttons = (waDigits ? button(`https://wa.me/${waDigits}`, "Escribir por WhatsApp", "wa") : "") + (diagnostic ? button(diagnostic, "Ver el diagnóstico", "outline") : "");

  const avatar = opts.photoUrl
    ? `<img src="${escapeHtml(opts.photoUrl)}" width="52" height="52" alt="" style="display:block;width:52px;height:52px;border-radius:999px;border:0">`
    : opts.logoUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="52" height="52" align="center" style="width:52px;height:52px;border-radius:999px;background:${MK.accent}"><img src="${escapeHtml(opts.logoUrl)}" width="26" height="22" alt="" style="display:block;width:26px;height:auto;border:0;margin:0 auto"></td></tr></table>`
      : `<div style="width:52px;height:52px;border-radius:999px;background:${MK.accent};text-align:center;line-height:52px;font-family:${MK_FONT};font-size:20px;font-weight:700;color:#ffffff">${escapeHtml((sigLines[0] ?? "M").replace(/^Equipo de /, "").charAt(0))}</div>`;
  const sig =
    `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="vertical-align:middle;padding-right:14px">${avatar}</td><td style="vertical-align:middle;font-family:${MK_FONT}">` +
    `<p style="margin:0;font-size:15.5px;line-height:1.35;font-weight:700;color:${MK.ink}">${escapeHtml(sigLines[0] ?? "")}</p>` +
    sigLines.slice(1).map((l) => `<p style="margin:3px 0 0;font-size:13.5px;line-height:1.45;color:${MK.muted}">${waLink(escapeHtml(l))}</p>`).join("") +
    `</td></tr></table>`;
  const ps = after
    .map((a) => {
      const m = /^PD: ?([\s\S]*)$/.exec(a);
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px"><tr><td style="background:${MK.accentSoft};border-radius:14px;padding:14px 18px;font-family:${MK_FONT};font-size:14.5px;line-height:1.55;color:${MK.ink}">${m ? `<strong style="color:${MK.accent}">PD</strong> ${escapeHtml(m[1]!)}` : escapeHtml(a)}</td></tr></table>`;
    })
    .join("");

  const legal = escapeHtml(legalRaw.trim())
    .replace(/(Para no recibir más correos responda BAJA o use este enlace: )(https?:\/\/\S+)/, (_m, lead: string, url: string) => `${lead.replace(/ o use este enlace: $/, "")} o <a href="${url}" style="color:${MK.muted};text-decoration:underline">darse de baja aquí</a>.`)
    .replace(/\(mokub\.co\/es\/politica-de-datos\)/, `(<a href="https://www.mokub.co/es/politica-de-datos" style="color:${MK.muted};text-decoration:underline">política de datos</a>)`);

  const logo = opts.logoUrl ? `<td style="vertical-align:middle;padding-right:10px"><img src="${escapeHtml(opts.logoUrl)}" width="30" height="25" alt="" style="display:block;border:0;outline:none;width:30px;height:auto"></td>` : "";

  return [
    `<div style="margin:0;padding:28px 12px;background:${MK.page}">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;border-collapse:separate">`,
    // Night band, as the mokub.co hero.
    `<tr><td style="background:${MK.night};border-radius:20px 20px 0 0;padding:22px 36px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td><table role="presentation" cellpadding="0" cellspacing="0"><tr>${logo}`,
    `<td style="vertical-align:middle;font-family:${MK_FONT};font-size:19px;font-weight:700;letter-spacing:-0.01em;color:#ffffff">${brand}</td></tr></table></td>`,
    `<td align="right" style="font-family:${MK_FONT};font-size:13px;color:${MK.onNight}"><a href="https://www.mokub.co" style="color:${MK.onNight};text-decoration:none">mokub.co</a></td></tr></table>`,
    `</td></tr>`,
    row(before.join(""), "padding-top:32px;padding-bottom:12px"),
    stat,
    row(afterStat.join(""), `padding-top:${stat ? 28 : 4}px;padding-bottom:6px`),
    buttons ? row(buttons, "padding-bottom:16px") : "",
    row(`<div style="border-top:1px solid ${MK.border};padding-top:22px">${sig}${ps}</div>`, `padding-bottom:30px;border-bottom:1px solid ${MK.border};border-radius:0 0 20px 20px`),
    `</table>`,
    legal ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto"><tr><td style="padding:18px 20px 0;font-family:${MK_FONT};font-size:11.5px;line-height:1.6;color:${MK.muted}">${legal}</td></tr></table>` : "",
    `</div>`,
  ].join("");
}
