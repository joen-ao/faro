/**
 * F44 · Rules enforced in code on every outgoing message, so a model slip never reaches WhatsApp: plain text (no
 * markdown), at most one *emphasis*, no emojis unless the contact used them, a length cap, and no time of day the
 * calendar did not return.
 */
export const MAX_CHARS = 600;

const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu;

export const hasEmoji = (s: string) => /\p{Extended_Pictographic}/u.test(s);

export interface SanitizeResult {
  text: string;
  /** What was changed, for logs and the eval. */
  fixes: string[];
}

export function sanitizeOutgoing(raw: string, opts: { allowEmoji: boolean }): SanitizeResult {
  const fixes: string[] = [];
  let t = raw.replace(/\r\n/g, "\n").trim();
  const before = t;
  t = t
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "") // bullets / numbered lists
    .replace(/\*\*(.+?)\*\*/g, "*$1*") // bold -> WhatsApp emphasis
    .replace(/__(.+?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1 ($2)"); // markdown links
  if (t !== before) fixes.push("markdown");
  // Keep only the first *emphasis*.
  let seen = 0;
  const emph = t.replace(/\*([^*\n]+)\*/g, (_m, inner: string) => (++seen === 1 ? `*${inner}*` : inner));
  if (emph !== t) fixes.push("emphasis");
  t = emph.replace(/\*{2,}/g, "");
  if (!opts.allowEmoji && hasEmoji(t)) {
    t = t.replace(EMOJI, "").replace(/[ \t]{2,}/g, " ");
    fixes.push("emoji");
  }
  t = t.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim();
  if (t.length > MAX_CHARS) {
    const cut = t.slice(0, MAX_CHARS);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("."), cut.lastIndexOf("?"));
    t = (end > MAX_CHARS * 0.5 ? cut.slice(0, end + 1) : cut).trim();
    fixes.push("length");
  }
  return { text: t, fixes };
}

const to24 = (h: number, m: number, mer: string | undefined): string | null => {
  let hh = h;
  if (mer) {
    const pm = /p/i.test(mer);
    if (h < 1 || h > 12) return null;
    hh = (h % 12) + (pm ? 12 : 0);
  }
  if (hh < 0 || hh > 23 || m < 0 || m > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/**
 * Times of day mentioned in a message, as HH:MM (24 h): "4:00 p. m.", "16:20", "5 pm". Spans like "de 4 a 9 p. m." are
 * not offers and are left alone only when they carry no minutes and no meridiem on the first number.
 */
export function mentionedTimes(text: string): string[] {
  const out = new Set<string>();
  const re = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?(?![\d%])/gi;
  for (const m of text.matchAll(re)) {
    const [, h, min, mer] = m;
    if (min === undefined && !mer) continue; // a bare number ("3 opciones", "20 minutos")
    // A date such as "10:30" in "2026-11-10" never matches \b(\d{1,2}):(\d{2}) after a dash-digit; ISO dates are not prose.
    const t = to24(Number(h), Number(min ?? 0), mer);
    if (t) out.add(t);
  }
  return [...out];
}

/** Times in `text` that the calendar never offered in this conversation. */
export function inventedTimes(text: string, offered: ReadonlySet<string>): string[] {
  return mentionedTimes(text).filter((t) => !offered.has(t));
}

const OPT_OUT = /^\s*(baja|stop|cancelar suscripci[oó]n|no me interesa|no me escriban|no quiero (?:que me escriban|recibir))\b/i;

/** BAJA / STOP / "no me interesa" as the whole intent of the message. */
export const isOptOut = (text: string) => OPT_OUT.test(text.trim());

/** F46 · "la hora sigue libre / está disponible": a promise the calendar has not made until agendar_diagnostico says ok. */
export function claimsSlotFree(text: string): boolean {
  return /\b(?:est[aá]|sigue|queda|qued[oó])\s+(?:libre|disponible)s?\b/i.test(text);
}
