export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface OverpassQuery {
  /** OSM tag filters; results are the union of all filters. */
  tags: Array<Record<string, string>>;
  bbox: BBox;
  /** Overpass server-side timeout in seconds. */
  timeoutSec?: number;
}

/** A business-like OSM element (node or way) normalised for Faro. */
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

export interface OverpassResult {
  places: OsmPlace[];
  latencyMs: number;
  endpoint: string;
  fromCache: boolean;
  /** True when the data comes from the mock adapter. */
  isMock: boolean;
}

export interface OverpassAdapter {
  search(query: OverpassQuery): Promise<OverpassResult>;
}

export const OSM_ATTRIBUTION = "© OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)";
