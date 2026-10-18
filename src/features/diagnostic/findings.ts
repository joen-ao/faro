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

/** "ok" = already working for new patients; "opportunity" = something that may be costing patients; "unknown" = not reviewed. */
export type FindingStatus = "ok" | "opportunity" | "unknown";

/** One card about the clinic's own digital presence: the fact, why it matters for new patients, one fix. */
export interface Finding {
  id: "booking" | "whatsapp" | "form" | "freshness" | "social" | "no-website" | "site-unreviewed";
  status: FindingStatus;
  title: string;
  why: string;
  recommendation: string;
  /** Where the fact was read (the clinic's site). Null when the fact is an absence across our sources. */
  sourceUrl: string | null;
  sourceLabel: string;
  isExample: boolean;
}

/** Facts read from the website enrichment of ONE company (company_sources 'website' + contact_points from the site). */
export interface SiteFacts {
  /** Enriched site (at least one page read), or null when there is none. */
  site: {
    url: string | null;
    isMock: boolean;
    signals: SiteSignals;
  } | null;
  whatsappOnSite: boolean;
  webFormOnSite: boolean;
}

export interface SiteSignals {
  onlineBooking?: boolean;
  noAppointmentForm?: boolean;
  hasContactForm?: boolean;
  copyrightYear?: number | null;
  socialNetworks?: string[];
}

/** Why we wrote: the public registry where the company appears, with its license. */
export interface RegistryNote {
  label: string;
  url: string;
  isExample: boolean;
}

const REGISTRY: Record<string, { label: string; url: string }> = {
  reps: { label: "REPS (Registro Especial de Prestadores de Salud), datos.gov.co", url: "https://www.datos.gov.co/" },
  rues: { label: "RUES (Registro Único Empresarial), datos.gov.co", url: "https://www.datos.gov.co/" },
  google_places: { label: "Google Maps (Places API)", url: "https://maps.google.com/" },
  osm: { label: "OpenStreetMap", url: "https://www.openstreetmap.org/copyright" },
};
const REGISTRY_ORDER = ["reps", "rues", "google_places", "osm"];

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

/** Signals stored by website enrichment; also accepts the legacy F12 fixture shape `{ hasBookingForm }`. */
export function signalsOf(raw: Record<string, unknown>): SiteSignals | null {
  const s = raw.signals;
  if (s && typeof s === "object" && !Array.isArray(s)) return s as SiteSignals;
  if (typeof raw.hasBookingForm === "boolean") return { onlineBooking: raw.hasBookingForm, noAppointmentForm: !raw.hasBookingForm };
  return null;
}

/** A website source counts as enriched when it has signals and at least one page was read (legacy rows lack the count). */
export function isEnrichedSite(src: Pick<SourceInput, "sourceChannel" | "raw">): boolean {
  if (src.sourceChannel !== "website") return false;
  const pages = src.raw.fetchedPages;
  if (typeof pages === "number" && pages <= 0) return false;
  return signalsOf(src.raw) !== null;
}

/** Year the site counts as "updated": copyright of this year or the previous one. */
export function isRecentYear(year: number | null | undefined, now: Date = new Date()): boolean | null {
  if (typeof year !== "number" || !Number.isFinite(year)) return null;
  return year >= now.getFullYear() - 1;
}

const NETWORK_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  twitter: "X (Twitter)",
  x: "X (Twitter)",
  whatsapp: "WhatsApp",
};
const networkName = (n: string) => NETWORK_LABEL[n.toLowerCase()] ?? n.charAt(0).toUpperCase() + n.slice(1);

/** Builds SiteFacts from the stored sources and the site's contact points. */
export function siteFactsFrom(sources: SourceInput[], contacts: { type: string; sourceChannel: string | null }[]): SiteFacts {
  const site = sources.find(isEnrichedSite);
  const fromSite = contacts.filter((c) => c.sourceChannel === "website");
  return {
    site: site ? { url: safeHttpUrl(site.sourceUrl), isMock: site.isMock, signals: signalsOf(site.raw)! } : null,
    whatsappOnSite: !!site && fromSite.some((c) => c.type === "whatsapp"),
    webFormOnSite: !!site && fromSite.some((c) => c.type === "web_form"),
  };
}

/**
 * Cards about the clinic's own website, only from stored enrichment data: no data, no card.
 * Without an enriched site there is a single honest card (no website found, or not reviewed yet).
 */
export function buildFindings(company: CompanyInput, facts: SiteFacts, now: Date = new Date()): Finding[] {
  const site = facts.site;
  if (!site) {
    const known = safeHttpUrl(company.website);
    if (known) {
      return [
        {
          id: "site-unreviewed",
          status: "unknown",
          title: "Todavía no pudimos revisar su sitio web",
          why: "Sin revisarlo no sabemos si un paciente nuevo puede agendar o escribirle desde ahí, que es donde se decide si llama a usted o a otra clínica.",
          recommendation: "Pídanos la revisión por WhatsApp y le contamos qué ajustar en su sitio para recibir más citas.",
          sourceUrl: known,
          sourceLabel: "Sitio web registrado",
          isExample: false,
        },
      ];
    }
    return [
      {
        id: "no-website",
        status: "opportunity",
        title: "No encontramos un sitio web propio",
        why: "Quien busca una clínica en internet compara opciones antes de llamar. Sin una página propia, ese paciente no tiene dónde conocerla ni cómo pedir cita, y elige a otra.",
        recommendation: "Publique una página sencilla con sus servicios, horario, ubicación y un botón para agendar o escribir por WhatsApp.",
        sourceUrl: null,
        sourceLabel: "Registros públicos consultados",
        isExample: false,
      },
    ];
  }

  const s = site.signals;
  const base = { sourceUrl: site.url, sourceLabel: "Su sitio web", isExample: site.isMock };
  const out: Finding[] = [];

  if (s.onlineBooking === true) {
    out.push({
      id: "booking",
      status: "ok",
      title: "Su sitio permite agendar citas en línea",
      why: "Muchos pacientes buscan cita de noche o en fin de semana. Poder reservar en ese momento evita que sigan buscando otra clínica.",
      recommendation: "Ponga el botón de agendar arriba en todas las páginas y confirme la cita por WhatsApp para reducir inasistencias.",
      ...base,
    });
  } else if (s.onlineBooking === false) {
    out.push({
      id: "booking",
      status: "opportunity",
      title: "Su sitio no permite agendar citas en línea",
      why: "Si un paciente nuevo llega fuera del horario de atención y no puede reservar, lo más probable es que pida cita en la siguiente clínica que encuentre.",
      recommendation: "Agregue un botón «Agendar cita» con un calendario en línea o un asistente que tome la solicitud y la confirme por WhatsApp.",
      ...base,
    });
  }

  out.push(
    facts.whatsappOnSite
      ? {
          id: "whatsapp",
          status: "ok",
          title: "Su sitio tiene un enlace a WhatsApp",
          why: "En Colombia WhatsApp es el canal donde los pacientes prefieren escribir. Un clic desde el sitio abre la conversación sin copiar números.",
          recommendation: "Responda en minutos con un mensaje automático de bienvenida y horarios disponibles para no perder al paciente mientras espera.",
          ...base,
        }
      : {
          id: "whatsapp",
          status: "opportunity",
          title: "No encontramos un botón de WhatsApp en su sitio",
          why: "En Colombia WhatsApp es el canal donde los pacientes prefieren escribir. Si tienen que copiar un número o llamar, muchos no lo hacen.",
          recommendation: "Agregue un botón flotante de WhatsApp con un mensaje ya escrito, por ejemplo «Hola, quiero pedir una cita».",
          ...base,
        },
  );

  const hasForm = s.hasContactForm === true || facts.webFormOnSite;
  if (hasForm || s.hasContactForm === false) {
    out.push(
      hasForm
        ? {
            id: "form",
            status: "ok",
            title: "Su sitio tiene formulario de contacto",
            why: "Le permite recibir solicitudes aunque nadie conteste el teléfono en ese momento.",
            recommendation: "Conteste cada formulario el mismo día: la primera clínica que responde suele quedarse con el paciente.",
            ...base,
          }
        : {
            id: "form",
            status: "opportunity",
            title: "Su sitio no tiene formulario de contacto",
            why: "Sin formulario, el paciente que no puede llamar en horario de atención no tiene cómo dejarle sus datos.",
            recommendation: "Agregue un formulario corto (nombre, teléfono, motivo de consulta) que le llegue al correo o al WhatsApp de la clínica.",
            ...base,
          },
    );
  }

  const recent = isRecentYear(s.copyrightYear, now);
  if (recent !== null) {
    out.push(
      recent
        ? {
            id: "freshness",
            status: "ok",
            title: `Su sitio se ve actualizado (© ${s.copyrightYear})`,
            why: "Un sitio con fecha reciente le dice al paciente que la clínica está activa y atendiendo.",
            recommendation: "Mantenga al día precios, horarios y servicios: es lo primero que el paciente compara.",
            ...base,
          }
        : {
            id: "freshness",
            status: "opportunity",
            title: `El pie de su sitio dice © ${s.copyrightYear}`,
            why: "Una fecha vieja hace pensar que el sitio está abandonado y que quizá la información de horarios o servicios ya no es correcta.",
            recommendation: `Actualice el año del pie a ${now.getFullYear()} y revise horarios, servicios y teléfonos.`,
            ...base,
          },
    );
  }

  if (Array.isArray(s.socialNetworks)) {
    const nets = [...new Set(s.socialNetworks.filter((n) => typeof n === "string" && n.trim()).map(networkName))];
    out.push(
      nets.length > 0
        ? {
            id: "social",
            status: "ok",
            title: `Su sitio enlaza sus redes: ${nets.join(", ")}`,
            why: "Las redes muestran casos, opiniones y el día a día de la clínica: ayudan a que un paciente nuevo confíe antes de pedir cita.",
            recommendation: "Agregue en cada red un enlace directo para agendar o escribir por WhatsApp.",
            ...base,
          }
        : {
            id: "social",
            status: "opportunity",
            title: "Su sitio no enlaza redes sociales",
            why: "Muchos pacientes revisan Instagram o Facebook para ver resultados y opiniones antes de escoger clínica.",
            recommendation: "Enlace desde el sitio las redes donde publica y muestre allí casos reales y cómo pedir cita.",
            ...base,
          },
    );
  }

  return out;
}

/** Note "why we wrote to you": the first public registry where the company appears, with its license. */
export function registryNote(sources: SourceInput[]): RegistryNote | null {
  for (const ch of REGISTRY_ORDER) {
    const src = sources.find((s) => s.sourceChannel === ch);
    if (!src) continue;
    const url = safeHttpUrl(src.sourceUrl) ?? REGISTRY[ch]!.url;
    const label = src.license ? `${REGISTRY[ch]!.label} (${src.license})` : REGISTRY[ch]!.label;
    return { label, url, isExample: src.isMock };
  }
  return null;
}
