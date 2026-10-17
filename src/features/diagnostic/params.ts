import { z } from "zod";

/** Allowed values (SPEC §4). Anything else in the query string is dropped, never stored. */
export const CONTACT_CHANNELS = ["email", "web_form", "whatsapp", "dapta_widget"] as const;
export const SOURCE_CHANNELS = ["osm", "rues", "reps", "google_places", "website", "meta_ads", "sample"] as const;
export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

const utmValue = z.string().trim().min(1).max(80).regex(/^[\w\-.~+ ]+$/);

export const trackingSchema = z.object({
  c: z.enum(CONTACT_CHANNELS).optional(),
  s: z.enum(SOURCE_CHANNELS).optional(),
  utm: z.record(z.enum(UTM_KEYS), utmValue).optional(),
});
export type Tracking = z.infer<typeof trackingSchema>;

type RawQuery = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Lenient parse: each invalid field is ignored on its own so one bad value does not lose the rest. */
export function parseTracking(query: RawQuery): Tracking {
  const out: Tracking = {};
  const c = z.enum(CONTACT_CHANNELS).safeParse(first(query.c));
  if (c.success) out.c = c.data;
  const s = z.enum(SOURCE_CHANNELS).safeParse(first(query.s));
  if (s.success) out.s = s.data;
  const utm: Record<string, string> = {};
  for (const k of UTM_KEYS) {
    const v = utmValue.safeParse(first(query[k]));
    if (v.success) utm[k] = v.data;
  }
  // Meta appends `fbclid` to ad clicks: treat it as utm_source=meta (the raw click id is never stored).
  if (!utm.utm_source && first(query.fbclid)?.trim()) utm.utm_source = "meta";
  if (Object.keys(utm).length) out.utm = utm;
  return out;
}
