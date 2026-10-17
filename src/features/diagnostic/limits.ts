/** In-memory fixed-window rate limiter (enough for a single-instance hackathon deploy). */
export function createLimiter(max: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return {
    /** True when the call is allowed (and counted). */
    allow(key: string, now: number = Date.now()): boolean {
      if (hits.size > 5000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
      const cur = hits.get(key);
      if (!cur || cur.reset <= now) {
        hits.set(key, { n: 1, reset: now + windowMs });
        return true;
      }
      cur.n += 1;
      return cur.n <= max;
    },
  };
}

export const MAX_BODY_BYTES = 16 * 1024;

export function clientIp(req: Request): string {
  // The first X-Forwarded-For entry is client-controlled; trust x-real-ip (set by the proxy) or the LAST entry (appended by the nearest proxy).
  const parts = req.headers.get("x-forwarded-for")?.split(",").map((x) => x.trim()).filter(Boolean);
  return req.headers.get("x-real-ip") || parts?.[parts.length - 1] || "local";
}

/** Reads a JSON body capped at 16 KB. Returns "too_large" or "bad_json" on failure. */
export async function readJsonCapped(req: Request): Promise<{ ok: true; json: unknown } | { ok: false; error: "too_large" | "bad_json" }> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return { ok: false, error: "too_large" };
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) return { ok: false, error: "too_large" };
  try {
    return { ok: true, json: JSON.parse(text) };
  } catch {
    return { ok: false, error: "bad_json" };
  }
}

/** Demo seeding and the demo-only events read: dev/test only, never in production unless the e2e build opts in. */
export function demoToolsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.FARO_SEED_DEMO === "1" && (env.NODE_ENV !== "production" || env.FARO_E2E === "1");
}
