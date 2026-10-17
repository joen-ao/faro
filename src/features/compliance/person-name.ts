/**
 * Names of sources WITHOUT legal-nature data (OSM, Places, inbound) are stored and shown only when they look like a
 * business (allow-list, SPEC §8: never store personal names). Two barriers:
 *  1. `keepBusinessName`: keeps a name only if it has a business word, or a chain brand tag, or the company is in
 *     RUES/REPS (caller decides that one). Everything else is `excluded_personal`.
 *  2. `looksLikePersonName`: explicit person detector (titles + name dictionaries) used as a second barrier.
 */

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Connectors are ignored when counting words; they never make a name look like a business. */
const PARTICLES = new Set(["de", "del", "la", "las", "los", "y", "e", "da", "di", "van", "von"]);

/** Prefix patterns of business/sector words (folded, no accents). */
const BUSINESS_RE = new RegExp(
  "^(" +
    [
      "clinic", "consult", "centro", "center", "odont", "dent", "ortodon", "endodon", "periodon", "implant", "sonr", "smile", "salud", "oral(?!ia$|es$)", "ips$", "sas$", "s\\.?a\\.?s?$",
      "sa$", "ltda", "eu$", "cia$", "grupo", "group", "instituto", "especialist", "laborat", "lab$", "spa$", "estudio", "studio", "restaur", "cafe", "cafet", "bar$", "cocina",
      "kitchen", "grill", "pizz", "panader", "pasteler", "bistro", "burger", "hamburgues", "sushi", "parrilla", "asadero", "comida", "food", "hospital", "medic", "farmac",
      "droguer", "optic", "veterin", "gimnas", "gym", "hotel", "tienda", "store", "shop", "taller", "ferreter", "supermerc", "asociad", "hermanos", "casa$", "fundacion",
      "cooperativa", "unidad", "servicio", "soluciones", "express", "integral", "care$", "health", "medical", "dental", "dentist", "orthodon", "pediatr", "estetic",
      "rehabilit", "radiolog", "diagnost", "corp", "inc$", "llc$", "ltd$", "co$", "&", "empresa", "company", "sucursal", "oficina", "agencia", "banco",
    ].join("|") +
    ")",
);

const SUFFIX_RE = /(dent|dental|dentix|odonto)$/;

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
    "londono molina nino ocampo palacio paez prieto quiroga rincon robledo roldan sandoval serna triana trujillo varela vega velez villegas ardila angel buitrago camargo candela"
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

/**
 * Allow-list for sources without legal nature: keep (store + show) only if it has a business word or a chain brand.
 * A leading title followed by plain words is a person even if a brand tag exists (the operator tag is never stored).
 */
export function keepBusinessName(name: string | null | undefined, opts: { brand?: boolean; extraWords?: readonly string[] } = {}): boolean {
  if (!name?.trim()) return false;
  if (opts.brand) {
    const w = tokens(name);
    return !(TITLE_RE.test(w[0] ?? "") && looksLikePersonName(name));
  }
  if (looksLikePersonName(name)) return false;
  return hasBusinessWord(name, opts.extraWords);
}

/** True when the OSM/Places record carries a chain `brand` tag (kept in `raw` by the allow-list). */
export function hasBrandTag(raw: Record<string, unknown> | undefined): boolean {
  const tags = (raw?.tags && typeof raw.tags === "object" ? (raw.tags as Record<string, unknown>) : raw) ?? {};
  return typeof tags.brand === "string" && tags.brand.trim().length > 0;
}
