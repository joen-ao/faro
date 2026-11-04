/**
 * F43 · Global dashboard filters, read from the URL. Days are Bogotá days (UTC-5, no DST); every period is compared
 * with the previous one of the same length.
 */

export const PERIODS = ["hoy", "ayer", "7", "30", "90", "custom"] as const;
export type Period = (typeof PERIODS)[number];
export const CHANNELS = ["all", "email", "whatsapp", "meta"] as const;
export type ChannelFilter = (typeof CHANNELS)[number];
export const SEGMENTS = ["all", "empresas", "independientes"] as const;
export type SegmentFilter = (typeof SEGMENTS)[number];

export interface DashFilters {
  period: Period;
  /** yyyy-mm-dd (Bogotá), only for `custom`. */
  from: string | null;
  to: string | null;
  channel: ChannelFilter;
  segment: SegmentFilter;
  huntId: string | null;
}

export interface DashWindow {
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  /** Length in Bogotá days (1 for today/yesterday). */
  days: number;
  /** Trend granularity: daily up to 31 days, weekly beyond. */
  bucket: "day" | "week";
  label: string;
  prevLabel: string;
}

const DAY = 86_400_000;
const OFFSET = 5 * 3600_000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : d);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Bogotá midnight (as a UTC instant) of the day containing `d`. */
export function bogotaMidnight(d: Date): Date {
  const local = new Date(d.getTime() - OFFSET);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + OFFSET);
}
/** yyyy-mm-dd of a Bogotá day. */
export const bogotaYmd = (d: Date) => new Date(d.getTime() - OFFSET).toISOString().slice(0, 10);
const ymdMidnight = (s: string) => new Date(`${s}T00:00:00Z`).getTime() + OFFSET;

export function parseFilters(sp: Record<string, string | string[] | undefined>): DashFilters {
  // `range` is the pre-F43 parameter (7/30/90); old links keep working.
  const period = pick(one(sp.periodo) ?? one(sp.range), PERIODS, "30");
  const from = one(sp.desde);
  const to = one(sp.hasta);
  const custom = period === "custom" && from && to && YMD.test(from) && YMD.test(to) && from <= to;
  const hunt = one(sp.busqueda);
  return {
    period: period === "custom" && !custom ? "30" : period,
    from: custom ? from! : null,
    to: custom ? to! : null,
    channel: pick(one(sp.canal), CHANNELS, "all"),
    segment: pick(one(sp.segmento), SEGMENTS, "all"),
    huntId: hunt && UUID.test(hunt) ? hunt : null,
  };
}

/** The filters as URL search params (defaults left out), for links that keep the rest of the selection. */
export function filtersQuery(f: DashFilters, patch: Partial<DashFilters> = {}): string {
  const n = { ...f, ...patch };
  const q = new URLSearchParams();
  if (n.period !== "30") q.set("periodo", n.period);
  if (n.period === "custom" && n.from && n.to) {
    q.set("desde", n.from);
    q.set("hasta", n.to);
  }
  if (n.channel !== "all") q.set("canal", n.channel);
  if (n.segment !== "all") q.set("segmento", n.segment);
  if (n.huntId) q.set("busqueda", n.huntId);
  const s = q.toString();
  return s ? `?${s}` : "";
}

const fmt = (d: Date) => new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short" }).format(d);
const span = (a: Date, b: Date) => {
  const last = new Date(b.getTime() - 1);
  return bogotaYmd(a) === bogotaYmd(last) ? fmt(a) : `${fmt(a)} – ${fmt(last)}`;
};

export function resolveWindow(f: DashFilters, now: Date = new Date()): DashWindow {
  const today = bogotaMidnight(now);
  let from: Date;
  let to: Date;
  let days: number;
  if (f.period === "hoy") {
    from = today;
    to = now;
    days = 1;
  } else if (f.period === "ayer") {
    from = new Date(today.getTime() - DAY);
    to = today;
    days = 1;
  } else if (f.period === "custom" && f.from && f.to) {
    from = new Date(ymdMidnight(f.from));
    to = new Date(Math.min(ymdMidnight(f.to) + DAY, now.getTime()));
    days = Math.max(1, Math.round((ymdMidnight(f.to) + DAY - from.getTime()) / DAY));
  } else {
    days = Number(f.period) || 30;
    // Today counts as one of the N days.
    from = new Date(today.getTime() - (days - 1) * DAY);
    to = now;
  }
  const len = f.period === "hoy" ? now.getTime() - today.getTime() : to.getTime() - from.getTime();
  // "Hoy" compares with yesterday up to the same hour.
  const prevTo = f.period === "hoy" ? new Date(today.getTime() - DAY + len) : from;
  const prevFrom = f.period === "hoy" ? new Date(today.getTime() - DAY) : new Date(from.getTime() - days * DAY);
  const label = f.period === "hoy" ? "Hoy" : f.period === "ayer" ? "Ayer" : f.period === "custom" ? span(from, to) : `Últimos ${days} días`;
  const prevLabel = f.period === "hoy" ? "ayer a esta hora" : f.period === "ayer" ? "el día anterior" : `${span(prevFrom, prevTo)}`;
  return { from, to, prevFrom, prevTo, days, bucket: days > 31 ? "week" : "day", label, prevLabel };
}

/** Presets that have a stored F31 business snapshot. */
export const snapshotRange = (f: DashFilters): 7 | 30 | 90 | null => (f.period === "7" || f.period === "30" || f.period === "90" ? (Number(f.period) as 7 | 30 | 90) : null);
