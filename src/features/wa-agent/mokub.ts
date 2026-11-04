import { z } from "zod";
import { getEnv, type Env } from "@/lib/env";

/** F44 · mokub.co agent endpoints (same calendar as the website). The key travels in the path, never in logs. */
export interface MokubBooking {
  readonly isMock: boolean;
  availability(q: { date?: string; tz?: string; whatsapp: string }): Promise<Record<string, unknown>>;
  book(b: BookingInput): Promise<Record<string, unknown>>;
}

export const BookingInput = z.object({
  nombre: z.string().trim().min(2).max(60),
  email: z.string().trim().email().max(200),
  whatsapp: z.string().trim().min(7).max(40),
  empresa: z.string().trim().min(1).max(160),
  interes: z.enum(["agentes", "automatizacion", "rag", "software", "web", "no_se"]),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora: z.string().regex(/^\d{2}:\d{2}$/),
  tz: z.string().trim().max(64).optional(),
});
export type BookingInput = z.infer<typeof BookingInput>;

type Fetch = typeof fetch;

export function createRealMokubBooking(opts: { baseUrl: string; key: string; fetch?: Fetch }): MokubBooking {
  const doFetch = opts.fetch ?? fetch;
  const base = `${opts.baseUrl.replace(/\/+$/, "")}/api/agent/${encodeURIComponent(opts.key)}`;
  async function call(path: string, init: RequestInit): Promise<Record<string, unknown>> {
    const res = await doFetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(15_000) });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    // Mokub always answers JSON ({ ok, error, mensaje, … }); anything else is a failure the agent can explain.
    return json && typeof json === "object" ? json : { ok: false, error: "error", mensaje: `HTTP ${res.status}` };
  }
  return {
    isMock: false,
    availability: (q) => {
      const p = new URLSearchParams({ whatsapp: q.whatsapp, tz: q.tz || "America/Bogota", ...(q.date ? { date: q.date } : {}) });
      return call(`/availability?${p}`, { method: "GET" });
    },
    book: (b) => call("/book", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }),
  };
}

/** Fixed afternoon slots on the next weekdays; the first slot of every day is "taken" to exercise slot_taken. */
export function createMockMokubBooking(now: () => Date = () => new Date()): MokubBooking & { booked: BookingInput[] } {
  const SLOTS = ["16:00", "16:20", "17:00", "18:00", "19:20"];
  const booked: BookingInput[] = [];
  const nextDays = (n: number) => {
    const out: string[] = [];
    const d = new Date(now());
    while (out.length < n) {
      d.setUTCDate(d.getUTCDate() + 1);
      const wd = d.getUTCDay();
      if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
    }
    return out;
  };
  return {
    isMock: true,
    booked,
    async availability(q) {
      if (q.date) return { ok: true, date: q.date, tz: q.tz || "America/Bogota", slots: SLOTS };
      return { ok: true, tz: q.tz || "America/Bogota", days: nextDays(3).map((date) => ({ date, slots: SLOTS })) };
    },
    async book(b) {
      if (b.hora === "16:00") return { ok: false, error: "slot_taken", mensaje: "Esa hora ya no está libre.", slots: SLOTS.slice(1) };
      booked.push(b);
      return { ok: true, when: `${b.fecha}, ${b.hora} (Bogotá)`, meetLink: null };
    },
  };
}

export function getMokubBooking(env: Pick<Env, "WA_AGENT_MODE" | "MOKUB_AGENT_KEY" | "MOKUB_AGENT_BASE_URL"> = getEnv()): MokubBooking {
  if (env.WA_AGENT_MODE !== "real" || !env.MOKUB_AGENT_KEY) return createMockMokubBooking();
  return createRealMokubBooking({ baseUrl: env.MOKUB_AGENT_BASE_URL, key: env.MOKUB_AGENT_KEY });
}
