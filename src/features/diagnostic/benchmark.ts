import { huntCities, sameCity } from "@/features/icp/presets";
import type { HuntCity, IcpCriteria } from "@/features/icp/schema";
import { isRecentYear, type SiteFacts } from "./findings";

/** Minimum peers with an enriched site before showing a percentage. */
export const BENCHMARK_MIN_N = 5;

/** What we know of one peer's website (same hunt, real data only). Names are never carried. */
export interface PeerSite {
  onlineBooking: boolean;
  whatsapp: boolean;
  form: boolean;
  copyrightYear: number | null;
  /** City of the peer inside the hunt (resolved by name, coordinates or the hunt's only city). */
  city?: string | null;
}

export type BenchmarkKey = "booking" | "whatsapp" | "form" | "updated";

export interface BenchmarkRow {
  key: BenchmarkKey;
  label: string;
  /** The clinic itself: true / false, or null when unknown (no reviewed site / no year). */
  you: boolean | null;
  /** Peers with data for this metric. */
  n: number;
  /** Share (0-1) of peers with the practice, null when n < BENCHMARK_MIN_N. */
  pct: number | null;
}

export interface Benchmark {
  city: string | null;
  /** "city": peers of the lead's own city; "hunt": fewer than 5 there (or no city), so the whole hunt. */
  scope: "city" | "hunt";
  rows: BenchmarkRow[];
}

/** Peers of the lead's city when there are at least BENCHMARK_MIN_N of them; otherwise every peer of the hunt. */
export function benchmarkPeers(peers: PeerSite[], city: string | null): { scope: Benchmark["scope"]; peers: PeerSite[] } {
  const local = city ? peers.filter((p) => sameCity(p.city, city)) : [];
  return local.length >= BENCHMARK_MIN_N ? { scope: "city", peers: local } : { scope: "hunt", peers };
}

const LABEL: Record<BenchmarkKey, string> = {
  booking: "Agenda en línea",
  whatsapp: "WhatsApp en el sitio",
  form: "Formulario de contacto",
  updated: "Sitio actualizado",
};

/** Aggregates only: percentages over peers; below the minimum sample the percentage is withheld. */
export function computeBenchmark(
  you: SiteFacts,
  allPeers: PeerSite[],
  opts: { city: string | null; websiteKnown: boolean; now?: Date },
): Benchmark {
  const { scope, peers } = benchmarkPeers(allPeers, opts.city);
  const now = opts.now ?? new Date();
  const s = you.site?.signals;
  // No enriched site: with no website at all the answer is "no"; with a known but unread site it is unknown.
  const none = opts.websiteKnown ? null : false;
  const youVal: Record<BenchmarkKey, boolean | null> = s
    ? {
        booking: s.onlineBooking === true,
        whatsapp: you.whatsappOnSite,
        form: s.hasContactForm === true || you.webFormOnSite,
        updated: isRecentYear(s.copyrightYear, now),
      }
    : { booking: none, whatsapp: none, form: none, updated: none };
  const share = (vals: boolean[]) => ({ n: vals.length, pct: vals.length >= BENCHMARK_MIN_N ? vals.filter(Boolean).length / vals.length : null });
  const metric: Record<BenchmarkKey, boolean[]> = {
    booking: peers.map((p) => p.onlineBooking),
    whatsapp: peers.map((p) => p.whatsapp),
    form: peers.map((p) => p.form),
    updated: peers.flatMap((p) => {
      const r = isRecentYear(p.copyrightYear, now);
      return r === null ? [] : [r];
    }),
  };
  const rows = (Object.keys(LABEL) as BenchmarkKey[]).map((key) => ({ key, label: LABEL[key], you: youVal[key], ...share(metric[key]) }));
  return { city: opts.city, scope, rows };
}

/**
 * City of a company inside its hunt: a hunt city matching its stored city (aliases included), else the hunt city
 * whose bbox contains its coordinates, else the hunt's only city, else its own stored city.
 */
export function resolveHuntCity(company: { city: string | null; lat?: number | null; lng?: number | null }, cities: readonly HuntCity[]): string | null {
  const byName = company.city ? cities.find((c) => sameCity(company.city, c.name)) : undefined;
  if (byName) return byName.name;
  const { lat, lng } = company;
  if (typeof lat === "number" && typeof lng === "number") {
    const inBox = cities.find((c) => c.bbox && lat >= c.bbox[0] && lat <= c.bbox[2] && lng >= c.bbox[1] && lng <= c.bbox[3]);
    if (inBox) return inBox.name;
  }
  if (cities.length === 1) return cities[0].name;
  return company.city;
}

/** Hunt cities from stored (possibly older, single-city) criteria. */
export function storedHuntCities(criteria: unknown): HuntCity[] {
  const c = (criteria ?? {}) as Partial<IcpCriteria>;
  if (Array.isArray(c.cities) && c.cities.length) return c.cities;
  return typeof c.city === "string" && c.city ? huntCities({ city: c.city, bbox: c.bbox }) : [];
}
