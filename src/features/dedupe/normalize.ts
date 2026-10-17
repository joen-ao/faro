import { normalizePhone } from "@/integrations/overpass/phone";

/** Legal-form suffixes removed from names (tokens after accent/punctuation folding). */
const LEGAL_SUFFIXES = new Set(["sas", "ltda", "ips", "eu", "sa", "cia", "ese", "sca", "eat", "limitada", "sociedad", "anonima", "simplificada"]);

/** Generic sector words: carry no identity ("Clínica Dental X" == "X Odontología"). Configurable per sector. */
export const DEFAULT_GENERIC_WORDS: readonly string[] = [
  "clinica", "clinicas", "consultorio", "consultorios", "odontologia", "odontologica", "odontologico", "odontologicos",
  "dental", "dentales", "centro", "centros", "instituto", "salud", "oral", "restaurante", "restaurantes", "de", "del", "la", "las", "el", "los", "y", "e",
];

/** Domains that identify a platform, not a company. */
export const SHARED_DOMAINS: readonly string[] = [
  "facebook.com", "fb.com", "instagram.com", "linktr.ee", "wa.me", "whatsapp.com", "google.com", "goo.gl",
  "sites.google.com", "wixsite.com", "wix.com", "linkedin.com", "twitter.com", "x.com", "tiktok.com", "youtube.com",
  "business.site", "weebly.com", "wordpress.com", "blogspot.com", "carrd.co", "beacons.ai", "doctoralia.co", "booksy.com",
];

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Name without accents, punctuation, legal suffixes (S.A.S., LTDA, IPS, E.U., S.A.) and generic sector words.
 * If stripping generics leaves nothing, falls back to the name with only legal suffixes removed.
 */
export function normalizeName(name: string | null | undefined, generic: readonly string[] = DEFAULT_GENERIC_WORDS): string {
  if (!name) return "";
  const tokens = fold(name)
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9\s.]/g, " ")
    .replace(/\b([a-z])\.(?=\s*[a-z]\b)/g, "$1") // "s.a.s" / "e.u." -> glued letters
    .replace(/\./g, "")
    .split(/\s+/)
    .filter(Boolean);
  // Re-merge split acronyms: "s a s" -> "sas", "e u" -> "eu", "s a" -> "sa".
  const merged: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    let t = tokens[i];
    if (t.length === 1 && /[a-z]/.test(t)) {
      let j = i + 1;
      while (j < tokens.length && tokens[j].length === 1 && /[a-z]/.test(tokens[j]) && j - i < 3) t += tokens[j++];
      if (j > i + 1 && LEGAL_SUFFIXES.has(t)) {
        i = j - 1;
        merged.push(t);
        continue;
      }
      t = tokens[i];
    }
    merged.push(t);
  }
  const noLegal = merged.filter((t) => !LEGAL_SUFFIXES.has(t));
  const genericSet = new Set(generic.map(fold));
  const core = noLegal.filter((t) => !genericSet.has(t));
  return (core.length ? core : noLegal).join(" ");
}

/** True when stripping legal suffixes and generic words leaves nothing (e.g. "Clínica Dental SAS"). */
export function isGenericOnly(name: string | null | undefined, generic: readonly string[] = DEFAULT_GENERIC_WORDS): boolean {
  if (!name) return false;
  const genericSet = new Set(generic.map(fold));
  const tokens = normalizeName(name, []).split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((t) => genericSet.has(t));
}

function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const word of s.split(/\s+/).filter(Boolean)) {
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  }
  return out;
}

/** pg_trgm-style similarity in [0,1] over already-normalised strings: |A∩B| / |A∪B| of 3-gram sets. */
export function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/** Great-circle distance in metres. */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** E.164 for Colombia (+57) and US (+1) numbers; undefined if it cannot be normalised without guessing. */
export function normalizePhoneE164(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  return normalizePhone(raw, "CO") ?? normalizePhone(raw, "US");
}

/** Registrable-looking host without `www.`; undefined for empty/invalid input or shared platform domains. */
export function domainOf(url: string | null | undefined, shared: readonly string[] = SHARED_DOMAINS): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    return undefined;
  }
  host = host.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (!host.includes(".")) return undefined;
  if (shared.some((d) => host === d || host.endsWith(`.${d}`))) return undefined;
  return host;
}
