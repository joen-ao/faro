export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface OverpassQuery {
  /** OSM tag filters; results are the union of all filters. */
  tags: Array<Record<string, string>>;
  /** Explicit bounding box. Takes precedence over `city`. */
  bbox?: BBox;
  /** City name: resolved to a known bbox, otherwise to an Overpass `area` by name. */
  city?: string;
  /** Overpass server-side timeout in seconds. */
  timeoutSec?: number;
  /** Default country (ISO-2) used to normalise phone numbers. Default `CO`. */
  country?: string;
}

/** The slice of `icp_profiles.criteria` this adapter reads. Tags look like `amenity=dentist`, `shop`, `cuisine=*`. */
export interface OverpassCriteria {
  tags?: string[];
  bbox?: BBox;
  city?: string;
  country?: string;
}

/** A business-like OSM element (node or way) in raw-ish form. Kept for the coverage test. */
export interface OsmPlace {
  /** e.g. `node/123` or `way/456`. */
  id: string;
  name?: string;
  lat?: number;
  lng?: number;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  tags: Record<string, string>;
}

/** Source-agnostic company candidate. Every source adapter (OSM, Places, ...) normalises to this. */
export interface SourceCompany {
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  city?: string;
  website?: string;
  /** E.164 (e.g. `+573101234567`) or undefined when it cannot be normalised reliably. */
  phone?: string;
  email?: string;
  /** e.g. `osm:node/123`. */
  externalId: string;
  /** e.g. `https://www.openstreetmap.org/node/123`. */
  sourceUrl: string;
  license: string;
  sourceChannel: "osm";
  /** false when the name was masked (a person inside the name): never contactable. Default true. */
  isLegalEntity?: boolean;
  /** Mock/fixture data; never counted as real. */
  isMock: boolean;
  raw: Record<string, unknown>;
}

export interface OverpassResult {
  places: OsmPlace[];
  companies: SourceCompany[];
  latencyMs: number;
  endpoint: string;
  fromCache: boolean;
  /** True when the data comes from the mock adapter. */
  isMock: boolean;
}

/** One real network attempt, to be written to `api_calls` by the caller. Cost is always 0 for Overpass. */
export interface ApiCallRecord {
  service: "overpass";
  endpoint: string;
  status: number | null;
  latencyMs: number;
  error: string | null;
  costUsd: 0;
  isMock: false;
}

export type ApiCallLogger = (call: ApiCallRecord) => void | Promise<void>;

export interface OverpassAdapter {
  search(query: OverpassQuery): Promise<OverpassResult>;
}

export const OSM_LICENSE = "ODbL 1.0 © OpenStreetMap contributors";
export const OSM_ATTRIBUTION = "© OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)";
