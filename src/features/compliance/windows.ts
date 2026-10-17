import { HOLIDAYS_CO_2026, SEND_TIMEZONE_CO, SEND_WINDOWS_CO } from "@/config/holidays-co-2026";

export type Country = "CO" | "US";

export interface SendWindowResult {
  allowed: boolean;
  reason: string;
  /** Next instant at which a send is allowed (null when allowed now or no window applies). */
  nextAllowedAt: Date | null;
}

interface LocalParts {
  iso: string; // yyyy-mm-dd
  weekday: number; // 0 = Sunday
  hour: number;
  minute: number;
}

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: SEND_TIMEZONE_CO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function localParts(date: Date): LocalParts {
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    iso: `${p.year}-${p.month}-${p.day}`,
    weekday: WEEKDAYS.indexOf(p.weekday as string),
    hour: Number(p.hour),
    minute: Number(p.minute),
  };
}

/** Bogotá is UTC-5 all year (no DST): local wall time -> instant. */
function bogotaInstant(iso: string, hour: number): Date {
  return new Date(`${iso}T${String(hour).padStart(2, "0")}:00:00-05:00`);
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const weekdayOf = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

/** First allowed instant strictly after the given local moment (or at window start if still ahead today). */
function nextOpening(from: LocalParts): Date {
  let iso = from.iso;
  // Today, if the window has not opened yet.
  const todayWin = HOLIDAYS_CO_2026[iso] ? null : SEND_WINDOWS_CO[from.weekday];
  if (todayWin && from.hour < todayWin[0]) return bogotaInstant(iso, todayWin[0]);
  for (let i = 0; i < 14; i++) {
    iso = addDays(iso, 1);
    const win = HOLIDAYS_CO_2026[iso] ? null : SEND_WINDOWS_CO[weekdayOf(iso)];
    if (win) return bogotaInstant(iso, win[0]);
  }
  /* c8 ignore next */
  throw new Error("No send window found within 14 days");
}

/**
 * Ley 2300 (adopted voluntarily): CO Mon-Fri 7:00-19:00, Sat 8:00-15:00 (America/Bogota),
 * never Sunday or holiday. US: email only under CAN-SPAM, no time window.
 */
export function checkSendWindow(date: Date, country: Country): SendWindowResult {
  if (country === "US") {
    return { allowed: true, reason: "EE. UU.: sin ventana horaria; solo correo con CAN-SPAM", nextAllowedAt: null };
  }
  const t = localParts(date);
  const holiday = HOLIDAYS_CO_2026[t.iso];
  if (holiday) {
    return { allowed: false, reason: `Festivo en Colombia (${holiday}): no se envía`, nextAllowedAt: nextOpening({ ...t, hour: 23 }) };
  }
  const win = SEND_WINDOWS_CO[t.weekday];
  if (!win) {
    return { allowed: false, reason: "Domingo: no se envía", nextAllowedAt: nextOpening({ ...t, hour: 23 }) };
  }
  const [start, end] = win;
  const hm = t.hour + t.minute / 60;
  if (hm < start) {
    return { allowed: false, reason: `Antes de las ${start}:00 (hora Colombia)`, nextAllowedAt: bogotaInstant(t.iso, start) };
  }
  if (hm >= end) {
    return { allowed: false, reason: `Después de las ${end}:00 (hora Colombia)`, nextAllowedAt: nextOpening({ ...t, hour: 23 }) };
  }
  return { allowed: true, reason: "Dentro de la ventana de envío (Colombia)", nextAllowedAt: null };
}
