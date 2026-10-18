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
/** Aggregate context computed from the same public data (never other companies' names). */
export interface FindingContext {
  /** Companies of the same search (same sector and city) found in public sources. */
  peers?: { count: number; city: string | null } | null;
  /** The company's site shows a WhatsApp link (from website enrichment). */
  whatsappOnSite?: boolean;
  now?: Date;
}

export const MAX_FINDINGS = 5;

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
const PRIORITY = ["reps", "rues", "website", "google_places", "osm"];
const rank = (c: string) => {
  const i = PRIORITY.indexOf(c);
  return i === -1 ? PRIORITY.length : i;
};

interface Signals {
  onlineBooking?: boolean;
  noAppointmentForm?: boolean;
  hasContactForm?: boolean;
  copyrightYear?: number | null;
}

function signalsOf(raw: Record<string, unknown>): Signals | null {
  const s = raw.signals;
  if (s && typeof s === "object") return s as Signals;
  // Legacy shape (F12 fixtures): { hasBookingForm }.
  if (typeof raw.hasBookingForm === "boolean") return { onlineBooking: raw.hasBookingForm, noAppointmentForm: !raw.hasBookingForm };
  return null;
}

/**
 * Up to 5 public findings, each with a linked source: where the company is registered, what its own website
 * shows (booking, contact, freshness, WhatsApp) and how many peers the same public search found. Facts only come
 * from stored source data; a finding without a usable source URL is dropped. No personal data is read.
 */
export function buildFindings(company: CompanyInput, sources: SourceInput[], ctx: FindingContext = {}): Finding[] {
  const ordered = [...sources].sort((a, b) => rank(a.sourceChannel) - rank(b.sourceChannel));
  const out: Finding[] = [];
  const add = (f: Finding) => {
    if (out.length < MAX_FINDINGS && !out.some((x) => x.id === f.id)) out.push(f);
  };
  const labelOf = (src: SourceInput) => {
    const fb = FALLBACK[src.sourceChannel];
    const base = fb?.label.split(" (")[0] ?? src.sourceChannel;
    return src.license ? `${base} (${src.license})` : (fb?.label ?? src.sourceChannel);
  };
  const urlOf = (src: SourceInput) =>
    safeHttpUrl(src.sourceUrl) ?? safeHttpUrl(FALLBACK[src.sourceChannel]?.url) ?? safeHttpUrl(company.website);

  const registry = ordered.find((s) => (s.sourceChannel === "reps" || s.sourceChannel === "rues") && urlOf(s));
  const site = ordered.find((s) => s.sourceChannel === "website" && urlOf(s));
  const sig = site ? signalsOf(site.raw) : null;
  const sitePages = site ? num(site.raw.fetchedPages) : null;

  for (const src of ordered) {
    const url = urlOf(src);
    if (!url) continue;
    const base = { sourceLabel: labelOf(src), sourceUrl: url, isExample: src.isMock };
    const ch = src.sourceChannel;
    if (ch === "reps") add({ id: "reps", text: "Aparece en el REPS como prestador de salud habilitado.", ...base });
    else if (ch === "rues") add({ id: "rues", text: "Figura en el RUES como persona jurídica con matrícula mercantil activa.", ...base });
    else if (ch === "website" && sig) {
      if (sig.onlineBooking === true) add({ id: "web-booking", text: "Su sitio web ya permite agendar citas en línea.", ...base });
      else if (sig.noAppointmentForm === true)
        add({
          id: "web-booking",
          text: sig.hasContactForm
            ? "Su sitio web tiene formulario de contacto, pero no permite agendar citas en línea: cada paciente nuevo depende de que alguien responda."
            : "Su sitio web no permite agendar citas en línea ni tiene formulario: los pacientes nuevos tienen que llamar o escribir.",
          ...base,
        });
      if (ctx.whatsappOnSite === false && sitePages !== 0)
        add({ id: "web-whatsapp", text: "No encontramos un botón de WhatsApp en su sitio web, el canal que más usan los pacientes en Colombia.", ...base });
      const year = typeof sig.copyrightYear === "number" ? sig.copyrightYear : null;
      const thisYear = (ctx.now ?? new Date()).getFullYear();
      if (year && year <= thisYear - 2) add({ id: "web-year", text: `El pie de su sitio web dice © ${year}: puede dar la impresión de estar desactualizado.`, ...base });
    } else if (ch === "google_places") {
      const n = num(src.raw.userRatingCount);
      add({ id: "google_places", text: n !== null ? `Tiene ${n} reseñas públicas en Google Maps.` : "Tiene ficha pública en Google Maps.", ...base });
    } else if (ch === "osm") {
      const where = company.address ?? company.city;
      add({ id: "osm", text: where ? `Está registrada en OpenStreetMap en ${where}.` : "Está registrada en OpenStreetMap.", ...base });
    }
  }

  // No website anywhere in the public sources we checked.
  if (!company.website && !site && registry) {
    add({
      id: "no-website",
      text: "No encontramos un sitio web de la empresa en los registros públicos que consultamos: quien la busca en internet no llega a una página propia.",
      sourceLabel: labelOf(registry),
      sourceUrl: urlOf(registry)!,
      isExample: registry.isMock,
    });
  }

  // How crowded the market is, from the same public search (aggregate count only).
  if (ctx.peers && ctx.peers.count > 1 && registry) {
    const where = ctx.peers.city ? ` en ${ctx.peers.city}` : "";
    add({
      id: "peers",
      text: `En fuentes públicas encontramos ${ctx.peers.count.toLocaleString("es-CO")} empresas de su mismo sector${where}: destacar ante un paciente nuevo depende de responderle rápido.`,
      sourceLabel: "OpenStreetMap, REPS y RUES (datos públicos)",
      sourceUrl: "https://www.datos.gov.co/",
      isExample: registry.isMock,
    });
  }
  return out;
}
