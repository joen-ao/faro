import { PLACES_ENDPOINT, PLACES_FIELD_MASK, PLACES_LICENSE, PlacesError } from "./types";
import type { PlacesAdapter, PlacesApiCallLogger, PlacesCriteria, PlacesResult, RawPlace } from "./types";
import type { SourceCompany } from "../types";

export const placeUrl = (id: string) => `https://www.google.com/maps/place/?q=place_id:${id}`;

/** `textQuery` from type + city. Throws if there is no business type. */
export function buildTextQuery(c: PlacesCriteria): string {
  if (!c.businessType?.trim()) throw new PlacesError("Places criteria needs a businessType");
  return [c.businessType, c.city].map((s) => s?.trim()).filter(Boolean).join(" ");
}

export function buildRequestBody(c: PlacesCriteria, pageToken?: string): Record<string, unknown> {
  const body: Record<string, unknown> = { textQuery: buildTextQuery(c), pageSize: Math.min(20, Math.max(1, c.pageSize ?? 20)) };
  if (c.bbox) {
    const { south, west, north, east } = c.bbox;
    if (![south, west, north, east].every(Number.isFinite)) throw new PlacesError("Places bbox must be four finite numbers");
    body.locationRestriction = { rectangle: { low: { latitude: south, longitude: west }, high: { latitude: north, longitude: east } } };
  }
  if (pageToken) body.pageToken = pageToken;
  return body;
}

const cleanPhone = (p?: string) => {
  const s = p?.replace(/[^\d+]/g, "");
  return s && /^\+\d{8,15}$/.test(s) ? s : undefined;
};

/** Normalises a place; no reviews and no person names are kept. Permanently closed places are dropped. */
export function toSourceCompany(p: RawPlace, opts: { city?: string; isMock?: boolean } = {}): SourceCompany | null {
  const name = p.displayName?.text?.trim();
  if (!p.id || !name || p.businessStatus === "CLOSED_PERMANENTLY") return null;
  return {
    name,
    address: p.formattedAddress,
    city: opts.city,
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    website: p.websiteUri,
    phone: cleanPhone(p.internationalPhoneNumber),
    externalId: `places:${p.id}`,
    sourceChannel: "google_places",
    sourceUrl: placeUrl(p.id),
    license: PLACES_LICENSE,
    isLegalEntity: false,
    possibleNaturalPerson: false,
    raw: { place_id: p.id, types: (p.types ?? []).join(","), business_status: p.businessStatus ?? "" },
    isMock: opts.isMock ?? false,
  };
}

export interface RealPlacesOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  onApiCall?: PlacesApiCallLogger;
  /** Default max pages when the criteria does not say. */
  maxPages?: number;
}

export function createRealPlaces(opts: RealPlacesOptions): PlacesAdapter {
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    async search(criteria: PlacesCriteria): Promise<PlacesResult> {
      const maxPages = Math.max(1, criteria.maxPages ?? opts.maxPages ?? 2);
      const companies: SourceCompany[] = [];
      let token: string | undefined;
      let calls = 0;
      let latencyMs = 0;
      for (let page = 0; page < maxPages; page++) {
        const body = JSON.stringify(buildRequestBody(criteria, token));
        const t0 = Date.now();
        let status: number | null = null;
        let error: string | null = null;
        try {
          const res = await doFetch(PLACES_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Goog-Api-Key": opts.apiKey, "X-Goog-FieldMask": PLACES_FIELD_MASK },
            body,
          });
          status = res.status;
          if (!res.ok) {
            let detail = "";
            try {
              detail = ((await res.json()) as { error?: { message?: string } }).error?.message ?? "";
            } catch {
              /* no body */
            }
            throw new PlacesError(`Places API ${res.status}${detail ? `: ${detail}` : ""}`, res.status);
          }
          const json = (await res.json()) as { places?: RawPlace[]; nextPageToken?: string };
          calls++;
          for (const p of json.places ?? []) {
            const c = toSourceCompany(p, { city: criteria.city });
            if (c) companies.push(c);
          }
          token = json.nextPageToken;
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
          throw e instanceof PlacesError ? e : new PlacesError(error, status ?? undefined);
        } finally {
          const ms = Date.now() - t0;
          latencyMs += ms;
          await opts.onApiCall?.({ service: "google_places", endpoint: PLACES_ENDPOINT, status, latencyMs: ms, error, costUsd: 0, isMock: false });
        }
        if (!token) break;
      }
      return { companies, calls, latencyMs, isMock: false };
    },
  };
}
