/** Pure helpers for the F02 coverage test (no I/O). */

const LEGAL_SUFFIXES = new Set(["sas", "sa", "ltda", "ips", "eu", "cia", "ca", "sc", "inc", "llc", "corp", "co", "ltd", "lc", "pllc", "pa"]);
const GENERIC_WORDS = new Set([
  "clinica", "clinicas", "odontologica", "odontologico", "odontologia", "odontologos", "dental", "dentales", "dentist", "dentistry",
  "dentista", "centro", "consultorio", "restaurante", "restaurant", "restaurantes", "grill", "bar", "cafe", "de", "del", "la", "las",
  "el", "los", "y", "e", "and", "the", "of", "en", "bogota", "miami", "colombia", "especializada", "integral", "salud", "oral",
]);

/** Lowercase, strip accents/punctuation, drop legal suffixes and generic sector words. */
export function normalizeName(name: string | undefined | null): string {
  if (!name) return "";
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    // Merge dotted acronyms split by punctuation: "s a s" -> "sas", "e u" -> "eu".
    .reduce<string[]>((acc, t) => {
      const prev = acc[acc.length - 1];
      if (t.length === 1 && prev !== undefined && prev.length <= 2 && /^[a-z]+$/.test(prev)) {
        acc[acc.length - 1] = prev + t;
      } else acc.push(t);
      return acc;
    }, []);
  const noLegal = base.filter((t) => !LEGAL_SUFFIXES.has(t));
  const core = noLegal.filter((t) => !GENERIC_WORDS.has(t));
  return (core.length ? core : noLegal.length ? noLegal : base).join(" ");
}

export const hasValue = (v: string | undefined | null): boolean => !!v && v.trim().length > 0;

export function pct(n: number, of: number): number | null {
  return of > 0 ? Math.round((n / of) * 1000) / 10 : null;
}

export interface FieldCoverage {
  withValue: number;
  of: number;
  /** null when `of` is 0. */
  pct: number | null;
}

export function fieldCoverage<T>(items: readonly T[], pick: (item: T) => string | boolean | undefined | null): FieldCoverage {
  const withValue = items.filter((i) => {
    const v = pick(i);
    return typeof v === "boolean" ? v : hasValue(v);
  }).length;
  return { withValue, of: items.length, pct: pct(withValue, items.length) };
}

export interface Overlap {
  /** Items of A whose normalized name also appears in B. */
  matched: number;
  aTotal: number;
  bTotal: number;
  pctOfA: number | null;
  pctOfB: number | null;
}

/** Approximate overlap by exact match of normalized names (empty names ignored). */
export function nameOverlap(a: readonly string[], b: readonly string[]): Overlap {
  const na = a.map(normalizeName).filter(Boolean);
  const nb = b.map(normalizeName).filter(Boolean);
  const setB = new Set(nb);
  const setA = new Set(na);
  const matched = na.filter((n) => setB.has(n)).length;
  const matchedB = nb.filter((n) => setA.has(n)).length;
  return { matched, aTotal: na.length, bTotal: nb.length, pctOfA: pct(matched, na.length), pctOfB: pct(matchedB, nb.length) };
}

/** Exact-normalized-name duplicates inside one list (e.g. several REPS sites of one IPS). */
export function uniqueNames(names: readonly string[]): number {
  return new Set(names.map(normalizeName).filter(Boolean)).size;
}

const GENERIC_LOCAL = [
  "info", "contact", "citas", "cita", "hola", "ventas", "servicio", "atencion", "recepcion", "gerencia", "admin", "comercial",
  "facturacion", "clinica", "odont", "dental", "secretaria", "pqrs", "soporte", "agenda", "cartera", "calidad", "mercadeo",
  "gestion", "juridica", "talento", "reservas", "ayuda", "hello", "sales", "support", "office", "contabilidad", "compras",
];

/** True for role mailboxes (info@, contacto@, citas@...); false for personal-looking addresses. */
export function isGenericEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const local = email.split("@")[0]?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
  return !!local && GENERIC_LOCAL.some((g) => local.startsWith(g));
}
