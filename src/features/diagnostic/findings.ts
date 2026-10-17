export interface SourceInput {
  sourceChannel: string;
  sourceUrl: string | null;
  license: string | null;
  isMock: boolean;
  raw: Record<string, unknown>;
}
export interface CompanyInput {
  name: string;
  address: string | null;
  city: string | null;
  website: string | null;
}
export interface Finding {
  id: string;
  text: string;
  sourceLabel: string;
  sourceUrl: string;
  isExample: boolean;
}

export const MAX_FINDINGS = 3;

const FALLBACK: Record<string, { label: string; url: string }> = {
  osm: { label: "OpenStreetMap (ODbL)", url: "https://www.openstreetmap.org/copyright" },
  reps: { label: "REPS, datos.gov.co (CC BY-SA 4.0)", url: "https://www.datos.gov.co/" },
  rues: { label: "RUES, datos.gov.co (CC BY-SA 4.0)", url: "https://www.datos.gov.co/" },
  google_places: { label: "Google Maps (Places API)", url: "https://maps.google.com/" },
  website: { label: "Sitio web público de la empresa", url: "" },
};

/** Only http(s) URLs are ever linked (blocks javascript: and data: from stored source data). */
export function safeHttpUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);
const PRIORITY = ["reps", "rues", "google_places", "website", "osm"];
const rank = (c: string) => {
  const i = PRIORITY.indexOf(c);
  return i === -1 ? PRIORITY.length : i;
};

/**
 * Up to 3 public findings, each with a linked source. Facts only come from stored source data;
 * a finding without a usable source URL is dropped. No personal data is read.
 */
export function buildFindings(company: CompanyInput, sources: SourceInput[]): Finding[] {
  const ordered = [...sources].sort((a, b) => rank(a.sourceChannel) - rank(b.sourceChannel));
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const src of ordered) {
    if (out.length >= MAX_FINDINGS) break;
    const ch = src.sourceChannel;
    if (seen.has(ch)) continue;
    const fb = FALLBACK[ch];
    const url = safeHttpUrl(src.sourceUrl) ?? safeHttpUrl(fb?.url) ?? safeHttpUrl(company.website);
    if (!url) continue;
    const base = fb?.label.split(" (")[0] ?? ch;
    const label = src.license ? `${base} (${src.license})` : (fb?.label ?? ch);
    let text: string | null = null;
    if (ch === "reps") text = "Aparece en el REPS como prestador de salud habilitado.";
    else if (ch === "rues") text = "Figura en el RUES como persona jurídica con matrícula mercantil activa.";
    else if (ch === "osm") {
      const where = company.address ?? company.city;
      text = where ? `Está registrada en OpenStreetMap en ${where}.` : "Está registrada en OpenStreetMap.";
    } else if (ch === "google_places") {
      const n = num(src.raw.userRatingCount);
      text = n !== null ? `Tiene ${n} reseñas públicas en Google Maps.` : "Tiene ficha pública en Google Maps.";
    } else if (ch === "website") {
      if (src.raw.hasBookingForm === false) text = "Su sitio web no muestra un formulario para agendar citas.";
      else if (src.raw.hasBookingForm === true) text = "Su sitio web permite agendar citas en línea.";
    }
    if (!text) continue;
    seen.add(ch);
    out.push({ id: ch, text, sourceLabel: label, sourceUrl: url, isExample: src.isMock });
  }
  return out;
}
