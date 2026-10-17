import { safeEqual } from "@/lib/app-access";

export const SESSION_COOKIE = "faro_key";
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 7;

/** Only same-site paths under /app are valid post-login destinations (no open redirects). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/app") || next.startsWith("//") || next.includes("\\") || next.startsWith("/app/login")) {
    return "/app/dashboard";
  }
  return next;
}

export function checkLoginKey(given: string, env: Record<string, string | undefined> = process.env): boolean {
  const key = env.APP_ACCESS_KEY;
  if (!key || !given) return false;
  return safeEqual(given, key);
}

const attempts = new Map<string, { n: number; since: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

/** In-memory brute-force guard per client (per serverless instance; enough for a team-only key). */
export function allowLoginAttempt(clientId: string, now = Date.now()): boolean {
  const a = attempts.get(clientId);
  if (!a || now - a.since > WINDOW_MS) {
    attempts.set(clientId, { n: 1, since: now });
    return true;
  }
  a.n += 1;
  return a.n <= MAX_ATTEMPTS;
}

export function resetLoginAttempts(): void {
  attempts.clear();
}
