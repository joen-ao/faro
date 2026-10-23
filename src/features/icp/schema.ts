import { z } from "zod";

const strList = z.array(z.string().trim().min(1)).default([]);

/** Maximum cities in one hunt (each source runs once per city, in sequence). */
export const MAX_CITIES = 5;

/** [south, west, north, east] */
export const Bbox = z
  .tuple([z.number().min(-90).max(90), z.number().min(-180).max(180), z.number().min(-90).max(90), z.number().min(-180).max(180)])
  .refine(([s, w, n, e]) => s < n && w < e, "bbox must satisfy south<north and west<east");

export const HuntCity = z.object({ name: z.string().trim().min(1), bbox: Bbox.optional() });
export type HuntCity = z.infer<typeof HuntCity>;

export const IcpCriteria = z.object({
  sector: z.string().trim().min(1),
  ciiu: strList,
  osmTags: strList,
  placesTypes: strList,
  /** First (or only) city. Kept for backwards compatibility: equals `cities[0].name` whenever `cities` is set. */
  city: z.string().trim().min(1),
  country: z.string().trim().length(2).default("CO"),
  /** Bbox of `city`. */
  bbox: Bbox.optional(),
  /** Several cities (max 5). Absent on single-city hunts (older hunts never have it). Extra cities are dropped. */
  cities: z.preprocess((v) => (Array.isArray(v) ? v.slice(0, MAX_CITIES) : v), z.array(HuntCity).max(MAX_CITIES)).optional(),
  /** "country": the user asked for the whole country (expanded to its main preset cities). */
  scope: z.enum(["cities", "country"]).optional(),
  size: z.string().trim().min(1).optional(),
  signals: strList,
  exclusions: strList,
  /**
   * Words or short phrases (uppercase, accentless) that companies of the sector carry in their registered name or product
   * category: how registries without a usable sector code (SECOP II, RNT, Supersolidaria) are searched. Older hunts lack it.
   */
  /**
   * Include independents (natural persons with a registered business: comerciantes in RUES, independent professionals in
   * REPS, natural-person suppliers in SECOP). They are scored and listed, but never contacted automatically (manual review).
   * Older hunts lack it (companies only).
   */
  includeIndependents: z.boolean().optional(),
  nameKeywords: z.array(z.string().trim().min(2).max(40)).max(10).optional(),
  language: z.enum(["es", "en"]).default("es"),
});
export type IcpCriteria = z.infer<typeof IcpCriteria>;

export const DEFAULT_THRESHOLD = 60;
