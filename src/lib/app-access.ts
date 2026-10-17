import { timingSafeEqual, createHash } from "node:crypto";

/** Constant-time string comparison (hashes first so lengths do not leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function cookieValue(header: string | null, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) try {
        return decodeURIComponent(v.join("="));
      } catch {
        return undefined;
      }
  }
  return undefined;
}

/**
 * Simple access gate for /app and its APIs: `APP_ACCESS_KEY` via header `x-app-key` or cookie `faro_key`.
 * Without a configured key: allowed outside production (local dev), denied in production.
 * Returns a 401 Response when access is denied, or null when allowed.
 */
export function requireAppAccess(req: Request, env: Record<string, string | undefined> = process.env): Response | null {
  const key = env.APP_ACCESS_KEY;
  if (!key) {
    if (env.NODE_ENV !== "production") return null;
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const given = req.headers.get("x-app-key") ?? cookieValue(req.headers.get("cookie"), "faro_key");
  if (given && safeEqual(given, key)) return null;
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}
