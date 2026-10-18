import { z } from "zod";
import { bestServiceFor, fold, PRIORITY } from "./match";
import { cleanOfferText, ServiceCatalog, type Angle, type FindingKind, type Refinement, type Service } from "./schema";

/** Deterministic pieces of the offer flow: mock replies for the two Claude tasks and the angles fallback (no AI imports). */

export interface AnglesInput {
  criteria: { sector: string; city: string; signals: string[] };
  services: Service[];
}

const SEGMENT: Record<string, string> = { dental: "Clínicas dentales", restaurant: "Restaurantes", general: "Negocios" };
export const segmentOf = (sector: string) => SEGMENT[sector] ?? (sector ? `Negocios de ${cleanOfferText(sector, 60).toLowerCase()}` : "Negocios");

const ANGLE_TEXT: Record<FindingKind, string> = {
  whatsapp: "sin WhatsApp en el sitio pierden clientes que escriben fuera de horario",
  booking: "sin agenda en línea pierden citas de noche y fines de semana",
  "no-website": "sin sitio web propio no aparecen cuando alguien busca en internet",
  freshness: "con el sitio desactualizado transmiten abandono y pierden confianza",
  form: "sin formulario de contacto pierden a quien no puede llamar",
  social: "sin redes enlazadas no muestran casos reales antes de la primera cita",
  "site-unreviewed": "sin revisar su sitio no saben qué les cuesta clientes",
};
const REFINE_TEXT: Partial<Record<FindingKind, string>> = {
  whatsapp: "Prioriza negocios sin WhatsApp en su sitio",
  booking: "Prioriza negocios sin agenda en línea",
  "no-website": "Incluye negocios sin sitio web propio",
  freshness: "Prioriza sitios con el año del pie desactualizado",
  form: "Prioriza sitios sin formulario de contacto",
};

/** Deterministic angles: the first findings (by impact) that some chosen service addresses. Used by the mock and as fallback. */
export function deterministicAngles(input: AnglesInput): { angles: Angle[]; refinements: Refinement[] } {
  const seg = segmentOf(input.criteria.sector);
  const angles: Angle[] = [];
  for (const kind of PRIORITY) {
    if (angles.length === 3) break;
    const s = bestServiceFor(kind, input.services);
    if (!s) continue;
    angles.push({ text: `${seg} ${ANGLE_TEXT[kind]} → ${s.name}`.slice(0, 200), serviceId: s.id, signal: kind });
  }
  if (!angles.length && input.services[0]) {
    angles.push({ text: `${seg} que quieren más clientes nuevos → ${input.services[0].name}`.slice(0, 200), serviceId: input.services[0].id, signal: "site-unreviewed" });
  }
  const refinements = angles
    .map((a) => REFINE_TEXT[a.signal])
    .filter((t): t is string => !!t)
    .slice(0, 2)
    .map((text) => ({ text: text.replace("negocios", seg.toLowerCase()) }));
  return { angles, refinements };
}

const MOCK_SERVICES: { match: string[]; service: z.input<typeof ServiceCatalog>[number] }[] = [
  {
    match: ["whatsapp", "chat", "agente", "bot", "automatiz", "ia "],
    service: {
      name: "Agente de WhatsApp con IA",
      description: "Un agente que responde y agenda por WhatsApp a cualquier hora, con supervisión de su equipo.",
      outcome: "Más citas agendadas fuera de horario, sin contratar más personal.",
      entryOffer: "Demo gratis de 15 minutos por WhatsApp.",
      keywords: ["whatsapp", "agenda", "citas", "respuesta"],
    },
  },
  {
    match: ["web", "sitio", "pagina", "landing", "diseno"],
    service: {
      name: "Sitios web y landing pages",
      description: "Páginas rápidas con servicios, horario, ubicación y un botón para agendar o escribir.",
      outcome: "Un sitio que convierte visitas en clientes.",
      keywords: ["sin sitio web", "sitio desactualizado", "sin formulario"],
    },
  },
  {
    match: ["redes", "marketing", "anuncio", "pauta", "contenido", "instagram"],
    service: {
      name: "Marketing en redes",
      description: "Contenido y anuncios que llevan a conversaciones con clientes reales.",
      outcome: "Más conversaciones de clientes interesados cada mes.",
      keywords: ["redes", "instagram", "contenido"],
    },
  },
  {
    match: ["software", "crm", "sistema", "aplicacion", "app"],
    service: {
      name: "Software a medida",
      description: "Sistemas hechos para cómo trabaja el negocio: seguimiento, agenda y reportes en un solo lugar.",
      outcome: "Menos trabajo manual y procesos ordenados.",
      keywords: ["seguimiento", "agenda", "crm"],
    },
  },
];

/** Deterministic mock reply for `services_suggest`: services whose topic the description mentions. */
export function mockServicesSuggest(description: string): string {
  const t = ` ${fold(description)} `;
  const picked = MOCK_SERVICES.filter((m) => m.match.some((k) => t.includes(k))).map((m) => m.service);
  const services = picked.length
    ? picked
    : [
        {
          name: "Servicio principal",
          description: cleanOfferText(description, 300),
          outcome: "Más clientes nuevos con menos trabajo manual.",
          keywords: [],
        },
      ];
  return JSON.stringify({ services });
}


/** Deterministic mock reply for `offer_angles` (reads the PAYLOAD line of the prompt). */
export function mockOfferAngles(payloadLine: string): string {
  try {
    const p = JSON.parse(payloadLine) as { sector?: string; city?: string; signals?: string[]; services?: unknown[] };
    const services = ServiceCatalog.parse(p.services ?? []);
    return JSON.stringify(deterministicAngles({ criteria: { sector: p.sector ?? "", city: p.city ?? "", signals: p.signals ?? [] }, services }));
  } catch {
    return JSON.stringify({ angles: [], refinements: [] });
  }
}
