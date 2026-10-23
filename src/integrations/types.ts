/** Source channels that produce `SourceCompany` records (subset of SPEC §4 `source_channel`). */
export type SourceChannel = "osm" | "rues" | "reps" | "google_places" | "secop" | "rnt" | "solidaria";

/** Company record normalised across sources, ready for dedupe (F07). Never holds personal names. */
export interface SourceCompany {
  name: string;
  nit?: string;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
  website?: string;
  phone?: string;
  email?: string;
  /** `rues:<nit>`, `reps:<codigo>`, `osm:node/123`. */
  externalId: string;
  sourceChannel: SourceChannel;
  /** Public URL of the record or dataset it came from. */
  sourceUrl: string;
  license: string;
  isLegalEntity: boolean;
  /** Looks like a person's name (e.g. E.U.): "possible natural person / to verify". */
  possibleNaturalPerson: boolean;
  /** Source fields kept for traceability, whitelisted: no personal data. */
  raw: Record<string, string>;
  isMock: boolean;
}
