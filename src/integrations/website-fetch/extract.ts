import { isGenericEmail } from "@/features/compliance/email";
import { normalizePhone } from "@/integrations/overpass/phone";
import { MAX_WEBSITE_TEXT_BYTES, type ExtractedContact, type SiteExtraction, type SiteSignals } from "./types";

export interface PageExtraction {
  contacts: ExtractedContact[];
  text: string;
  discardedPersonalEmails: number;
  hasContactForm: boolean;
  hasAppointmentForm: boolean;
  onlineBooking: boolean;
  socialNetworks: string[];
  copyrightYear: number | null;
}

export interface ExtractOptions {
  /** Default country for phone numbers without a prefix. */
  country?: string;
}

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", aacute: "á", eacute: "é", iacute: "í", oacute: "ó",
  uacute: "ú", ntilde: "ñ", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", uuml: "ü", iexcl: "¡", iquest: "¿",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => safeChar(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n: string) => NAMED[n] ?? m);
}

function safeChar(cp: number): string {
  try {
    return String.fromCodePoint(cp);
  } catch {
    return " ";
  }
}

const DROP_BLOCKS = /<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->/gi;
const TEAM_OPEN =
  /<(div|section|ul|article|aside|li)\b[^>]*?\b(?:class|id)\s*=\s*["'][^"']*(?:team|equipo|staff|doctor|odont[oó]log|profesionales|especialistas|medicos|nuestros-)[^"']*["'][^>]*>/i;

/** Removes balanced elements whose class/id looks like a team/doctors block (names of people are never kept). */
export function removeTeamBlocks(html: string): string {
  let out = html;
  for (let guard = 0; guard < 50; guard++) {
    const m = TEAM_OPEN.exec(out);
    if (!m) break;
    const tag = m[1]!.toLowerCase();
    const start = m.index;
    const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
    re.lastIndex = start + m[0].length;
    let depth = 1;
    let end = -1;
    for (let t = re.exec(out); t; t = re.exec(out)) {
      depth += t[1] ? -1 : 1;
      if (depth === 0) {
        end = t.index + t[0].length;
        break;
      }
    }
    if (end < 0 || end - start > out.length * 0.6) {
      // Unbalanced or suspiciously large (a page wrapper): neutralise the marker and move on.
      out = out.slice(0, start) + `<${tag}>` + out.slice(start + m[0].length);
      continue;
    }
    out = out.slice(0, start) + " " + out.slice(end);
  }
  return out;
}

const NAME_TITLE =
  /\b(?:Dres?|Dras?|Doctor|Doctora|Odont[óo]log[oa])\.?\s+(?:de\s+|del\s+)?[A-ZÁÉÍÓÚÑ][\p{L}'-]+(?:\s+(?:de\s+|del\s+|la\s+)?[A-ZÁÉÍÓÚÑ][\p{L}'-]+){0,3}/gu;

const AT_RE = /\s*[[({]\s*(?:at|arroba)\s*[\])}]\s*/gi;
const DOT_RE = /\s*[[({]\s*(?:dot|punto)\s*[\])}]\s*/gi;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
const FAKE_EMAIL = /\.(png|jpe?g|gif|webp|svg|css|js|ico|woff2?)$|@(example|sentry|wixpress|domain|email)\./i;

export function truncateBytes(s: string, max: number): string {
  const buf = Buffer.from(s, "utf8");
  if (buf.length <= max) return s;
  return buf.subarray(0, max).toString("utf8").replace(/�+$/, "").trim();
}

function toText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/section|\/header|\/footer)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function metaContent(html: string, name: string): string {
  const m = new RegExp(`<meta\\b[^>]*(?:name|property)\\s*=\\s*["']${name}["'][^>]*>`, "i").exec(html)?.[0];
  return m ? (/content\s*=\s*["']([^"']*)["']/i.exec(m)?.[1] ?? "") : "";
}

const BOOKING_RE =
  /(agenda(?:r)?\s+(?:tu\s+|su\s+)?(?:cita|consulta)|agenda\s+en\s+l[ií]nea|cita\s+en\s+l[ií]nea|reserva\s+(?:tu\s+)?cita|reservar\s+(?:tu\s+)?cita|book\s+(?:an\s+)?appointment|schedule\s+(?:an\s+)?appointment|calendly\.com|doctoralia\.|agendapro\.|acuity|setmore|simplybook|zocdoc|tuotempo)/i;
const SOCIAL_RE = /href\s*=\s*["']https?:\/\/(?:[\w-]+\.)*(facebook|instagram|linkedin|tiktok|youtube|twitter|x)\.com/gi;
const WA_RE = /(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?(?:[^"'\s]*?&(?:amp;)?)?phone=|web\.whatsapp\.com\/send\?phone=)\+?(\d{7,15})/gi;

function formInfo(formHtml: string): { contact: boolean; appointment: boolean } {
  const f = formHtml.toLowerCase();
  if (/type\s*=\s*["']?password|role\s*=\s*["']search|class\s*=\s*["'][^"']*(search|login|newsletter|suscri|subscribe)/.test(f)) {
    return { contact: false, appointment: false };
  }
  const hasEmail = /type\s*=\s*["']?email|(?:name|id|placeholder)\s*=\s*["'][^"']*(e-?mail|correo)/.test(f);
  const hasMessage = /<textarea|(?:name|id|placeholder)\s*=\s*["'][^"']*(mensaje|message|comentario|consulta|msg)/.test(f);
  const appointment = /cita|agendar|appointment|reserva/.test(f);
  return { contact: hasEmail && hasMessage, appointment: appointment && (hasEmail || /type\s*=\s*["']?tel/.test(f)) };
}

/** Extracts generic contacts, signals and a sanitised text excerpt from one HTML page. */
export function extractPage(rawHtml: string, pageUrl: string, opts: ExtractOptions = {}): PageExtraction {
  const country = opts.country ?? "CO";
  const html = rawHtml.replace(DROP_BLOCKS, " ");
  const decoded = decodeEntities(html);
  const contacts: ExtractedContact[] = [];
  const seen = new Set<string>();
  const add = (c: ExtractedContact) => {
    const k = `${c.type}|${c.value}`;
    if (!seen.has(k)) {
      seen.add(k);
      contacts.push(c);
    }
  };

  // Emails: mailto + visible text + simple de-obfuscation.
  const deobf = decoded.replace(AT_RE, "@").replace(DOT_RE, ".");
  const emails = new Set<string>();
  for (const m of deobf.matchAll(EMAIL_RE)) {
    const e = m[0].toLowerCase().replace(/^[.%+-]+|[.]+$/g, "");
    if (!FAKE_EMAIL.test(e)) emails.add(e);
  }
  let discarded = 0;
  for (const e of emails) {
    if (isGenericEmail(e)) add({ type: "email", value: e, isGeneric: true, evidenceUrl: pageUrl });
    else discarded++;
  }

  // Phones: tel: links + text.
  const text0 = toText(html);
  const phoneCandidates = [...decoded.matchAll(/href\s*=\s*["']tel:([^"']+)["']/gi)].map((m) => decodeURIComponent(m[1]!));
  phoneCandidates.push(...(text0.match(/(?:\+|00)?\d[\d\s().-]{6,18}\d/g) ?? []));
  let phones = 0;
  for (const cand of phoneCandidates) {
    const p = normalizePhone(cand, country);
    if (p && phones < 5 && !seen.has(`phone|${p}`)) {
      add({ type: "phone", value: p, isGeneric: true, evidenceUrl: pageUrl });
      phones++;
    }
  }

  // WhatsApp links (data only; nothing is ever sent).
  for (const m of decoded.matchAll(WA_RE)) {
    const p = normalizePhone("+" + m[1], country);
    if (p) add({ type: "whatsapp", value: p, isGeneric: false, evidenceUrl: pageUrl });
  }

  // Forms (never submitted).
  let hasContactForm = false;
  let hasAppointmentForm = false;
  for (const m of html.matchAll(/<form\b[\s\S]*?<\/form\s*>/gi)) {
    const info = formInfo(m[0]);
    hasContactForm ||= info.contact;
    hasAppointmentForm ||= info.appointment;
  }
  if (hasContactForm) add({ type: "web_form", value: pageUrl.split("#")[0]!, isGeneric: true, evidenceUrl: pageUrl });

  const social = new Set<string>();
  for (const m of decoded.matchAll(SOCIAL_RE)) social.add(m[1]!.toLowerCase() === "x" ? "twitter" : m[1]!.toLowerCase());

  let year: number | null = null;
  for (const m of decoded.matchAll(/(?:©|copyright)[^0-9<]{0,25}((?:19|20)\d{2})(?:\s*[-–]\s*((?:19|20)\d{2}))?/gi)) {
    year = Math.max(year ?? 0, Number(m[2] ?? m[1]));
  }

  // Sanitised text: no team blocks, no "Dr. Nombre", no personal emails.
  const body = removeTeamBlocks(html);
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
  const desc = metaContent(html, "description");
  let text = [decodeEntities(title).trim(), decodeEntities(desc).trim(), toText(body)].filter(Boolean).join("\n");
  text = text.replace(NAME_TITLE, "[profesional]").replace(EMAIL_RE, (e) => (isGenericEmail(e) ? e : "[correo]"));

  return {
    contacts,
    text,
    discardedPersonalEmails: discarded,
    hasContactForm,
    hasAppointmentForm,
    onlineBooking: BOOKING_RE.test(decoded),
    socialNetworks: [...social],
    copyrightYear: year,
  };
}

/** Merges per-page extractions into one site-level result (deduplicated, text capped at 8 KB). */
export function mergeExtractions(pages: PageExtraction[]): SiteExtraction {
  const seen = new Set<string>();
  const contacts: ExtractedContact[] = [];
  for (const c of pages.flatMap((p) => p.contacts)) {
    const k = `${c.type}|${c.value}`;
    if (!seen.has(k)) {
      seen.add(k);
      contacts.push(c);
    }
  }
  const hasContactForm = pages.some((p) => p.hasContactForm);
  const onlineBooking = pages.some((p) => p.onlineBooking);
  const signals: SiteSignals = {
    hasContactForm,
    onlineBooking,
    noAppointmentForm: !onlineBooking && !pages.some((p) => p.hasAppointmentForm || p.hasContactForm),
    socialNetworks: [...new Set(pages.flatMap((p) => p.socialNetworks))],
    copyrightYear: pages.reduce<number | null>((a, p) => (p.copyrightYear ? Math.max(a ?? 0, p.copyrightYear) : a), null),
  };
  return {
    contacts,
    signals,
    websiteText: truncateBytes(pages.map((p) => p.text).filter(Boolean).join("\n\n"), MAX_WEBSITE_TEXT_BYTES),
    discardedPersonalEmails: pages.reduce((a, p) => a + p.discardedPersonalEmails, 0),
  };
}

/** Same-site contact page candidates found in links of the home page, in order of appearance. */
export function findContactLinks(html: string, base: URL): string[] {
  const out: string[] = [];
  for (const m of html.replace(DROP_BLOCKS, " ").matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi)) {
    const label = toText(m[2]!).toLowerCase();
    if (!/contact/.test(m[1]!.toLowerCase()) && !/contact/.test(label)) continue;
    try {
      const u = new URL(decodeEntities(m[1]!), base);
      if ((u.protocol === "http:" || u.protocol === "https:") && u.hostname === base.hostname) {
        u.hash = "";
        if (!out.includes(u.href)) out.push(u.href);
      }
    } catch {
      /* ignore malformed hrefs */
    }
  }
  return out;
}
