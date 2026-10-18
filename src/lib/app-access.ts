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
  if (given && safeEqual(given, evaluatorToken(key))) {
    if (evaluatorMayDo(req)) return null;
    return Response.json({ ok: false, error: "Modo evaluador: solo lectura. Enviar correos, enriquecer con Apify y cambiar la configuración están reservados al equipo." }, { status: 403 });
  }
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

/**
 * Evaluators enter with one click and never see the team key: their cookie holds a token derived from it. They can read
 * everything and try a search; anything that sends messages, spends on Apify or changes settings stays team-only.
 */
export function evaluatorToken(key: string): string {
  return createHash("sha256").update(`faro-evaluator:${key}`).digest("hex");
}

const EVALUATOR_WRITES = [/^\/api\/hunts\/?$/, /^\/api\/hunts\/[^/]+\/run\/?$/, /^\/api\/icp\/(parse|angles)\/?$/, /^\/api\/outreach\/preview\/?$/, /^\/api\/auth\/logout\/?$/];

export function evaluatorMayDo(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD") return true;
  let path = "/";
  try {
    path = new URL(req.url).pathname;
  } catch {
    return false;
  }
  return EVALUATOR_WRITES.some((re) => re.test(path));
}

/** True when the request carries the evaluator token (read-only mode badge). */
export function isEvaluator(cookieHeader: string | null, env: Record<string, string | undefined> = process.env): boolean {
  const key = env.APP_ACCESS_KEY;
  const given = cookieValue(cookieHeader, "faro_key");
  return !!key && !!given && safeEqual(given, evaluatorToken(key));
}
