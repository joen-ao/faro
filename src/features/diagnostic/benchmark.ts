import { isRecentYear, type SiteFacts } from "./findings";

/** Minimum peers with an enriched site before showing a percentage. */
export const BENCHMARK_MIN_N = 5;

/** What we know of one peer's website (same hunt, real data only). Names are never carried. */
export interface PeerSite {
  onlineBooking: boolean;
  whatsapp: boolean;
  form: boolean;
  copyrightYear: number | null;
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
  rows: BenchmarkRow[];
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
  peers: PeerSite[],
  opts: { city: string | null; websiteKnown: boolean; now?: Date },
): Benchmark {
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
  return { city: opts.city, rows };
}
