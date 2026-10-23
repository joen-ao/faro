import { isGoogleMapsUrl } from "@/integrations/apify";

/** Directories, registries, marketplaces and social networks: never the company's own site. */
const NOT_OWN_SITE = [
  "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com", "tiktok.com", "youtube.com", "wa.me", "whatsapp.com",
  "google.com", "google.com.co", "goo.gl", "maps.app.goo.gl", "bing.com", "yahoo.com", "wikipedia.org",
  "rues.org.co", "datos.gov.co", "gov.co", "einforma.co", "empresite.eleconomistaamerica.co", "eleconomistaamerica.co", "informacolombia.com",
  "dateas.com", "emis.com", "dnb.com", "paginasamarillas.com.co", "paginasamarillas.com", "yelp.com", "cylex.com.co", "guiaempresas.co",
  "colombiaempresas.com", "empresas.co", "infoempresas.com.co", "computrabajo.com", "elempleo.com", "indeed.com", "mercadolibre.com.co",
  "tripadvisor.com", "doctoralia.co", "rankia.co", "camaradecomercio.com", "ccb.org.co", "zoominfo.com", "glassdoor.com", "opencorporates.com",
];

/** Legal forms and filler words that never identify the company in a domain. */
const STOP = new Set([
  "sas", "s.a.s", "ltda", "limitada", "sa", "s.a", "sociedad", "compania", "cia", "y", "e", "de", "del", "la", "las", "el", "los", "en",
  "and", "the", "co", "com", "zomac", "bic", "eu", "s", "a", "liquidacion", "sigla",
  // Cities: a domain with the city name says nothing about which company it is.
  "colombia", "bogota", "medellin", "cali", "barranquilla", "cartagena", "bucaramanga", "pereira", "miami",
]);

/** Sector words shared by many companies ("abogados", "asesores"): never enough on their own to match a domain. */
const GENERIC = new Set([
  "abogados", "abogado", "asociados", "asociadas", "asesores", "asesoria", "asesorias", "consultores", "consultoria", "consultorias",
  "consulting", "consultants", "juridica", "juridicas", "juridico", "juridicos", "lawyers", "legal", "law", "contadores", "contable",
  "contables", "contabilidad", "contadores", "servicios", "soluciones", "gestion", "integral", "integrales", "empresarial", "empresariales",
  "inversiones", "group", "grupo", "global", "internacional", "clinica", "clinicas", "dental", "odontologia", "odontologica", "spa",
  "centro", "estetica", "medica", "salud", "comercial", "comercializadora", "distribuidora", "ingenieria", "tecnologia", "digital",
]);

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Distinctive words of the company name (3+ characters, no legal forms, cities or sector words), longest first. */
export function nameTokens(name: string): string[] {
  const words = [...new Set(fold(name).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w) && !GENERIC.has(w)))];
  return words.sort((a, b) => b.length - a.length);
}

/** Country-code TLDs of other countries (".com.ar", ".mx", ".es"…) are someone else; ".co" and generic TLDs are fine. */
const OK_TWO_LETTER = new Set(["co", "io", "ai", "me", "tv"]);
function foreignTld(host: string): boolean {
  const parts = host.split(".");
  return parts.slice(1).some((p) => p.length === 2 && !OK_TWO_LETTER.has(p));
}

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

const blocked = (host: string) => NOT_OWN_SITE.some((d) => host === d || host.endsWith(`.${d}`));

/**
 * Picks the company's own website among search results: the first non-directory, non-social URL whose domain contains a
 * word of the company name ("180 GRADOS CONSULTORIAS" -> 180gradosconsultorias.com). Returns the site root or null.
 * Being strict on purpose: a wrong site would attach someone else's contacts to the company.
 */
export function pickCompanyWebsite(name: string, urls: readonly string[]): string | null {
  const tokens = nameTokens(name);
  if (!tokens.length) return null;
  // The most distinctive word must be in the domain ("THEILYNG LOPEZ ABOGADOS" never matches lopezasociados.net).
  const key = tokens[0]!;
  for (const url of urls) {
    if (isGoogleMapsUrl(url)) continue;
    const host = hostOf(url);
    if (!host || blocked(host) || foreignTld(host)) continue;
    const label = host.split(".")[0]!.replace(/[^a-z0-9]/g, "");
    if (label.includes(key)) return `https://${host}`;
  }
  return null;
}

/** Search query for one company: its registered name plus the city, in quotes-free plain text. */
export function websiteQuery(name: string, city: string | null): string {
  return `${name.replace(/["']/g, " ").replace(/\s+/g, " ").trim()} ${city ?? ""} sitio web`.trim();
}
