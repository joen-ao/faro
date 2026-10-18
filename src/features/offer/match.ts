import type { Angle, FindingKind, Service } from "./schema";

/**
 * Deterministic "which of our services fits this lead, and why" (no AI): the diagnostic findings of the lead
 * are matched to the hunt's services by each service's keywords, its text and the value angles the team accepted.
 */

export interface FindingLike {
  id: string;
  status: "ok" | "opportunity" | "unknown";
}

export interface Recommendation {
  service: Service;
  /** Finding that motivates it; null when the lead has no opportunity we can point to. */
  finding: FindingKind | null;
  /** Short reason after "porque …", e.g. "su sitio no tiene WhatsApp". */
  reason: string;
}

/** Highest impact first: when a lead has several problems, the email mentions only the first one. */
/** Minimum relevance for "Cómo le ayudamos": one keyword hit (2) or an accepted angle (10); loose text overlaps do not count. */
export const HELP_MIN_SCORE = 2;

export const PRIORITY: readonly FindingKind[] = ["no-website", "whatsapp", "booking", "freshness", "form", "social", "site-unreviewed"];

/** Folded trigger fragments per finding kind (matched inside service keywords and service text). */
const TRIGGERS: Record<FindingKind, readonly string[]> = {
  "no-website": ["sin sitio", "sin web", "sin pagina", "sitio", "web", "pagina", "landing", "presencia digital"],
  whatsapp: ["whatsapp", "chat", "mensaj", "conversa", "bot", "respuesta", "responde", "atencion"],
  booking: ["agenda", "agend", "cita", "reserva", "calendario", "turno", "horario", "booking"],
  form: ["formulario", "contacto", "captura", "solicitud", "prospecto"],
  freshness: ["desactualiz", "copyright", "viejo", "rediseno", "moderno", "actualiz", "sitio", "web", "pagina"],
  social: ["redes", "instagram", "facebook", "tiktok", "contenido", "social", "marketing", "anuncio", "pauta"],
  "site-unreviewed": ["auditoria", "diagnostico", "sitio", "web", "seo"],
};

/** "porque …" per finding kind: only facts the diagnostic already shows. */
export const REASON: Record<FindingKind, string> = {
  "no-website": "no encontramos un sitio web propio",
  whatsapp: "su sitio no tiene WhatsApp",
  booking: "su sitio no permite agendar en línea",
  form: "su sitio no tiene formulario de contacto",
  freshness: "su sitio parece desactualizado",
  social: "su sitio no enlaza redes sociales",
  "site-unreviewed": "aún no pudimos revisar su sitio",
};

export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export const isFindingKind = (id: string): id is FindingKind => (PRIORITY as readonly string[]).includes(id);

/** Relevance of a service for a finding kind: accepted angle (10) + 2 per matching keyword + 1 per trigger in its text. */
export function serviceScore(service: Service, kind: FindingKind, angles: readonly Angle[] = []): number {
  const triggers = TRIGGERS[kind];
  const keywordHits = (service.keywords ?? []).filter((k) => triggers.some((t) => fold(k).includes(t))).length;
  const text = fold(`${service.name} ${service.description} ${service.outcome}`);
  const textHits = triggers.filter((t) => text.includes(t)).length;
  const angle = angles.some((a) => a.serviceId === service.id && a.signal === kind) ? 10 : 0;
  return angle + 2 * keywordHits + textHits;
}

/** Best service for one finding kind (ties keep catalog order), or null when none relates to it. */
export function bestServiceFor(kind: FindingKind, services: readonly Service[], angles: readonly Angle[] = []): Service | null {
  let best: Service | null = null;
  let top = 0;
  for (const s of services) {
    const sc = serviceScore(s, kind, angles);
    if (sc > top) {
      top = sc;
      best = s;
    }
  }
  return best;
}

/** Recommended service for a lead from its findings; null only when there are no services. */
export function recommendService(findings: readonly FindingLike[], services: readonly Service[], angles: readonly Angle[] = []): Recommendation | null {
  if (services.length === 0) return null;
  const open = PRIORITY.filter((k) => findings.some((f) => f.id === k && f.status !== "ok"));
  for (const kind of open) {
    const service = bestServiceFor(kind, services, angles);
    if (service) return { service, finding: kind, reason: REASON[kind] };
  }
  const first = open[0] ?? null;
  return { service: services[0]!, finding: first, reason: first ? REASON[first] : "encaja con el perfil de la búsqueda" };
}

/** One line for the Contact list: "Servicio sugerido: X · porque su sitio no tiene WhatsApp". */
export function suggestionLine(r: Recommendation | null): string | null {
  if (!r) return null;
  return `Servicio sugerido: ${r.service.name} · ${r.finding ? `porque ${r.reason}` : r.reason}`;
}

/** The fact behind each finding, as a full clause for the email ("Revisamos …: <fact>."). */
export const FACT: Record<FindingKind, string> = {
  "no-website": "no encontramos un sitio web propio de su empresa",
  whatsapp: "su sitio no tiene un botón de WhatsApp",
  booking: "su sitio no permite agendar en línea",
  form: "su sitio no tiene formulario de contacto",
  freshness: "el pie de su sitio muestra un año viejo",
  social: "su sitio no enlaza sus redes sociales",
  "site-unreviewed": "aún no pudimos revisar su sitio",
};

export const LEAD_IN: Record<FindingKind, string> = {
  "no-website": "Para que quien la busca en internet la encuentre y pueda contactarla",
  whatsapp: "Para que quien llega a su sitio le escriba por WhatsApp y reciba respuesta a cualquier hora",
  booking: "Para que puedan agendar a cualquier hora, sin esperar a que alguien conteste",
  form: "Para no perder a quien no puede llamar en horario de atención",
  freshness: "Para que su sitio muestre que el negocio está activo y al día",
  social: "Para que sus redes lleven a conversaciones y citas",
  "site-unreviewed": "Para saber qué ajustar primero en su sitio",
};

const sentence = (s: string) => (/[.!?…]$/.test(s) ? s : `${s}.`);
const lcFirst = (s: string) => (s && !/^[A-ZÁÉÍÓÚÑ]{2}/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/**
 * "Cómo le ayudamos" for one finding: a fixed template per finding kind that names the service and its outcome.
 * Null when there are no services (the page then stays as before).
 */
export function howWeHelp(findingId: string, services: readonly Service[], angles: readonly Angle[] = []): string | null {
  if (!services.length || !isFindingKind(findingId)) return null;
  // Only when a service really relates to the finding (a keyword or an accepted angle); never a forced match.
  const service = bestServiceFor(findingId, services, angles);
  if (!service || serviceScore(service, findingId, angles) < HELP_MIN_SCORE) return null;
  return `${LEAD_IN[findingId]}: ${service.name}. Resultado: ${sentence(lcFirst(service.outcome))}`;
}
