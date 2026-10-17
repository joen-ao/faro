/**
 * Names of sources WITHOUT legal-nature data (OSM, Places, inbound) are stored and shown only when they look like a
 * business (SPEC §8: never store personal names). Barriers, by OSM category (F19b):
 *  - professional (dentist, doctors, clinic, healthcare=*, lawyer...): strict allow-list. A name needs a business word or a
 *    chain brand tag; a name with a titled person inside ("Dra. Ana Gómez - Odontología") is stored MASKED and never contactable.
 *  - commerce (restaurant, cafe, bar, fast_food, shop=*): the name is kept unless `looksLikePersonName` flags it.
 *  - unknown category: treated as professional (safe default).
 * `looksLikePersonName` (titles + name dictionaries) is the explicit person detector used by all of them.
 */

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Connectors are ignored when counting words; they never make a name look like a business. */
const PARTICLES = new Set(["de", "del", "la", "las", "los", "y", "e", "da", "di", "van", "von"]);

/** Prefix patterns of business/sector words (folded, no accents). */
const BUSINESS_RE = new RegExp(
  "^(" +
    [
      "clinic", "consult", "centro", "center", "odont", "ondont", "dent", "ortho", "orto", "poli(?:clin|salud|dent|odont|medic)", "coop", "molar", "muela", "san$", "santa$", "vida$", "vital", "bienestar", "wellness", "prevent", "ortodon", "endodon", "periodon", "implant", "sonr", "smile", "salud", "oral(?!ia$|es$)", "ips$", "sas$", "s\\.?a\\.?s?$",
      "sa$", "ltda", "eu$", "cia$", "grupo", "group", "instituto", "especialist", "laborat", "lab$", "spa$", "estudio", "studio", "restaur", "cafe", "cafet", "bar$", "cocina",
      "kitchen", "grill", "carne", "asad", "pollo", "taco", "helad", "arepa", "empanad", "brasa", "wok", "marisc", "fogon", "cevich", "sazon", "pub$", "pizz", "panader", "pasteler", "bistro", "burger", "hamburgues", "sushi", "parrilla", "asadero", "comida", "food", "hospital", "medic(?:o|a|os|as|al|ales|ina)?$", "farmac",
      "droguer", "optic", "veterin", "gimnas", "gym", "hotel", "tienda", "store", "shop", "taller", "ferreter", "supermerc", "asociad", "hermanos", "casa$", "fundacion",
      "cooperativa", "unidad", "servicio", "soluciones", "express", "integral", "care$", "health", "medical", "dental", "dentist", "orthodon", "pediatr", "estetic",
      "rehabilit", "radiolog", "diagnost", "corp(?:oracion|oraciones)?$", "inc$", "llc$", "ltd$", "co$", "&", "empresa", "company", "sucursal", "oficina", "agencia", "banco",
    ].join("|") +
    ")",
);

/** Business words inside a token (Coodontólogos, OroSalud, Prosalud) or at its end (Acadent, Orallife is a prefix hit). */
const SUFFIX_RE = /(dent|dental|dentix|dents|odonto|salud)$|odont|dental|salud|dent(?!on|ro)/;

const TITLE_RE = /^(dr|dra|doc|doctor|doctora|od|odont|odontologo|odontologa|ing|lic|esp)\.?$/;

const GIVEN = new Set(
  (
    "juan jose luis carlos jorge pedro miguel andres camilo david daniel diego felipe sergio ricardo fernando alejandro oscar javier mario manuel alberto eduardo gustavo hector julian mauricio nicolas santiago sebastian " +
    "esteban cristian jairo german hernan edgar edwin wilson fabian henry ivan jaime jhon john leonardo lorenzo marcos martin nelson orlando rafael ramiro roberto rodrigo ruben samuel victor yeison yeferson wilmer " +
    "ana maria carolina paola claudia diana sandra liliana patricia martha marta luz gloria adriana andrea natalia laura catalina juliana angela yanira monica viviana carmen sofia isabel lucia elena johana " +
    "valentina daniela camila mariana alejandra paula gabriela veronica lorena jennifer jessica luisa marcela milena nancy olga rocio rosa sara silvia tatiana yamile yesenia leidy erika karen katherine kelly " +
    "michael robert william james mary linda susan lisa sarah thomas charles richard maricela ingrid johanna lina lucero nidia piedad stella teresa ximena zulma pilar dora alba amparo beatriz blanca cecilia " +
    "inés ines fanny flor gladys herminia irma josefina leonor lilia margarita miryam myriam norma ofelia consuelo constanza"
  )
    .split(" ")
    .map(fold),
);

const SURNAMES = new Set(
  (
    "gomez perez rodriguez garcia martinez lopez gonzalez hernandez ramirez torres cruz diaz vargas castro rojas moreno jimenez ruiz mejia ortiz silva suarez mendoza salazar cardenas bustos navarro " +
    "restrepo ospina henao giraldo munoz sanchez alvarez gutierrez castano zapata pena ortega morales medina herrera ramos aguirre acosta aristizabal arango arias bedoya betancur cano cardona carvajal " +
    "cespedes correa delgado duque escobar espinosa florez franco gaviria granados guerrero guzman jaramillo lozano marin marulanda monsalve montoya naranjo osorio pardo parra patino pineda quintero " +
    "ramirez reyes rios rivera rueda salamanca santos sierra soto tamayo toro uribe valencia valderrama velasquez villa zuluaga smith johnson brown garzon bernal barrera cortes duran fonseca galvis leon " +
    "londono corpas medicis molina nino ocampo palacio paez prieto quiroga rincon robledo roldan sandoval serna triana trujillo varela vega velez villegas ardila angel buitrago camargo candela"
  )
    .split(" ")
    .map(fold),
);

function tokens(name: string): string[] {
  return fold(name)
    .replace(/[^a-z&\s.]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/\./g, ""))
    .filter(Boolean);
}

/** True when any word is a business/sector word (particles never count). `extra` = sector keywords of the ICP. */
export function hasBusinessWord(name: string | null | undefined, extra: readonly string[] = []): boolean {
  if (!name) return false;
  const extras = extra.map(fold).filter(Boolean);
  return tokens(name).some((w) => !PARTICLES.has(w) && (BUSINESS_RE.test(w) || SUFFIX_RE.test(w) || extras.some((x) => w.startsWith(x))));
}

/** True when the name reads like a natural person (titles + 1-3 plain words, or known given names/surnames). */
export function looksLikePersonName(name: string | null | undefined): boolean {
  if (!name?.trim()) return false;
  const w = tokens(name);
  if (w.length === 0) return false;
  const core = w.filter((t) => !PARTICLES.has(t));
  if (TITLE_RE.test(w[0]) && core.length >= 2) {
    // "Dr. Smile", "Dra. Sonrisa", "Doc Dental" are brands; "Dra. Ana María Gómez" is a person.
    const rest = core.slice(1);
    return rest.length <= 4 && !rest.some((t) => BUSINESS_RE.test(t) || SUFFIX_RE.test(t));
  }
  if (core.some((t) => BUSINESS_RE.test(t) || SUFFIX_RE.test(t))) return false;
  if (core.length < 1 || core.length > 7) return false;
  if (!core.every((t) => /^[a-z]+$/.test(t))) return false;
  return core.some((t) => GIVEN.has(t) || SURNAMES.has(t));
}

export type NameCategory = "professional" | "commerce" | "unknown";

const PROFESSIONAL_AMENITY = new Set(["dentist", "doctors", "clinic"]);
const PROFESSIONAL_OFFICE = new Set(["lawyer", "accountant", "notary", "architect", "tax_advisor", "financial_advisor", "insurance", "consulting"]);
const COMMERCE_AMENITY = new Set(["restaurant", "cafe", "bar", "fast_food", "pub", "ice_cream", "food_court", "biergarten"]);

const rawTags = (raw: Record<string, unknown> | undefined): Record<string, unknown> =>
  (raw?.tags && typeof raw.tags === "object" ? (raw.tags as Record<string, unknown>) : raw) ?? {};

/** OSM category of a record: professional (solo practices are common), commerce (establishments), or unknown. */
export function nameCategory(raw: Record<string, unknown> | undefined): NameCategory {
  const t = rawTags(raw);
  const amenity = typeof t.amenity === "string" ? t.amenity : "";
  const office = typeof t.office === "string" ? t.office : "";
  if (typeof t.healthcare === "string" || PROFESSIONAL_AMENITY.has(amenity) || PROFESSIONAL_OFFICE.has(office)) return "professional";
  if (COMMERCE_AMENITY.has(amenity) || (typeof t.shop === "string" && t.shop)) return "commerce";
  return "unknown";
}

const TITLE_PERSON_RE = /^(dr|dra|doctor|doctora|od|odontologo|odontologa)$/;

/**
 * A professional title followed by a word that is not a business word, in ANY position: "Dra. Ana Gómez", "Consultorio
 * Dr. Pérez", "Clínica odontológica Dra. Nora". "Dr. Smile", "Dra. Sonrisa" and "Doc Dental" are brands, not people.
 */
export function hasTitledPerson(name: string | null | undefined, extra: readonly string[] = []): boolean {
  if (!name) return false;
  const w = tokens(name);
  for (let i = 0; i < w.length - 1; i++) {
    if (!TITLE_PERSON_RE.test(w[i])) continue;
    const next = w.slice(i + 1).find((t) => !PARTICLES.has(t));
    if (next && /^[a-z]+$/.test(next) && !hasBusinessWord(next, extra)) return true;
  }
  return false;
}

export type NameVerdict = { action: "keep" } | { action: "mask"; name: string } | { action: "exclude" };

const maskedName = (name: string) => (/odont|dent|ortho|orto|sonri|smile/.test(fold(name)) ? "Consultorio odontológico (por verificar)" : "Consultorio profesional (por verificar)");

/**
 * Decides what to do with a name from a source without legal nature (SPEC §8): keep as is, store masked (a titled
 * person inside a business name; the caller must mark the company as not legal-entity so it is never contactable),
 * or exclude. Chain brand tags keep a name unless it starts with a title and reads as a person.
 */
export function classifyBusinessName(
  name: string | null | undefined,
  opts: { brand?: boolean; extraWords?: readonly string[]; category?: NameCategory } = {},
): NameVerdict {
  if (!name?.trim()) return { action: "exclude" };
  const category = opts.category ?? "unknown";
  if (opts.brand) {
    const w = tokens(name);
    return TITLE_RE.test(w[0] ?? "") && looksLikePersonName(name) ? { action: "exclude" } : { action: "keep" };
  }
  if (looksLikePersonName(name)) return { action: "exclude" };
  if (category === "commerce") return hasTitledPerson(name, opts.extraWords) ? { action: "exclude" } : { action: "keep" };
  if (!hasBusinessWord(name, opts.extraWords)) return { action: "exclude" };
  return hasTitledPerson(name, opts.extraWords) ? { action: "mask", name: maskedName(name) } : { action: "keep" };
}

/** True when the name can be stored and shown as is. */
export function keepBusinessName(
  name: string | null | undefined,
  opts: { brand?: boolean; extraWords?: readonly string[]; category?: NameCategory } = {},
): boolean {
  return classifyBusinessName(name, opts).action === "keep";
}

/** True when the OSM/Places record carries a chain `brand` tag (kept in `raw` by the allow-list). */
export function hasBrandTag(raw: Record<string, unknown> | undefined): boolean {
  const tags = rawTags(raw);
  return typeof tags.brand === "string" && tags.brand.trim().length > 0;
}

interface Screenable {
  name: string;
  phone?: string;
  email?: string;
  isLegalEntity?: boolean;
  raw: Record<string, unknown>;
}

/**
 * Applies `classifyBusinessName` to OSM records. Masked ones keep location and website for the map but lose the person's
 * name, phone and email, and are flagged `isLegalEntity: false` so compliance never lets them be contacted.
 */
export function screenOsmCompanies<T extends Screenable>(all: readonly T[], extraWords: readonly string[] = []): { kept: T[]; excluded: number; masked: number } {
  const kept: T[] = [];
  let masked = 0;
  for (const c of all) {
    const v = classifyBusinessName(c.name, { brand: hasBrandTag(c.raw), extraWords, category: nameCategory(c.raw) });
    if (v.action === "keep") kept.push(c);
    else if (v.action === "mask") {
      masked++;
      // The person's name must not survive anywhere: not in `name`, nor in `raw.tags` (it is read back as osmTags).
      const { name: _dropped, ...tags } = rawTags(c.raw);
      void _dropped;
      const nameTags = Object.fromEntries(Object.entries(tags).filter(([k]) => !k.startsWith("name:")));
      kept.push({ ...c, name: v.name, phone: undefined, email: undefined, isLegalEntity: false, raw: { ...c.raw, tags: nameTags, name_masked: true } });
    }
  }
  return { kept, excluded: all.length - kept.length, masked };
}
