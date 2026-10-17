import { timingSafeEqual } from "node:crypto";

/**
 * Minimal access gate for /app and the internal APIs (SPEC §15: a simple key is enough).
 * APP_ACCESS_KEY via header `x-app-key` or cookie `faro_key`. Without a key configured the app is
 * open outside production and CLOSED in production.
 */
const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

function cookieValue(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export function hasAppAccess(
  input: { headerKey?: string | null; cookieHeader?: string | null },
  env: { APP_ACCESS_KEY?: string | undefined; NODE_ENV?: string | undefined } = process.env,
): boolean {
  const key = env.APP_ACCESS_KEY;
  if (!key) return env.NODE_ENV !== "production";
  const given = input.headerKey ?? cookieValue(input.cookieHeader, "faro_key");
  return !!given && same(given, key);
}

/** Returns a 401 Response when access is denied, otherwise null. */
export function requireAppAccess(req: Request): Response | null {
  const ok = hasAppAccess({ headerKey: req.headers.get("x-app-key"), cookieHeader: req.headers.get("cookie") });
  return ok ? null : Response.json({ error: "Acceso restringido: falta la clave de la app (x-app-key)." }, { status: 401 });
}
