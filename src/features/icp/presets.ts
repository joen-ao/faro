import type { IcpCriteria } from "./schema";

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
  country: string;
  bbox: [number, number, number, number];
  language: "es" | "en";
  keywords: string[];
}

export const CITIES: CityInfo[] = [
  { city: "Bogota", country: "CO", bbox: [4.45, -74.25, 4.84, -73.99], language: "es", keywords: ["bogota"] },
  { city: "Miami", country: "US", bbox: [25.7, -80.32, 25.86, -80.12], language: "en", keywords: ["miami"] },
];

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function findSector(text: string): SectorMapping | undefined {
  const t = norm(text);
  return SECTOR_MAPPINGS.find((m) => m.keywords.some((k) => t.includes(k)));
}

export function findCity(text: string): CityInfo | undefined {
  const t = norm(text);
  return CITIES.find((c) => c.keywords.some((k) => t.includes(k)));
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
 * Deterministic parse used by the mock (and as offline fallback): exact example match first,
 * then keyword mapping, then an empty "general" ICP.
 */
export function mockIcpCriteria(text: string): IcpCriteria {
  const t = norm(text).replace(/\s+/g, " ").trim();
  const exact = ICP_EXAMPLES.find((e) => norm(e.prompt) === t);
  if (exact) return exact.criteria;
  const sector = findSector(text);
  const city = findCity(text) ?? CITIES[0];
  if (!sector) {
    return { sector: "general", ciiu: [], osmTags: [], placesTypes: [], city: city.city, country: city.country, bbox: city.bbox, signals: [], exclusions: [], language: city.language };
  }
  return buildCriteria(sector, city, text);
}
