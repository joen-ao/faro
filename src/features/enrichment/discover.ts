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
  "grupo", "colombia", "bogota", "medellin", "cali", "and", "the", "co", "com", "zomac", "bic", "eu", "s", "a",
]);

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Words of the company name that can identify it in a domain (4+ letters, no legal forms). */
export function nameTokens(name: string): string[] {
  return [...new Set(fold(name).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)))];
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
  for (const url of urls) {
    if (isGoogleMapsUrl(url)) continue;
    const host = hostOf(url);
    if (!host || blocked(host)) continue;
    const label = host.split(".").slice(0, -1).join("").replace(/[^a-z0-9]/g, "");
    if (tokens.some((t) => label.includes(t))) return `https://${host}`;
  }
  return null;
}

/** Search query for one company: its registered name plus the city, in quotes-free plain text. */
export function websiteQuery(name: string, city: string | null): string {
  return `${name.replace(/["']/g, " ").replace(/\s+/g, " ").trim()} ${city ?? ""} sitio web`.trim();
}
