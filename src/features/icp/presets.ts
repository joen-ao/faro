import { MAX_CITIES, type HuntCity, type IcpCriteria } from "./schema";

export interface SectorMapping {
  sector: string;
  keywords: string[];
  ciiu: string[];
  osmTags: string[];
  placesTypes: string[];
}

/** sector -> CIIU / OSM tags / Google Places types (CIIU codes verified in F02). */
export const SECTOR_MAPPINGS: SectorMapping[] = [
  {
    sector: "dental",
    keywords: ["dental", "odont", "dentist", "dentista"],
    ciiu: ["8622"],
    osmTags: ["amenity=dentist", "healthcare=dentist"],
    placesTypes: ["dentist"],
  },
  {
    sector: "restaurant",
    keywords: ["restaurant", "comida", "gastro"],
    ciiu: ["5611"],
    osmTags: ["amenity=restaurant"],
    placesTypes: ["restaurant"],
  },
];

export interface CityInfo {
  city: string;
  /** Display name with accents. */
  label: string;
  country: string;
  bbox: [number, number, number, number];
  language: "es" | "en";
  keywords: string[];
  /** DANE municipio code (Colombia): REPS filters on `municipiosede`. */
  dane?: string;
  /** RUES `camara_comercio` value (RUES has no municipio column). */
  camara?: string;
}

/** DANE codes and chamber names verified against datos.gov.co (REPS `municipiosede`, RUES `camara_comercio`) on 18 Oct 2026. */
export const CITIES: CityInfo[] = [
  { city: "Bogota", label: "Bogotá", country: "CO", bbox: [4.45, -74.25, 4.84, -73.99], language: "es", keywords: ["bogota"], dane: "11001", camara: "BOGOTA" },
  { city: "Medellin", label: "Medellín", country: "CO", bbox: [6.17, -75.7, 6.37, -75.5], language: "es", keywords: ["medellin"], dane: "05001", camara: "MEDELLIN PARA ANTIOQUIA" },
  { city: "Cali", label: "Cali", country: "CO", bbox: [3.32, -76.6, 3.55, -76.45], language: "es", keywords: ["cali"], dane: "76001", camara: "CALI" },
  { city: "Barranquilla", label: "Barranquilla", country: "CO", bbox: [10.9, -74.9, 11.05, -74.75], language: "es", keywords: ["barranquilla"], dane: "08001", camara: "BARRANQUILLA" },
  { city: "Cartagena", label: "Cartagena", country: "CO", bbox: [10.35, -75.56, 10.47, -75.46], language: "es", keywords: ["cartagena"], dane: "13001", camara: "CARTAGENA" },
  { city: "Miami", label: "Miami", country: "US", bbox: [25.7, -80.32, 25.86, -80.12], language: "en", keywords: ["miami"] },
];

export interface CountryInfo {
  code: string;
  name: string;
  keywords: string[];
  /** Main preset cities, in order (max 5). */
  cities: string[];
}

/** "País" expands to its main preset cities. US only has the existing preset (Miami). */
export const COUNTRIES: CountryInfo[] = [
  { code: "CO", name: "Colombia", keywords: ["colombia", "todo el pais", "nivel nacional"], cities: ["Bogota", "Medellin", "Cali", "Barranquilla", "Cartagena"] },
  { code: "US", name: "Estados Unidos", keywords: ["estados unidos", "united states", "eeuu"], cities: ["Miami"] },
];

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (k: string) => new RegExp(`(^|[^a-z0-9])${escRe(k)}($|[^a-z0-9])`);
/** Whole-word position of a keyword (so "cali" never matches "calidad"), or -1. */
const wordAt = (t: string, k: string) => {
  const m = wordRe(k).exec(t);
  return m ? m.index + m[1].length : -1;
};

export function findSector(text: string): SectorMapping | undefined {
  const t = norm(text);
  return SECTOR_MAPPINGS.find((m) => m.keywords.some((k) => t.includes(k)));
}

export function findCity(text: string): CityInfo | undefined {
  const t = norm(text);
  return CITIES.find((c) => c.keywords.some((k) => wordAt(t, k) >= 0));
}

/** Every preset city named in the text, in the order they appear (max 5). */
export function findCities(text: string): CityInfo[] {
  const t = norm(text);
  return CITIES.map((c) => ({ c, at: Math.min(...c.keywords.map((k) => wordAt(t, k)).filter((i) => i >= 0)) }))
    .filter((x) => Number.isFinite(x.at))
    .sort((a, b) => a.at - b.at)
    .map((x) => x.c)
    .slice(0, MAX_CITIES);
}

export function findCountry(text: string): CountryInfo | undefined {
  const t = norm(text).trim();
  return COUNTRIES.find((c) => c.code.toLowerCase() === t || c.keywords.some((k) => wordAt(t, k) >= 0));
}

export const countryInfo = (code: string): CountryInfo | undefined => COUNTRIES.find((c) => c.code === code.toUpperCase());

/** Preset cities of a country, in order (max 5). */
export function countryCities(code: string): CityInfo[] {
  return (countryInfo(code)?.cities ?? [])
    .map((n) => CITIES.find((c) => c.city === n))
    .filter((c): c is CityInfo => !!c)
    .slice(0, MAX_CITIES);
}

/** Accented display name of a stored city ("Bogota" -> "Bogotá"); unknown names come back as they are. */
export function cityLabel(name: string): string {
  return CITIES.find((c) => norm(c.city) === norm(name).trim())?.label ?? name;
}

/** Same city? Preset aliases resolve ("BOGOTA D.C." = "Bogotá"); otherwise accent/case-insensitive equality. */
export function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ca = findCity(a);
  const cb = findCity(b);
  if (ca || cb) return ca === cb;
  return norm(a).trim() === norm(b).trim();
}

/** The cities a hunt runs over: `cities` when set, else the single `city`/`bbox` (older hunts). */
export function huntCities(c: Pick<IcpCriteria, "city" | "bbox" | "cities">): HuntCity[] {
  if (c.cities?.length) return c.cities;
  return [{ name: c.city, ...(c.bbox ? { bbox: c.bbox } : {}) }];
}

/**
 * Canonical multi-city criteria: dedupes, caps at 5, fills preset bboxes, keeps `city`/`bbox` = first city.
 * One city drops `cities` (the exact shape hunts had before multi-city).
 */
export function normalizeCities(c: IcpCriteria): IcpCriteria {
  const seen = new Set<string>();
  const list: HuntCity[] = [];
  for (const x of huntCities(c)) {
    const preset = CITIES.find((p) => norm(p.city) === norm(x.name).trim()) ?? findCity(x.name);
    const key = preset?.city ?? norm(x.name).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const bbox = x.bbox ?? preset?.bbox;
    list.push({ name: preset?.city ?? x.name, ...(bbox ? { bbox } : {}) });
    if (list.length === MAX_CITIES) break;
  }
  const first = list[0] ?? { name: c.city, bbox: c.bbox };
  const rest: IcpCriteria = { ...c };
  delete rest.cities;
  delete rest.scope;
  const base: IcpCriteria = { ...rest, city: first.name };
  if (first.bbox) base.bbox = first.bbox;
  else delete base.bbox;
  if (list.length <= 1) return c.scope === "country" ? { ...base, scope: "country" } : base;
  return { ...base, cities: list, scope: c.scope ?? "cities" };
}

/** Criteria restricted to one city of the hunt (what a source query needs). */
export function criteriaForCity(c: IcpCriteria, city: HuntCity): IcpCriteria {
  const out: IcpCriteria = { ...c, city: city.name, bbox: city.bbox };
  delete out.cities;
  if (!city.bbox) delete out.bbox;
  return out;
}

/** Sets the cities of a criteria from presets ("country" when the whole country was asked for). */
export function withCities(c: IcpCriteria, cities: CityInfo[], scope: "cities" | "country" = "cities"): IcpCriteria {
  if (!cities.length) return c;
  const first = cities[0];
  return normalizeCities({ ...c, city: first.city, country: first.country, language: first.language, cities: cities.map((x) => ({ name: x.city, bbox: x.bbox })), scope });
}

const joinEs = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/** "Bogotá, Medellín y Cali" (summary line of a new hunt). */
export function areaList(c: Pick<IcpCriteria, "city" | "bbox" | "cities">): string {
  return joinEs(huntCities(c).map((x) => cityLabel(x.name)));
}

/** Compact label for lists and sidebar: "Bogotá", "Bogotá +2" or "Colombia (5 ciudades)". Takes raw stored criteria. */
export function areaLabel(c: { city?: unknown; cities?: unknown; scope?: unknown; country?: unknown }): string | null {
  const city = typeof c.city === "string" && c.city ? c.city : null;
  const cities = Array.isArray(c.cities) ? (c.cities as unknown[]).filter((x): x is HuntCity => !!x && typeof (x as HuntCity).name === "string") : [];
  if (c.scope === "country" && typeof c.country === "string") {
    const info = countryInfo(c.country);
    if (info) return cities.length > 1 ? `${info.name} (${cities.length} ciudades)` : info.name;
  }
  if (cities.length > 1) return `${cityLabel(cities[0].name)} +${cities.length - 1}`;
  return city ? cityLabel(city) : null;
}

const SIGNAL_KEYWORDS: Array<{ keywords: string[]; signal: string }> = [
  { keywords: ["agenda", "citas en linea", "reserva"], signal: "agenda en linea" },
  { keywords: ["sitio web", "pagina web", "website"], signal: "sitio web propio" },
  { keywords: ["whatsapp"], signal: "whatsapp" },
];

const EXCLUSION_DEFAULTS: Record<string, string[]> = {
  dental: ["profesional independiente"],
  restaurant: [],
};

export function buildCriteria(sector: SectorMapping, city: CityInfo, text: string): IcpCriteria {
  const t = norm(text);
  return {
    sector: sector.sector,
    ciiu: sector.ciiu,
    osmTags: sector.osmTags,
    placesTypes: sector.placesTypes,
    city: city.city,
    country: city.country,
    bbox: city.bbox,
    signals: SIGNAL_KEYWORDS.filter((s) => s.keywords.some((k) => t.includes(k))).map((s) => s.signal),
    exclusions: EXCLUSION_DEFAULTS[sector.sector] ?? [],
    language: city.language,
  };
}

export interface IcpExample {
  id: string;
  label: string;
  prompt: string;
  criteria: IcpCriteria;
}

function example(id: string, label: string, prompt: string, sector: string, city: string, signals: string[]): IcpExample {
  const criteria = buildCriteria(findSector(sector)!, findCity(city)!, prompt);
  return { id, label, prompt, criteria: { ...criteria, signals } };
}

export const ICP_EXAMPLES: IcpExample[] = [
  example("bogota-dental", "Clinicas dentales en Bogota", "Clinicas dentales en Bogota que tengan sitio web", "dental", "bogota", ["agenda en linea"]),
  example("bogota-restaurantes", "Restaurantes en Bogota", "Restaurantes en Bogota con sitio web propio", "restaurant", "bogota", ["reservas en linea"]),
  example("miami-restaurants", "Restaurants in Miami", "Restaurants in Miami with their own website", "restaurant", "miami", ["online reservations"]),
];

/**
 * Where a free text asks to search: the preset cities it names (in order), or the whole country when it says
 * "Colombia" / "todo el país" without naming a city. Empty when it names nothing known.
 */
export function placesInText(text: string): { cities: CityInfo[]; scope: "cities" | "country" } {
  const named = findCities(text);
  const country = findCountry(text);
  const t = norm(text);
  const wholeCountry = country && (named.length === 0 || wordAt(t, "todo el pais") >= 0 || wordAt(t, "nivel nacional") >= 0);
  if (wholeCountry) return { cities: countryCities(country.code), scope: "country" };
  return { cities: named, scope: "cities" };
}

/**
 * Deterministic parse used by the mock (and as offline fallback): exact example match first,
 * then keyword mapping (several cities or a whole country supported), then an empty "general" ICP.
 */
export function mockIcpCriteria(text: string): IcpCriteria {
  const t = norm(text).replace(/\s+/g, " ").trim();
  const exact = ICP_EXAMPLES.find((e) => norm(e.prompt) === t);
  if (exact) return exact.criteria;
  const sector = findSector(text);
  const places = placesInText(text);
  const city = places.cities[0] ?? CITIES[0];
  const base: IcpCriteria = sector
    ? buildCriteria(sector, city, text)
    : { sector: "general", ciiu: [], osmTags: [], placesTypes: [], city: city.city, country: city.country, bbox: city.bbox, signals: [], exclusions: [], language: city.language };
  return places.cities.length > 1 || places.scope === "country" ? withCities(base, places.cities, places.scope) : base;
}
