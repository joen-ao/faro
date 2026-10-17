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

export type SendWindowPolicy = "ley2300" | "extendida";

/** Team-chosen policy via SEND_WINDOW_POLICY. Default and anything unknown -> the strict Ley 2300 window. */
export function sendWindowPolicy(env: Record<string, string | undefined> = process.env): SendWindowPolicy {
  return env.SEND_WINDOW_POLICY?.trim().toLowerCase() === "extendida" ? "extendida" : "ley2300";
}

/** "extendida": every day, holidays included, 8:00-20:00 America/Bogota (still never at night). */
const EXTENDED_WINDOW: [number, number] = [8, 20];

/**
 * Ley 2300 (adopted voluntarily): CO Mon-Fri 7:00-19:00, Sat 8:00-15:00 (America/Bogota),
 * never Sunday or holiday. US: email only under CAN-SPAM, no time window.
 * With SEND_WINDOW_POLICY=extendida the team opts out of that voluntary rule: daily 8:00-20:00 Bogotá.
 */
export function checkSendWindow(date: Date, country: Country, policy: SendWindowPolicy = sendWindowPolicy()): SendWindowResult {
  if (country === "US") {
    return { allowed: true, reason: "EE. UU.: sin ventana horaria; solo correo con CAN-SPAM", nextAllowedAt: null };
  }
  const t = localParts(date);
  if (policy === "extendida") {
    const [start, end] = EXTENDED_WINDOW;
    const mins = t.hour * 60 + t.minute;
    if (mins < start * 60) return { allowed: false, reason: `Antes de las ${start}:00 (ventana extendida, hora Colombia)`, nextAllowedAt: bogotaInstant(t.iso, start) };
    if (mins > end * 60) return { allowed: false, reason: `Después de las ${end}:00 (ventana extendida, hora Colombia)`, nextAllowedAt: bogotaInstant(addDays(t.iso, 1), start) };
    return { allowed: true, reason: "Dentro de la ventana extendida del equipo (8:00–20:00, todos los días; fuera de la Ley 2300)", nextAllowedAt: null };
  }
  const holiday = HOLIDAYS_CO_2026[t.iso];
  if (holiday) {
    return { allowed: false, reason: `Festivo en Colombia (${holiday}): no se envía`, nextAllowedAt: nextOpening({ ...t, hour: 23 }) };
  }
  const win = SEND_WINDOWS_CO[t.weekday];
  if (!win) {
    return { allowed: false, reason: "Domingo: no se envía", nextAllowedAt: nextOpening({ ...t, hour: 23 }) };
  }
  const [start, end] = win;
  const mins = t.hour * 60 + t.minute;
  if (mins < start * 60) {
    return { allowed: false, reason: `Antes de las ${start}:00 (hora Colombia)`, nextAllowedAt: bogotaInstant(t.iso, start) };
  }
  // The closing hour is allowed through the end of that minute (15:00 ok, 15:01 blocked).
  if (mins > end * 60) {
    return { allowed: false, reason: `Después de las ${end}:00 (hora Colombia)`, nextAllowedAt: nextOpening({ ...t, hour: 23 }) };
  }
  return { allowed: true, reason: "Dentro de la ventana de envío (Colombia)", nextAllowedAt: null };
}
