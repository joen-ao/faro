import { and, desc, eq, sql } from "drizzle-orm";
import { HOLIDAYS_CO_2026, SEND_TIMEZONE_CO, SEND_WINDOWS_CO } from "@/config/holidays-co-2026";
import { hunts, icpProfiles, leads, messages } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { checkSendWindow, sendWindowPolicy, type SendWindowSetting } from "@/features/compliance/windows";
import { prettyCity } from "@/features/hunts/ui/format";
import { getSendWindow } from "@/features/settings/send-window";

export interface RecentHunt {
  id: string;
  title: string;
  city: string | null;
  status: string;
  fit: number;
}

export interface SendStatus {
  /** SEND_ENABLED: real sends vs simulated ones. */
  enabled: boolean;
  open: boolean;
  /** Today's hours in Bogotá ("7:00–19:00"), or null when nothing is sent today. */
  hours: string | null;
}

export interface AppShellData {
  /** Real (non-demo) hunts; null when the DB is unavailable. */
  huntCount: number | null;
  /** Real queued messages across hunts; null when the DB is unavailable. */
  queued: number | null;
  /** Contact view of the newest hunt with queued messages, else the hunt list. */
  contactHref: string;
  recent: RecentHunt[];
  send: SendStatus;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function bogotaDay(now: Date): { iso: string; weekday: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: SEND_TIMEZONE_CO, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return { iso: `${p.year}-${p.month}-${p.day}`, weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday as string) };
}

/** Today's send hours for the active setting (America/Bogota), or null when today is closed all day. */
export function todaysHours(setting: SendWindowSetting, now: Date = new Date()): string | null {
  const { iso, weekday } = bogotaDay(now);
  if (setting.policy === "custom") return setting.days.includes(weekday) ? `${setting.startHour}:00–${setting.endHour}:00` : null;
  if (setting.policy === "extendida") return "8:00–20:00";
  const win = HOLIDAYS_CO_2026[iso] ? null : SEND_WINDOWS_CO[weekday];
  return win ? `${win[0]}:00–${win[1]}:00` : null;
}

export function sendStatus(setting: SendWindowSetting, enabled: boolean, now: Date = new Date()): SendStatus {
  return { enabled, open: checkSendWindow(now, "CO", setting).allowed, hours: todaysHours(setting, now) };
}

const sendEnabled = (env: Record<string, string | undefined>) => ["true", "1", "yes"].includes((env.SEND_ENABLED ?? "").trim().toLowerCase());

/**
 * Sidebar data in three aggregated queries (hunts, queue, send window). Demo hunts and demo leads never count.
 * Any DB failure degrades to a sidebar without counts; the send window then falls back to SEND_WINDOW_POLICY.
 */
export async function getAppShellData(db: AppDb | null, env: Record<string, string | undefined> = process.env, now: Date = new Date()): Promise<AppShellData> {
  const enabled = sendEnabled(env);
  const empty: AppShellData = { huntCount: null, queued: null, contactHref: "/app/hunts", recent: [], send: sendStatus({ policy: sendWindowPolicy(env) }, enabled, now) };
  if (!db) return empty;
  try {
    const realLeads = sql<number>`count(${leads.id}) filter (where ${leads.isDemo} = false)`;
    const [rows, queue, win] = await Promise.all([
      db
        .select({
          id: hunts.id,
          status: hunts.status,
          criteria: icpProfiles.criteria,
          fit: sql<number>`count(${leads.id}) filter (where ${leads.isDemo} = false and ${leads.status} <> 'found' and ${leads.status} <> 'disqualified')`.mapWith(Number),
          total: sql<number>`count(*) over ()`.mapWith(Number),
        })
        .from(hunts)
        .innerJoin(icpProfiles, eq(icpProfiles.id, hunts.icpProfileId))
        .leftJoin(leads, eq(leads.huntId, hunts.id))
        .groupBy(hunts.id, icpProfiles.id)
        // Same rule as listHunts: a hunt whose leads are all demo is a DEMO hunt.
        .having(sql`not (${realLeads} = 0 and count(${leads.id}) filter (where ${leads.isDemo} = true) > 0)`)
        .orderBy(desc(hunts.createdAt))
        .limit(3),
      db
        .select({ huntId: leads.huntId, n: sql<number>`count(*)`.mapWith(Number) })
        .from(messages)
        .innerJoin(leads, eq(leads.id, messages.leadId))
        .innerJoin(hunts, eq(hunts.id, leads.huntId))
        .where(and(eq(messages.status, "queued"), eq(leads.isDemo, false)))
        .groupBy(leads.huntId, hunts.createdAt)
        .orderBy(desc(hunts.createdAt)),
      getSendWindow(db, env),
    ]);
    return {
      huntCount: rows[0]?.total ?? 0,
      queued: queue.reduce((a, q) => a + q.n, 0),
      contactHref: queue[0]?.huntId ? `/app/hunts/${queue[0].huntId}/outreach` : "/app/hunts",
      recent: rows.map((r) => {
        const c = (r.criteria ?? {}) as { sector?: unknown; city?: unknown };
        return {
          id: r.id,
          title: typeof c.sector === "string" && c.sector ? capitalize(c.sector) : "Búsqueda",
          city: typeof c.city === "string" && c.city ? prettyCity(c.city) : null,
          status: r.status,
          fit: r.fit,
        };
      }),
      send: sendStatus(win.setting, enabled, now),
    };
  } catch (e) {
    console.error("app shell data unavailable", e);
    return empty;
  }
}
