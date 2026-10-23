import { findSector } from "@/features/icp/presets";
import type { IcpCriteria } from "@/features/icp/schema";
import { DENTAL_NAME_KEYWORDS } from "@/integrations/socrata/datasets";

/** Words too broad to identify a sector in a company name ("servicios", "asesorías", "empresas"...). First 5 letters. */
const BROAD = new Set([
  "SERVI", "EMPRE", "NEGOC", "FIRMA", "ASESO", "CONSU", "CENTR", "GRUPO", "PEQUE", "MEDIA", "COMER", "PROFE", "ESPEC", "GENER",
  "INTEG", "SOLUC", "OTROS", "TODAS", "TODOS", "COLOM", "BOGOT", "SECTO", "INDUS", "PRODU", "ACTIV", "ATENC", "CLIEN", "PERSO",
]);

/**
 * Sector words to search inside company names in registries without a usable sector code (SECOP II, RNT,
 * Supersolidaria). Presets use their verified words; otherwise the first 5 letters of each long word of the sector
 * ("Contabilidad y asesoría tributaria" -> CONTA, TRIBU). At most 4 words, uppercase and accentless.
 */
export function sectorNameKeywords(c: Pick<IcpCriteria, "sector" | "nameKeywords">): string[] {
  const preset = findSector(c.sector)?.sector;
  // Words Claude proposed for this sector (how these companies are named), then the ones derived from the sector text.
  const fromModel = (c.nameKeywords ?? [])
    .map((k) => k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim())
    .filter((k) => (k.length >= 3 || /\d/.test(k)) && k.length <= 40 && !(k.split(" ").length === 1 && BROAD.has(k.slice(0, 5))));
  if (fromModel.length) return [...new Set([...fromModel, ...derived(c, preset)])].slice(0, 8);
  return derived(c, preset);
}

function derived(c: Pick<IcpCriteria, "sector">, preset: string | undefined): string[] {
  // "SONRIS"/"SMILE" are fine inside REPS (health only) but match kindergartens and funds in general registries.
  if (preset === "dental") return DENTAL_NAME_KEYWORDS.filter((k) => k !== "SONRIS" && k !== "SMILE");
  if (preset === "restaurant") return ["RESTAURA", "COMIDA", "GASTRO"];
  const words = c.sector
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter((w) => w.length >= 5)
    .map((w) => w.slice(0, 5))
    .filter((w) => !BROAD.has(w));
  return [...new Set(words)].slice(0, 4);
}

/** RNT (Registro Nacional de Turismo) only lists tourism businesses. */
export function isTourismSector(sector: string): boolean {
  const s = sector.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return /turis|hotel|hostal|hosped|alojam|agencia(s)? de viaje|viajes|gastronom|restaurant|\bbar(es)?\b|guia(s)? de turismo|eventos|convenciones/.test(s);
}
