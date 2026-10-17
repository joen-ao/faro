import { looksLikePersonalName } from "@/integrations/socrata/datasets";

const GENERIC_LOCAL = [
  "info", "contact", "citas", "cita", "hola", "ventas", "servicio", "atencion", "recepcion", "gerencia", "admin", "comercial",
  "facturacion", "clinica", "odont", "dental", "secretaria", "pqrs", "soporte", "agenda", "cartera", "calidad", "mercadeo",
  "gestion", "juridica", "talento", "reservas", "ayuda", "hello", "sales", "support", "office", "contabilidad", "compras",
];

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const GENERIC_TOKENS = new Set([...GENERIC_LOCAL, "contacto", "contactenos", "odontologia", "odontologica", "clinicadental", "citasonline", "agendamiento"]);

/**
 * True for role mailboxes: the first token of the local part must be exactly a known generic word
 * (optionally followed by digits), then optional separated suffixes: info, info.bogota, citas-norte, contacto2.
 * Glued prefixes (clinicajuanperez@, odontomaria@) and suffixes that are first names are NOT generic.
 */
export function isGenericEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const parts = strip(email.split("@")[0] ?? "").replace(/\+.*$/, "").split(/[._-]+/).filter(Boolean);
  const first = (parts[0] ?? "").replace(/\d+$/, "");
  if (!first || !GENERIC_TOKENS.has(first)) return false;
  return parts.slice(1).every((p) => !COMMON_FIRST_NAMES.has(p.replace(/\d+$/, "")) && !/^[a-z]{1,2}$/.test(p));
}

const COMMON_FIRST_NAMES = new Set([
  "juan", "carlos", "luis", "jose", "andres", "camilo", "david", "daniel", "santiago", "sebastian", "jorge", "mario", "pedro",
  "miguel", "fernando", "ricardo", "alejandro", "felipe", "diego", "oscar", "javier", "hernando", "gustavo", "alberto",
  "maria", "ana", "laura", "carolina", "paula", "claudia", "diana", "sandra", "andrea", "natalia", "juliana", "luz", "martha",
  "patricia", "adriana", "liliana", "viviana", "catalina", "daniela", "sofia", "valentina", "angela", "gloria", "lucia",
  "john", "michael", "robert", "james", "william", "mary", "jennifer", "linda", "jessica", "sarah",
]);

const COMMON_SURNAMES =
  "gonzalez|garcia|perez|rodriguez|martinez|lopez|gomez|hernandez|ramirez|torres|diaz|vargas|castro|rojas|moreno|jimenez|ruiz|mendoza|ortiz|silva|herrera|medina|cardenas|acevedo|suarez|munoz|romero|salazar|giraldo|restrepo|zapata|rios|cruz|reyes|pardo|duran|ospina";
const INITIAL_SURNAME = new RegExp(`^[a-z](?:${COMMON_SURNAMES})$`);

/**
 * True when the local part looks like a person: nombre.apellido@, inicial+apellido (jperez@),
 * or starts with a common first name. Generic role mailboxes always return false.
 */
export function looksLikePersonalEmail(email: string | undefined | null): boolean {
  if (!email || !email.includes("@")) return false;
  if (isGenericEmail(email)) return false;
  const raw = strip(email.split("@")[0] ?? "").replace(/\+.*$/, "");
  const parts = raw.split(/[._-]+/).filter(Boolean);
  const letters = raw.replace(/[^a-z]/g, "");
  if (parts.length >= 2 && parts.every((p) => /^[a-z]{2,}$/.test(p))) return true; // nombre.apellido
  if (parts.length === 2 && /^[a-z]$/.test(parts[0]!) && /^[a-z]{3,}$/.test(parts[1]!)) return true; // j.perez
  const first = parts[0] ?? "";
  if (COMMON_FIRST_NAMES.has(first)) return true; // maria@, carlos@
  for (const n of COMMON_FIRST_NAMES) {
    // carlosperez@
    if (n.length >= 4 && letters.startsWith(n) && letters.length >= n.length + 3 && letters.length <= n.length + 14) return true;
  }
  return parts.length === 1 && INITIAL_SURNAME.test(first); // jperez@
}

const LEGAL_SUFFIX =
  /\b(s\.?\s?a\.?\s?s\.?|s\.?\s?a\.?|ltda\.?|s\.?\s?en\s?c\.?|e\.?\s?s\.?\s?p\.?|llc|inc\.?|corp\.?|fundaci[oó]n|corporaci[oó]n|cooperativa|asociaci[oó]n)(?=\s|$|[.,)])/i;
const BUSINESS_HINT =
  /\b(cl[ií]nica|odontolog[ií]a|dental|restaurante|centro|grupo|instituto|laboratorio|hospital|consultorio|bar|caf[eé]|pizzer[ií]a|parrilla|cocina|asadero|bistro|grill|kitchen|dentistry|smile|sonrisa)\b/i;

export interface LegalEntityVerdict {
  legal: boolean;
  /** false => heuristic only; show "por verificar". */
  verified: boolean;
  reason: string;
}

/**
 * Whether a company is a legal entity. `legalNature` comes from RUES/REPS when available (verified).
 * Without it (OSM/Places) we apply a name heuristic and flag the result "por verificar".
 */
export function isLegalEntity(name: string, legalNature?: string | null): LegalEntityVerdict {
  if (legalNature) {
    const natural = /persona natural|profesional independiente/i.test(legalNature);
    return { legal: !natural, verified: true, reason: natural ? "Persona natural según registro" : "Persona jurídica según registro" };
  }
  if (looksLikePersonalName(name)) return { legal: false, verified: false, reason: "Razón social parece nombre de persona (E.U.)" };
  if (/^\s*(dr|dra|doc|doctor|doctora|odont[oó]log[oa])\.?\s/i.test(name)) {
    return { legal: false, verified: false, reason: "Nombre con título profesional; por verificar" };
  }
  if (LEGAL_SUFFIX.test(name)) return { legal: true, verified: false, reason: "Sufijo societario en el nombre; por verificar" };
  if (BUSINESS_HINT.test(name)) return { legal: true, verified: false, reason: "Nombre comercial de establecimiento; por verificar" };
  return { legal: true, verified: false, reason: "Sin señales de persona natural; por verificar" };
}
