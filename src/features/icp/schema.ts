import { z } from "zod";

const strList = z.array(z.string().trim().min(1)).default([]);

export const IcpCriteria = z.object({
  sector: z.string().trim().min(1),
  ciiu: strList,
  osmTags: strList,
  placesTypes: strList,
  city: z.string().trim().min(1),
  country: z.string().trim().length(2).default("CO"),
  /** [south, west, north, east] */
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  size: z.string().trim().min(1).optional(),
  signals: strList,
  exclusions: strList,
  language: z.enum(["es", "en"]).default("es"),
});
export type IcpCriteria = z.infer<typeof IcpCriteria>;

export const DEFAULT_THRESHOLD = 60;
