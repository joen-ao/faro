import { z } from "zod";

/** Finding kinds of the public diagnostic (same ids as `Finding["id"]` in features/diagnostic/findings). */
export const FINDING_KINDS = ["no-website", "whatsapp", "booking", "form", "freshness", "social", "site-unreviewed"] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

export const SERVICE_LIMITS = { name: 80, description: 300, outcome: 200, entryOffer: 120, proof: 200, max: 8, keywords: 12, keyword: 40, note: 200 } as const;

// "Dra. Ana Gómez", "el señor Pérez": a title followed by capitalised words reads as a person -> masked.
const TITLED_PERSON = /\b(?:dr|dra|doctor|doctora|od|odont[oó]log[oa]|sr|sra|se[nñ]or|se[nñ]ora|don|do[nñ]a|ing|lic)\.?\s+(?:[A-ZÁÉÍÓÚÑ][\p{L}'-]+)(?:\s+(?:de\s+(?:la\s+|los\s+)?)?[A-ZÁÉÍÓÚÑ][\p{L}'-]+)*/gu;

/**
 * Cleans free text typed by the team or returned by the model: no tags, URLs, control characters or emails,
 * titled person names masked ("un cliente"), whitespace collapsed and cut to `max` characters.
 */
export function cleanOfferText(input: string | null | undefined, max: number): string {
  return (input ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, " ")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(TITLED_PERSON, "un cliente")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

const required = (max: number, label: string) =>
  z
    .string({ error: `${label} es obligatorio` })
    .transform((s) => cleanOfferText(s, max))
    .pipe(z.string().min(2, `${label} es obligatorio`));

const optional = (max: number) =>
  z
    .string()
    .nullish()
    .transform((s) => cleanOfferText(s, max) || undefined);

/** Stable short id from the name ("Agente de WhatsApp" -> "agente-de-whatsapp"). */
export function serviceIdOf(name: string, taken: ReadonlySet<string> = new Set()): string {
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "servicio";
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  return id;
}

export const Service = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,40}$/)
    .optional(),
  name: required(SERVICE_LIMITS.name, "El nombre"),
  description: required(SERVICE_LIMITS.description, "La propuesta de valor"),
  outcome: required(SERVICE_LIMITS.outcome, "El resultado"),
  entryOffer: optional(SERVICE_LIMITS.entryOffer),
  proof: optional(SERVICE_LIMITS.proof),
  /** Words that tie the service to diagnostic findings ("whatsapp", "agenda", "sin sitio web"). */
  keywords: z
    .array(z.string())
    .nullish()
    .transform((list) => [...new Set((list ?? []).map((k) => cleanOfferText(k, SERVICE_LIMITS.keyword).toLowerCase()).filter(Boolean))].slice(0, SERVICE_LIMITS.keywords)),
});
export type ServiceInput = z.input<typeof Service>;
export type Service = Omit<z.output<typeof Service>, "id"> & { id: string };

/** Gives every service a unique id (keeps valid ids, derives the rest from the name). */
function withIds(list: z.output<typeof Service>[]): Service[] {
  const taken = new Set<string>();
  return list.map((s) => {
    const id = s.id && !taken.has(s.id) ? s.id : serviceIdOf(s.name, taken);
    taken.add(id);
    return { ...s, id };
  });
}

/** The team's catalog ("Mis servicios"): 1 to 8 services. */
export const ServiceCatalog = z
  .array(Service)
  .min(1, "Agrega al menos un servicio")
  .max(SERVICE_LIMITS.max, `Máximo ${SERVICE_LIMITS.max} servicios`)
  .transform(withIds);

/** What app_settings 'services' stores: the services plus an optional catalog note (e.g. monthly maintenance). */
export const CatalogSetting = z.object({
  services: ServiceCatalog,
  note: optional(SERVICE_LIMITS.note),
});
export type CatalogSetting = z.output<typeof CatalogSetting>;

export const ANGLE_MAX = 200;

/** A value angle for one segment: "Clínicas sin WhatsApp pierden pacientes fuera de horario → servicio X". */
export const Angle = z.object({
  text: z
    .string()
    .transform((s) => cleanOfferText(s, ANGLE_MAX))
    .pipe(z.string().min(5)),
  serviceId: z.string().trim().min(1).max(40),
  signal: z.enum(FINDING_KINDS).catch("whatsapp"),
});
export type Angle = z.output<typeof Angle>;

export const Refinement = z.object({
  text: z
    .string()
    .transform((s) => cleanOfferText(s, ANGLE_MAX))
    .pipe(z.string().min(5)),
});
export type Refinement = z.output<typeof Refinement>;

/** What a hunt carries in icp_profiles.offer: the chosen services (snapshot) and the accepted angles. */
export const HuntOffer = z
  .object({
    serviceIds: z.array(z.string().trim().min(1).max(40)).max(SERVICE_LIMITS.max).default([]),
    services: ServiceCatalog,
    angles: z.array(Angle).max(3).default([]),
    refinements: z.array(Refinement).max(2).default([]),
  })
  .transform((o) => {
    const ids = new Set(o.services.map((s) => s.id));
    return {
      serviceIds: o.services.map((s) => s.id),
      services: o.services,
      angles: o.angles.filter((a) => ids.has(a.serviceId)),
      refinements: o.refinements,
    };
  });
export type HuntOffer = z.output<typeof HuntOffer>;

/** Reads a stored hunt offer; anything invalid (or the column null on older hunts) -> null. */
export function parseHuntOffer(raw: unknown): HuntOffer | null {
  if (!raw || typeof raw !== "object") return null;
  const r = HuntOffer.safeParse(raw);
  return r.success ? r.data : null;
}
