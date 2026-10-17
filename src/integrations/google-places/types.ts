import type { SourceCompany } from "../types";

export interface PlacesBBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** The slice of `icp_profiles.criteria` this adapter reads. */
export interface PlacesCriteria {
  /** Business type in words, e.g. "clínica dental". */
  businessType?: string;
  city?: string;
  bbox?: PlacesBBox;
  /** Max results per page (Text Search allows 1..20). */
  pageSize?: number;
  /** Max pages to request (each page is one billable call). */
  maxPages?: number;
}

export interface PlacesResult {
  companies: SourceCompany[];
  /** Billable Text Search calls made. */
  calls: number;
  latencyMs: number;
  isMock: boolean;
  /** Set when a later page failed: `companies` and `calls` keep what pages before it returned. */
  error?: string;
}

export interface PlacesApiCall {
  service: "google_places";
  endpoint: string;
  status: number | null;
  latencyMs: number;
  error: string | null;
  costUsd: 0;
  isMock: boolean;
}

export type PlacesApiCallLogger = (call: PlacesApiCall) => void | Promise<void>;

export interface PlacesAdapter {
  search(criteria: PlacesCriteria): Promise<PlacesResult>;
}

/** Subset of a Places API (New) place that we request through the field mask. */
export interface RawPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  types?: string[];
  businessStatus?: string;
}

export class PlacesError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PlacesError";
  }
}

export const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
export const PLACES_LICENSE = "Google Places API — términos de Google Maps Platform";
export const PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.websiteUri",
  "places.internationalPhoneNumber",
  "places.types",
  "places.businessStatus",
  "nextPageToken",
].join(",");
export const PLACES_RATE_KEY = "places_per_call";
